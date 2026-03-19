import type { FastifyRequest, FastifyReply } from 'fastify'
import { userQueries } from '../db/queries'

export async function authHook(req: any, reply: FastifyReply) {
    const userId = req.headers['x-user-id'] as string
    const userEmail = req.headers['x-user-email'] as string

    if (!userId) {
        return reply.code(401).send({ error: 'Missing X-User-Id header' })
    }

    // Ensure user exists in our local DB so foreign keys don't fail
    // This connects Supabase Auth users to our public.users table
    try {
        await userQueries.ensure(userId, userEmail || `${userId}@orcha.local`)
    } catch (error) {
        // Log error but keep going if it's just a duplicate (onConflict should handle this)
        console.error('Failed to sync user:', error)
    }

    req.userId = userId
}
