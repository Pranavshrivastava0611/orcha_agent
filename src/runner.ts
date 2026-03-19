import { StateGraph, MessagesAnnotation, START, END } from '@langchain/langgraph'
import { SystemMessage, HumanMessage } from '@langchain/core/messages'
import { logger } from './utils/logger'
import { ToolNode } from '@langchain/langgraph/prebuilt'
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { tool } from '@langchain/core/tools'
import { MemorySaver } from '@langchain/langgraph'
import { z } from 'zod'
import { getToolsForAgent } from './registry/registry'
import { executeTool } from './executors'
import { runLogQueries } from './db/queries'
import { agentQueries } from './db/queries'
import type { Tool } from './db/schema'
import { getMissingCredentials } from './vault'

// Use MemorySaver instead of PostgresSaver to avoid corrupted checkpoint state
// Each server restart gives a clean slate — no stale tool-call history
export const checkpointer = new MemorySaver()

// Build the correct LLM
function buildLLM(model: string) {
    return new ChatGoogleGenerativeAI({
        model: model,
        apiKey: process.env.GEMINI_API_KEY,
        temperature: 0.5,
    })
}

// Wrap a DB tool row into a LangChain tool the LLM can call
function wrapTool(row: Tool, userId: string) {
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

export async function buildAgent(agentId: string, userId: string) {
    // 1. Load agent config from DB
    const [agent] = await agentQueries.findById(agentId)
    if (!agent) throw new Error(`Agent ${agentId} not found`)

    // 2. Load tools and wrap them
    const toolRows = await getToolsForAgent(agent.toolIds)
    const lcTools = toolRows.map(row => wrapTool(row, userId))
    logger.info({ agentId, toolCount: lcTools.length, toolNames: lcTools.map(t => t.name) }, 'Loaded tools')

    // 3. Build the system prompt
    let systemPrompt = agent.systemPrompt
    const missing = await getMissingCredentials(userId, agent.requiredCredentials)
    if (missing.length > 0) {
        const list = missing.map(m => `- ${m.label} (key: ${m.key})`).join('\n')
        systemPrompt += `\n\nREQUIRED CREDENTIALS MISSING:\n${list}\nIf the user hasn't provided these, ask for them.\nIf the user provides a secret (like a token or ID) directly in the chat, use the \`store_credential\` tool to save it immediately.`
    }

    systemPrompt += `\n\nTOOL USE RULES:
1. The ONLY valid parameter for 'perform_internet_search' is 'query' (a string).
2. The ONLY valid parameter for 'telegram_notify' is 'message' (a string).
3. NEVER include extra fields like 'id', 'cursor', or 'page' in any tool call.
4. Always provide the required parameter. Do not omit it.`

    // 4. Build LLM
    const llm = buildLLM(agent.model).bindTools(lcTools)

    // 5. Agent node — calls LLM with message history
    async function agentNode(state: typeof MessagesAnnotation.State) {
        const windowSize = (agent.memory as any)?.windowSize ?? 10
        const messages = state.messages.slice(-windowSize)

        // Gemini requires strict turn ordering. Sanitize the history:
        // - Must start with user or system message
        // - Tool results must follow tool calls
        const sanitized = sanitizeForGemini(messages)

        logger.debug({ agentId, messageCount: sanitized.length }, 'Invoking LLM')

        const response = await llm.invoke([
            new SystemMessage(systemPrompt),
            ...sanitized
        ])
        return { messages: [response] }
    }

    // 6. Conditional edge — tool calls or done?
    function shouldContinue(state: typeof MessagesAnnotation.State) {
        const last = state.messages.at(-1) as any
        return last?.tool_calls?.length ? 'tools' : END
    }

    // 7. Build and compile the state machine
    const graph = new StateGraph(MessagesAnnotation)
        .addNode('agent', agentNode)
        .addNode('tools', new ToolNode(lcTools))
        .addEdge(START, 'agent')
        .addConditionalEdges('agent', shouldContinue)
        .addEdge('tools', 'agent')
        .compile({ checkpointer })

    return graph
}

/**
 * Sanitize message history for Gemini's strict turn-ordering rules:
 * 1. Drop orphaned tool results (tool result without preceding tool call)
 * 2. Drop orphaned tool calls at the end (tool call without following tool result)
 * 3. Ensure history starts with a user message
 */
function sanitizeForGemini(messages: any[]): any[] {
    const result: any[] = []

    for (let i = 0; i < messages.length; i++) {
        const msg = messages[i]
        const msgType = msg._getType?.() ?? msg.constructor?.name ?? ''

        // Skip tool results that don't have a preceding AI message with tool_calls
        if (msgType === 'tool') {
            const prev = result[result.length - 1]
            const prevType = prev?._getType?.() ?? ''
            if (prevType !== 'ai' || !prev?.tool_calls?.length) {
                logger.debug({ skipped: 'orphaned tool result' }, 'Sanitizing message')
                continue
            }
        }

        result.push(msg)
    }

    // If the last message is an AI message with tool_calls but no tool response follows,
    // remove it to avoid "function call turn" errors
    while (result.length > 0) {
        const last = result[result.length - 1]
        const lastType = last._getType?.() ?? ''
        if (lastType === 'ai' && last.tool_calls?.length) {
            result.pop()
            logger.debug({ removed: 'trailing tool call without response' }, 'Sanitizing message')
        } else {
            break
        }
    }

    // Ensure the first message is a human message (Gemini requirement)
    if (result.length > 0) {
        const firstType = result[0]._getType?.() ?? ''
        if (firstType !== 'human') {
            // Find the first human message and trim before it
            const humanIdx = result.findIndex(m => (m._getType?.() ?? '') === 'human')
            if (humanIdx > 0) {
                result.splice(0, humanIdx)
            }
        }
    }

    return result
}

// Run an agent with a unique thread per call (no stale state)
export async function runAgent(
    agentId: string,
    userId: string,
    userMessage: string | undefined,
    onStep?: (step: any) => Promise<void>
): Promise<string> {
    logger.info({ agentId, userId, userMessage }, 'Starting agent run')
    const graph = await buildAgent(agentId, userId)

    // Use a unique thread_id per run to avoid stale checkpoint state
    const threadId = `${agentId}-${userId}-${Date.now()}`
    const config = { configurable: { thread_id: threadId } }

    // For scheduled runs with no user message, inject a default prompt
    const effectiveMessage = userMessage || 'Execute your scheduled task now. Follow your system instructions.'

    const messages = [{ role: 'user' as const, content: effectiveMessage }]

    let lastOutput = ''
    try {
        const stream = await graph.stream({ messages }, { ...config, streamMode: 'updates', recursionLimit: 25 })

        for await (const update of stream) {
            const node = Object.keys(update)[0]
            logger.debug({ agentId, node }, `Agent step: ${node}`)
            if (onStep) await onStep(update)

            const data = (update as any)[node]
            if (data.messages) {
                const msg = data.messages.at(-1)
                if (msg && typeof msg.content === 'string' && msg.content) {
                    lastOutput = msg.content
                }
            }
        }
        logger.info({ agentId, userId }, 'Agent run completed')
    } catch (error) {
        logger.error({ agentId, userId, error }, 'Error during agent stream')
        throw error
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
    logger.info({ agentId, userId, trigger }, 'Running agent with DB logging')
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
        logger.error({ logId: log.id, agentId, err }, 'Agent run failed')
        await runLogQueries.updateStatus(log.id, {
            status: 'failed', durationMs: Date.now() - t0, error: err.message,
        })
        throw err
    }
}
