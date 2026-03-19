import type { FastifyInstance } from 'fastify'
import { toolQueries } from '../db/queries'
import { authHook } from '../utils/auth'

export async function toolRoutes(fastify: FastifyInstance) {
    fastify.addHook('preHandler', authHook)

    // GET /tools — platform tools + user's own tools
    fastify.get('/tools', async (req: any) => {
        return toolQueries.findForUser(req.userId)
    })

    // POST /tools/http — create HTTP tool
    fastify.post('/tools/http', async (req: any, reply) => {
        const { name, description, url, method, headers, inputSchema } = req.body as any
        if (!name || !url || !inputSchema) return reply.code(400).send({ error: 'name, url, inputSchema required' })
        const [tool] = await toolQueries.create({
            type: 'http', name, description, url, method, headers, inputSchema,
            userId: req.userId, isPublic: false,
        })
        return reply.code(201).send(tool)
    })

    // POST /tools/sandbox — create sandbox tool
    fastify.post('/tools/sandbox', async (req: any, reply) => {
        const { name, description, code, inputSchema } = req.body as any
        if (!name || !code || !inputSchema) return reply.code(400).send({ error: 'name, code, inputSchema required' })
        const [tool] = await toolQueries.create({
            type: 'sandbox', name, description, code, inputSchema,
            userId: req.userId, isPublic: false,
        })
        return reply.code(201).send(tool)
    })

    // DELETE /tools/:id
    fastify.delete('/tools/:id', async (req: any, reply) => {
        await toolQueries.delete(req.params.id, req.userId)
        return reply.code(204).send()
    })
}
