import type { FastifyInstance } from 'fastify'
import { runAgentWithLog } from '../runner'
import { runLogQueries } from '../db/queries'
import { agentQueries } from '../db/queries'

export async function runRoutes(fastify: FastifyInstance) {
    fastify.addHook('preHandler', async (req: any, reply) => {
        const userId = req.headers['x-user-id']
        if (!userId) return reply.code(401).send({ error: 'Missing X-User-Id header' })
        req.userId = userId
    })

    // POST /run/:agentId — run agent, stream response
    fastify.post('/run/:agentId', async (req: any, reply) => {
        const [agent] = await agentQueries.findById(req.params.agentId)
        if (!agent || agent.userId !== req.userId)
            return reply.code(404).send({ error: 'Agent not found' })
        if (agent.status !== 'published')
            return reply.code(400).send({ error: 'Agent is not published' })

        const { message } = req.body as { message?: string }

        const output = await runAgentWithLog(
            agent.id, req.userId, message, 'chat'
        )
        return reply.send({ output })
    })

    // GET /run/:agentId/logs
    fastify.get('/run/:agentId/logs', async (req: any, reply) => {
        const [agent] = await agentQueries.findById(req.params.agentId)
        if (!agent || agent.userId !== req.userId)
            return reply.code(404).send({ error: 'Not found' })

        const logs = await runLogQueries.findByAgent(agent.id)
        return reply.send(logs)
    })
}
