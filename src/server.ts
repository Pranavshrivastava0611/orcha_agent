import 'dotenv/config'
import Fastify, { type FastifyError } from 'fastify'
import { seedTools } from './registry/seed'
import { agentRoutes } from './routes/agents'
import { toolRoutes } from './routes/tools'
import { runRoutes } from './routes/run'
import { vaultRoutes } from './routes/vault'
import { redis } from './redis'
import { db } from './db/index'
import cors from '@fastify/cors'
import './queue'  // Start BullMQ worker for scheduled agent jobs

import { logger, loggerConfig } from './utils/logger'

const fastify = Fastify({ logger: loggerConfig })


fastify.register(cors, {
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    origin: ['http://localhost:3000', 'http://localhost:5173'],
})

fastify.register(agentRoutes, { prefix: '/api' })
fastify.register(toolRoutes, { prefix: '/api' })
fastify.register(runRoutes, { prefix: '/api' })
fastify.register(vaultRoutes, { prefix: '/api' })

fastify.setErrorHandler((error: FastifyError, request, reply) => {
    // Standard error logging
    fastify.log.error(error)

    // Check for Postgres errors specifically
    if ((error as any).code === '23505') {
        const detail = (error as any).detail
        return reply.status(409).send({
            error: 'Conflict',
            message: 'A record with this value already exists.',
            detail: detail,
        })
    }

    // Default error response
    const statusCode = error.statusCode ?? 500
    reply.status(statusCode).send({
        error: statusCode === 500 ? 'Internal Server Error' : error.name,
        message: error.message,
    })
})

fastify.get('/health', async () => ({ status: 'ok' }))

async function start() {
    // One-time setup on startup
    await seedTools()            // upsert platform tools

    await fastify.listen({
        port: Number(process.env.PORT ?? 3001),
        host: '0.0.0.0',
    })
}

// Graceful shutdown
const shutdown = async () => {
    await fastify.close()
    await redis.quit()
    process.exit(0)
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

start().catch(console.error)
