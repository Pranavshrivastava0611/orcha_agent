import {
    pgTable, pgEnum,
    text, varchar, boolean, integer,
    jsonb, timestamp, unique, index,
    customType,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'

// pgvector custom type — Drizzle supports this natively
const vector = customType<{ data: number[]; driverData: string }>({
    dataType() { return 'vector(1536)' },
    toDriver(value: number[]): string { return `[${value.join(',')}]` },
    fromDriver(value: string): number[] {
        return value.slice(1, -1).split(',').map(Number)
    },
})

// Enums
export const planEnum = pgEnum('plan', ['free', 'pro', 'enterprise'])
export const toolTypeEnum = pgEnum('tool_type', ['platform', 'http', 'sandbox'])
export const agentTypeEnum = pgEnum('agent_type', ['chat', 'scheduled'])
export const statusEnum = pgEnum('status', ['draft', 'published', 'paused'])
export const runStatusEnum = pgEnum('run_status', ['running', 'success', 'failed', 'timeout'])
export const runTriggerEnum = pgEnum('run_trigger', ['chat', 'scheduled', 'api', 'manual'])
export const memSourceEnum = pgEnum('mem_source', ['conversation', 'upload', 'web'])

// modelEnum — all supported LLM providers
export const modelEnum = pgEnum('model', [
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant',
    'mixtral-8x7b-32768',
    'gemma2-9b-it',
    'openai/gpt-oss-120b',
])

// Users
export const users = pgTable('users', {
    id: text('id').primaryKey().$defaultFn(() => createId()),
    email: varchar('email', { length: 255 }).notNull().unique(),
    name: text('name'),
    avatarUrl: text('avatar_url'),
    plan: planEnum('plan').default('free').notNull(),
    vault: jsonb('vault').$type<Record<string, string>>().default({}).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// Tools
export const tools = pgTable('tools', {
    id: text('id').primaryKey().$defaultFn(() => createId()),
    type: toolTypeEnum('type').notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description').notNull(),
    inputSchema: jsonb('input_schema').notNull(),
    isPublic: boolean('is_public').default(false).notNull(),
    // HTTP tool fields
    url: text('url'),
    method: varchar('method', { length: 10 }),
    headers: jsonb('headers'),
    // Sandbox tool fields
    code: text('code'),
    // null for platform tools
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// Agents
export const agents = pgTable('agents', {
    id: text('id').primaryKey().$defaultFn(() => createId()),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    status: statusEnum('status').default('draft').notNull(),
    type: agentTypeEnum('type').default('chat').notNull(),
    // model — "openai/gpt-oss-120b" | "llama-3.3-70b-versatile" | etc.
    model: text('model').default('openai/gpt-oss-120b').notNull(),
    systemPrompt: text('system_prompt').notNull(),
    toolIds: jsonb('tool_ids').$type<string[]>().default([]).notNull(),
    memory: jsonb('memory')
        .$type<{ windowSize: number; persistPerUser: boolean }>()
        .default({ windowSize: 20, persistPerUser: false })
        .notNull(),
    interval: text('interval'),
    bullJobId: text('bull_job_id'),
    requiredCredentials: jsonb('required_credentials')
        .$type<{ key: string; label: string; url?: string }[]>()
        .default([]).notNull(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// Credentials vault
export const credentials = pgTable('credentials', {
    id: text('id').primaryKey().$defaultFn(() => createId()),
    key: varchar('key', { length: 255 }).notNull(),
    value: text('value').notNull(),     // AES-256-CBC encrypted
    label: text('label'),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
    uniqueUserKey: unique().on(table.userId, table.key),
}))

// Agent memory (pgvector)
export const agentMemory = pgTable('agent_memory', {
    id: text('id').primaryKey().$defaultFn(() => createId()),
    agentId: text('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    source: memSourceEnum('source').default('conversation').notNull(),
    embedding: vector('embedding'),     // vector(1536)
    createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
    agentUserIdx: index('agent_memory_agent_user_idx').on(table.agentId, table.userId),
}))

// Run logs
export const runLogs = pgTable('run_logs', {
    id: text('id').primaryKey().$defaultFn(() => createId()),
    agentId: text('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    status: runStatusEnum('status').notNull(),
    runTrigger: runTriggerEnum('run_trigger').notNull(),
    inputTokens: integer('input_tokens').default(0).notNull(),
    outputTokens: integer('output_tokens').default(0).notNull(),
    durationMs: integer('duration_ms').default(0).notNull(),
    error: text('error'),
    trace: jsonb('trace').$type<object[]>().default([]).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
    agentCreatedIdx: index('run_log_agent_idx').on(table.agentId, table.createdAt),
    userCreatedIdx: index('run_log_user_idx').on(table.userId, table.createdAt),
}))

// Relations
export const usersRelations = relations(users, ({ many }) => ({
    agents: many(agents), tools: many(tools),
    credentials: many(credentials),
}))
export const agentsRelations = relations(agents, ({ one, many }) => ({
    user: one(users, { fields: [agents.userId], references: [users.id] }),
    runLogs: many(runLogs),
    memories: many(agentMemory),
}))

// Exported types
export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type Tool = typeof tools.$inferSelect
export type NewTool = typeof tools.$inferInsert
export type Agent = typeof agents.$inferSelect
export type NewAgent = typeof agents.$inferInsert
export type Credential = typeof credentials.$inferSelect
export type RunLog = typeof runLogs.$inferSelect
