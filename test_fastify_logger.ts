import Fastify from 'fastify'
import pino from 'pino'

const logger = pino()
console.log('--- TEST: logger info type:', typeof logger.info)
try {
    const fastify = Fastify({ logger })
    console.log('--- TEST: Fastify created successfully')
} catch (e) {
    console.log('--- TEST: Fastify creation failed:', e.message)
}
