import 'dotenv/config'
import Fastify from 'fastify'
import { checkpointer, } from './runner'
import { seedTools } from './registry/seed'
import { agentRoutes } from './routes/agents'
import { toolRoutes } from './routes/tools'
import { runRoutes } from './routes/run'
import { vaultRoutes } from './routes/vault'
import { redis } from './redis'
import { db } from './db/index'

const fastify = Fastify({ logger: true })

fastify.register(agentRoutes, { prefix: '/api' })
fastify.register(toolRoutes, { prefix: '/api' })
fastify.register(runRoutes, { prefix: '/api' })
fastify.register(vaultRoutes, { prefix: '/api' })

fastify.get('/health', async () => ({ status: 'ok' }))

async function start() {
    // One-time setup on startup
    await checkpointer.setup()   // creates LangGraph checkpoint tables in Postgres
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
