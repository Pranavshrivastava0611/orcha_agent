import type { FastifyInstance } from 'fastify'
import { setCredential } from '../vault'
import { authHook } from '../utils/auth'

export async function vaultRoutes(fastify: FastifyInstance) {
    fastify.addHook('preHandler', authHook)

    // POST /vault — store an encrypted credential
    fastify.post('/vault', async (req: any, reply) => {
        const { key, value, label } = req.body as { key: string; value: string; label?: string }
        if (!key || !value) return reply.code(400).send({ error: 'key and value are required' })

        await setCredential(req.userId, key, value)
        return { success: true, message: `Credential ${key} stored successfully.` }
    })
}
