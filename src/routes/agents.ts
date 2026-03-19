import type { FastifyInstance } from 'fastify'
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { SystemMessage, HumanMessage } from '@langchain/core/messages'
import { agentQueries } from '../db/queries'
import { scheduleAgent, pauseAgent } from '../queue'
import { getMissingCredentials } from '../vault'
import { authHook } from '../utils/auth'

const model = new ChatGoogleGenerativeAI({
    model: 'gemini-3-flash-preview',
    apiKey: process.env.GEMINI_API_KEY
})

// Meta-prompt: generates a valid AgentConfig JSON from a user description
async function generateAgentConfig(prompt: string) {
    const response = await model.invoke([
        new SystemMessage(`You are an AI agent configuration generator.
Given a description, return ONLY valid JSON — no markdown, no explanation, no code fences.

The JSON must match this exact shape:
{
  "name": string,
  "description": string,
  "model": "gemini-3-flash-preview",
  "systemPrompt": string,
  "type": "chat" or "scheduled",
  "interval": string or null,
  "toolIds": string[],
  "memory": { "windowSize": number, "persistPerUser": boolean },
  "requiredCredentials": [{ "key": string, "label": string, "url": string }]
}

Available tool IDs: ["perform_internet_search", "telegram_notify", "send_email", "store_credential"]
Pick tools that match the user's intent.
For scheduled agents set type="scheduled" and a sensible interval.
For credentials, use these EXACT keys:
- telegram_notify: ["TELEGRAM_TOKEN", "TELEGRAM_CHAT_ID"]
- send_email: ["SMTP_USER", "SMTP_PASS", "SMTP_HOST"]
Only include credentials for chosen tools.`),
        new HumanMessage(`User description: "${prompt}"`)
    ])

    const text = response.content as string
    return JSON.parse(text)
}

export async function agentRoutes(fastify: FastifyInstance) {
    fastify.addHook('preHandler', authHook)

    // POST /agents — generate config from prompt, create agent
    fastify.post('/agents', async (req: any, reply) => {
        const { prompt } = req.body as { prompt: string }
        if (!prompt) return reply.code(400).send({ error: 'prompt is required' })

        fastify.log.info({ prompt }, 'Generating agent config from prompt')
        let config
        try {
            config = await generateAgentConfig(prompt)
            fastify.log.info({ config }, 'Generated agent config')
        } catch (error) {
            fastify.log.error(error, 'Failed to generate agent config')
            return reply.code(500).send({ error: 'Failed to generate agent configuration' })
        }

        try {
            const [agent] = await agentQueries.create({ ...config, userId: req.userId })
            fastify.log.info({ agentId: agent.id }, 'Created agent')

            // Check which credentials the user is missing
            const missing = await getMissingCredentials(req.userId, agent.requiredCredentials)
            return reply.send({ agent, missingCredentials: missing })
        } catch (error) {
            fastify.log.error({ error, config }, 'Failed to create agent in database')
            throw error // Rethrow to let global error handler handle it
        }
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

        try {
            const body = req.body as any
            fastify.log.info({ agentId: req.params.id, body }, 'PATCH agent')
            const [updated] = await agentQueries.update(req.params.id, body)
            return updated
        } catch (error: any) {
            fastify.log.error({ error: error.message, body: req.body }, 'PATCH agent failed')
            return reply.code(500).send({ error: error.message })
        }
    })

    // POST /agents/:id/publish
    fastify.post('/agents/:id/publish', async (req: any, reply) => {
        const [existing] = await agentQueries.findById(req.params.id)
        if (!existing || existing.userId !== req.userId) return reply.code(404).send({ error: 'Not found' })

        const [published] = await agentQueries.publish(req.params.id)

        // Re-read from DB to get the latest interval (may have been updated just before publish)
        const [agent] = await agentQueries.findById(req.params.id)

        if (agent.type === 'scheduled' && agent.interval) {
            fastify.log.info({ agentId: agent.id, interval: agent.interval }, 'Scheduling agent on publish')
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
