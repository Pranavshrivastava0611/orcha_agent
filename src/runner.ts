import { StateGraph, MessagesAnnotation, START, END } from '@langchain/langgraph'
import { ToolNode } from '@langchain/langgraph/prebuilt'
import { ChatGroq } from '@langchain/groq'
import { tool } from '@langchain/core/tools'
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres'
import { z } from 'zod'
import { getToolsForAgent, toAnthropicTool } from './registry/registry'
import { executeTool } from './executors'
import { runLogQueries } from './db/queries'
import { agentQueries } from './db/queries'
import type { Tool } from './db/schema'

// Checkpointer — persists full conversation state to Postgres
// Call setup() once on server startup
export const checkpointer = PostgresSaver.fromConnString(process.env.DATABASE_URL!)

// Build the correct LLM based on the agent's model field
function buildLLM(model: string) {
    return new ChatGroq({ model, apiKey: process.env.GROQ_API_KEY })
}

// Wrap a DB tool row into a LangChain tool the LLM can call
function wrapTool(row: Tool, userId: string) {
    // Build Zod schema from inputSchema JSON
    const shape: Record<string, any> = {}
    for (const [key, def] of Object.entries(row.inputSchema as Record<string, any>)) {
        shape[key] = def.type === 'number' ? z.number() : z.string()
        if (def.description) shape[key] = shape[key].describe(def.description)
    }

    return tool(
        async (input: any) => {
            const result = await executeTool(row, input, userId)
            return JSON.stringify(result)
        },
        {
            name: row.id,
            description: row.description,
            schema: z.object(shape),
        }
    )
}

import { getMissingCredentials } from './vault'

export async function buildAgent(agentId: string, userId: string) {
    // 1. Load agent config from DB
    const [agent] = await agentQueries.findById(agentId)
    if (!agent) throw new Error(`Agent ${agentId} not found`)

    // 2. Load tools and wrap them
    const toolRows = await getToolsForAgent(agent.toolIds)
    const lcTools = toolRows.map(row => wrapTool(row, userId))

    // 3. Build LLM — Anthropic or Groq based on agent.model
    const llm = buildLLM(agent.model).bindTools(lcTools)

    // Check for missing credentials to inform the LLM
    const missing = await getMissingCredentials(userId, agent.requiredCredentials)
    let systemPrompt = agent.systemPrompt
    if (missing.length > 0) {
        const list = missing.map(m => `- ${m.label} (key: ${m.key})`).join('\n')
        systemPrompt += `\n\nREQUIRED CREDENTIALS MISSING:
${list}
If the user hasn't provided these, ask for them. 
If the user provides a secret (like a token or ID) directly in the chat, use the \`store_credential\` tool to save it immediately before proceeding with your task.`
    }

    // 4. Agent node — calls LLM with full message history
    async function agentNode(state: typeof MessagesAnnotation.State) {
        const response = await llm.invoke([
            { role: 'system', content: systemPrompt },
            ...state.messages,
        ])
        return { messages: [response] }
    }

    // 5. Conditional edge — tool calls or done?
    function shouldContinue(state: typeof MessagesAnnotation.State) {
        const last = state.messages.at(-1) as any
        return last?.tool_calls?.length ? 'tools' : END
    }

    // 6. Build and compile the state machine
    const graph = new StateGraph(MessagesAnnotation)
        .addNode('agent', agentNode)
        .addNode('tools', new ToolNode(lcTools))
        .addEdge(START, 'agent')
        .addConditionalEdges('agent', shouldContinue)
        .addEdge('tools', 'agent')    // loop: tools always report back to agent
        .compile({ checkpointer })

    return graph
}

// Run an agent — thread_id keeps conversation context across calls
export async function runAgent(
    agentId: string,
    userId: string,
    userMessage: string | undefined,
    onStep?: (step: any) => Promise<void>
): Promise<string> {
    const graph = await buildAgent(agentId, userId)

    // Same thread_id = same conversation. Different userId = separate context.
    const config = { configurable: { thread_id: `${agentId}-${userId}` } }

    const messages = userMessage
        ? [{ role: 'user' as const, content: userMessage }]
        : []

    let lastOutput = ''
    const stream = await graph.stream({ messages }, { ...config, streamMode: 'updates' })

    for await (const update of stream) {
        if (onStep) await onStep(update)
        // update is an object like { agent: { messages: [...] } } or { tools: { messages: [...] } }
        const node = Object.keys(update)[0]
        const data = (update as any)[node]
        if (data.messages) {
            const msg = data.messages.at(-1)
            if (msg && typeof msg.content === 'string' && msg.content) {
                lastOutput = msg.content
            }
        }
    }

    return lastOutput
}

// Run with full logging to RunLog table
export async function runAgentWithLog(
    agentId: string,
    userId: string,
    userMessage: string | undefined,
    trigger: 'chat' | 'scheduled' | 'api' | 'manual'
): Promise<string> {
    const [log] = await runLogQueries.create({ agentId, userId, status: 'running', runTrigger: trigger })
    const t0 = Date.now()

    try {
        const output = await runAgent(agentId, userId, userMessage, async (step) => {
            await runLogQueries.appendTrace(log.id, step)
        })
        await runLogQueries.updateStatus(log.id, {
            status: 'success', durationMs: Date.now() - t0,
        })
        return output
    } catch (err: any) {
        await runLogQueries.updateStatus(log.id, {
            status: 'failed', durationMs: Date.now() - t0, error: err.message,
        })
        throw err
    }
}
