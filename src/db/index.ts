import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

// Direct Postgres connection — bypasses Supabase REST API (PostgREST)
// Drizzle manages its own pool — use port 5432 (direct), not 6543 (pooler)
const client = postgres(process.env.DATABASE_URL!, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
})

import { logger } from '../utils/logger'

export const db = drizzle(client, {
    schema,
    logger: process.env.NODE_ENV === 'development' ? {
        logQuery(query, params) {
            logger.debug({ query, params }, 'Database Query')
        }
    } : undefined
})
export type DB = typeof db
