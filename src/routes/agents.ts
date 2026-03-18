import type { FastifyInstance } from 'fastify'
import { ChatGroq } from '@langchain/groq'
import { agentQueries } from '../db/queries'
import { scheduleAgent, pauseAgent } from '../queue'
import { getMissingCredentials } from '../vault'

const model = new ChatGroq({
    model: 'openai/gpt-oss-120b',
    apiKey: process.env.GROQ_API_KEY
})

// Meta-prompt: generates a valid AgentConfig JSON from a user description
async function generateAgentConfig(prompt: string) {
    const response = await model.invoke([
        {
            role: 'system',
            content: `You are an AI agent configuration generator.
Given a description, return ONLY valid JSON — no markdown, no explanation, no code fences.

The JSON must match this exact shape:
{
  "name": string,
  "description": string,
  "model": "openai/gpt-oss-120b" | "llama-3.3-70b-versatile" | "llama-3.1-8b-instant" | "mixtral-8x7b-32768" | "gemma2-9b-it",
  "systemPrompt": string,
  "type": "chat" or "scheduled",
  "interval": string or null,
  "toolIds": string[],
  "memory": { "windowSize": number, "persistPerUser": boolean },
  "requiredCredentials": [{ "key": string, "label": string, "url": string }]
}

Available tool IDs: ["web_search", "telegram_notify", "send_email", "store_credential"]
Pick tools that match the user's intent.
For scheduled agents set type="scheduled" and a sensible interval.
For credentials, use these EXACT keys:
- telegram_notify: ["TELEGRAM_TOKEN", "TELEGRAM_CHAT_ID"]
- send_email: ["SMTP_USER", "SMTP_PASS", "SMTP_HOST"]
Only include credentials for chosen tools.`
        },
        {
            role: 'user',
            content: `User description: "${prompt}"`
        }
    ])

    const text = response.content as string
    return JSON.parse(text)
}

export async function agentRoutes(fastify: FastifyInstance) {
    // Auth middleware — read userId from header
    fastify.addHook('preHandler', async (req: any, reply) => {
        const userId = req.headers['x-user-id']
        if (!userId) return reply.code(401).send({ error: 'Missing X-User-Id header' })
        req.userId = userId
    })

    // POST /agents — generate config from prompt, create agent
    fastify.post('/agents', async (req: any, reply) => {
        const { prompt } = req.body as { prompt: string }
        if (!prompt) return reply.code(400).send({ error: 'prompt is required' })

        const config = await generateAgentConfig(prompt)
        const [agent] = await agentQueries.create({ ...config, userId: req.userId })

        // Check which credentials the user is missing
        const missing = await getMissingCredentials(req.userId, agent.requiredCredentials)
        return reply.send({ agent, missingCredentials: missing })
    })

    // GET /agents
    fastify.get('/agents', async (req: any) => {
        return agentQueries.findByUser(req.userId)
    })

    // GET /agents/:id
    fastify.get('/agents/:id', async (req: any, reply) => {
        const [agent] = await agentQueries.findById(req.params.id)
        if (!agent || agent.userId !== req.userId) return reply.code(404).send({ error: 'Not found' })
        return agent
    })

    // PATCH /agents/:id
    fastify.patch('/agents/:id', async (req: any, reply) => {
        const [existing] = await agentQueries.findById(req.params.id)
        if (!existing || existing.userId !== req.userId) return reply.code(404).send({ error: 'Not found' })
        const [updated] = await agentQueries.update(req.params.id, req.body)
        return updated
    })

    // POST /agents/:id/publish
    fastify.post('/agents/:id/publish', async (req: any, reply) => {
        const [agent] = await agentQueries.findById(req.params.id)
        if (!agent || agent.userId !== req.userId) return reply.code(404).send({ error: 'Not found' })

        const [published] = await agentQueries.publish(req.params.id)

        if (agent.type === 'scheduled' && agent.interval) {
            await scheduleAgent(agent.id, req.userId, agent.interval)
        }
        return published
    })

    // POST /agents/:id/pause
    fastify.post('/agents/:id/pause', async (req: any, reply) => {
        const [agent] = await agentQueries.findById(req.params.id)
        if (!agent || agent.userId !== req.userId) return reply.code(404).send({ error: 'Not found' })
        await pauseAgent(agent.id)
        const [paused] = await agentQueries.pause(req.params.id)
        return paused
    })
}
