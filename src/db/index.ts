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

export const db = drizzle(client, { schema })
export type DB = typeof db
