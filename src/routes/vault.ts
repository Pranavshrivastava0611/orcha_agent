import type { FastifyInstance } from 'fastify'
import { setCredential } from '../vault'

export async function vaultRoutes(fastify: FastifyInstance) {
    fastify.addHook('preHandler', async (req: any, reply) => {
        const userId = req.headers['x-user-id']
        if (!userId) return reply.code(401).send({ error: 'Missing X-User-Id header' })
        req.userId = userId
    })

    // POST /vault — store an encrypted credential
    fastify.post('/vault', async (req: any, reply) => {
        const { key, value, label } = req.body as { key: string; value: string; label?: string }
        if (!key || !value) return reply.code(400).send({ error: 'key and value are required' })

        await setCredential(req.userId, key, value)
        return { success: true, message: `Credential ${key} stored successfully.` }
    })
}
