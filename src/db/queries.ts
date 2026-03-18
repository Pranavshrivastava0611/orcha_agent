import { eq, and, desc, inArray, sql } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'
import { db } from './index'
import {
    agents,
    tools,
    credentials,
    runLogs,
    agentMemory,
    type NewAgent,
    type NewTool,
} from './schema'

export const agentQueries = {
    create: (data: NewAgent) =>
        db.insert(agents).values(data).returning(),
    findById: (id: string) =>
        db.select().from(agents).where(eq(agents.id, id)).limit(1),
    findByUser: (userId: string) =>
        db.select().from(agents)
            .where(eq(agents.userId, userId))
            .orderBy(desc(agents.createdAt)),
    update: (id: string, data: Partial<NewAgent>) =>
        db.update(agents)
            .set({ ...data, updatedAt: new Date() })
            .where(eq(agents.id, id))
            .returning(),
    publish: (id: string) =>
        db.update(agents)
            .set({ status: 'published', updatedAt: new Date() })
            .where(eq(agents.id, id)).returning(),
    pause: (id: string) =>
        db.update(agents)
            .set({ status: 'paused', updatedAt: new Date() })
            .where(eq(agents.id, id)).returning(),
    delete: (id: string) =>
        db.delete(agents).where(eq(agents.id, id)),
}

export const toolQueries = {
    // Platform tools (isPublic=true) OR user's own tools
    findForUser: (userId: string) =>
        db.select().from(tools)
            .where(sql`${tools.isPublic} = true OR ${tools.userId} = ${userId}`),

    findByIds: (ids: string[]) =>
        ids.length ? db.select().from(tools).where(inArray(tools.id, ids)) : Promise.resolve([]),

    upsertPlatformTool: (data: NewTool) =>
        db.insert(tools).values(data)
            .onConflictDoUpdate({
                target: tools.id,
                set: { description: data.description, inputSchema: data.inputSchema, updatedAt: new Date() }
            }).returning(),

    create: (data: NewTool) => db.insert(tools).values(data).returning(),

    delete: (id: string, userId: string) =>
        db.delete(tools).where(and(eq(tools.id, id), eq(tools.userId, userId))),
}

export const credentialQueries = {
    upsert: (userId: string, key: string, value: string, label?: string) =>
        db.insert(credentials).values({ userId, key, value, label })
            .onConflictDoUpdate({
                target: [credentials.userId, credentials.key],
                set: { value, updatedAt: new Date() }
            }),

    findOne: (userId: string, key: string) =>
        db.select().from(credentials)
            .where(and(eq(credentials.userId, userId), eq(credentials.key, key)))
            .limit(1),

    findMissing: async (userId: string, required: { key: string; label: string }[]) => {
        if (!required.length) return []
        const found = await db.select({ key: credentials.key }).from(credentials)
            .where(and(
                eq(credentials.userId, userId),
                inArray(credentials.key, required.map(r => r.key))
            ))
        const foundKeys = new Set(found.map(f => f.key))
        return required.filter(r => !foundKeys.has(r.key))
    },
}

export const runLogQueries = {
    create: (data: {
        agentId: string; userId: string
        status: 'running'; runTrigger: 'chat' | 'scheduled' | 'api' | 'manual'
    }) => db.insert(runLogs).values(data).returning(),

    updateStatus: (id: string, data: {
        status: 'success' | 'failed' | 'timeout'
        durationMs?: number; error?: string
        inputTokens?: number; outputTokens?: number
    }) => db.update(runLogs).set(data).where(eq(runLogs.id, id)).returning(),

    // Append-only trace — raw SQL jsonb concatenation
    appendTrace: (id: string, step: object) =>
        db.execute(sql`
      UPDATE run_logs
      SET trace = trace || ${JSON.stringify([step])}::jsonb
      WHERE id = ${id}
    `),

    findByAgent: (agentId: string, limit = 20) =>
        db.select().from(runLogs)
            .where(eq(runLogs.agentId, agentId))
            .orderBy(desc(runLogs.createdAt))
            .limit(limit),
}

export const memoryQueries = {
    store: (agentId: string, userId: string, content: string, embedding: number[], source = 'conversation') =>
        db.execute(sql`
      INSERT INTO agent_memory (id, agent_id, user_id, content, source, embedding, created_at)
      VALUES (
        ${createId()}, ${agentId}, ${userId}, ${content}, ${source},
        ${`[${embedding.join(',')}]`}::vector, NOW()
      )
    `),

    search: (agentId: string, userId: string, embedding: number[], topK = 5, threshold = 0.75) =>
        db.execute<{ content: string; similarity: number }>(sql`
      SELECT content, 1 - (embedding <=> ${`[${embedding.join(',')}]`}::vector) AS similarity
      FROM agent_memory
      WHERE agent_id = ${agentId}
        AND user_id  = ${userId}
        AND 1 - (embedding <=> ${`[${embedding.join(',')}]`}::vector) > ${threshold}
      ORDER BY embedding <=> ${`[${embedding.join(',')}]`}::vector
      LIMIT ${topK}
    `),
}
