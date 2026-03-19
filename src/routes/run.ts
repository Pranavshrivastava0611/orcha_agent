import type { FastifyInstance } from 'fastify'
import { runAgentWithLog } from '../runner'
import { runLogQueries, agentQueries } from '../db/queries'
import { authHook } from '../utils/auth'

export async function runRoutes(fastify: FastifyInstance) {
    fastify.addHook('preHandler', authHook)

    // POST /run/:agentId — run agent, stream response
    fastify.post('/run/:agentId', async (req: any, reply) => {
        const [agent] = await agentQueries.findById(req.params.agentId)
        if (!agent || agent.userId !== req.userId)
            return reply.code(404).send({ error: 'Agent not found' })
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
