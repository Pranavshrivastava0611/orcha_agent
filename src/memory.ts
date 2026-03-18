import OpenAI from 'openai'
import { memoryQueries } from './db/queries'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

async function embed(text: string): Promise<number[]> {
    const res = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text,
    })
    return res.data[0].embedding
}

export async function storeMemory(
    agentId: string, userId: string, content: string, source = 'conversation'
) {
    const embedding = await embed(content)
    await memoryQueries.store(agentId, userId, content, embedding, source)
}

export async function searchMemory(
    agentId: string, userId: string, query: string, topK = 5, threshold = 0.75
) {
    const embedding = await embed(query)
    return memoryQueries.search(agentId, userId, embedding, topK, threshold)
}

export async function persistConversationMemory(
    agentId: string, userId: string, summary: string
) {
    await storeMemory(agentId, userId, summary, 'conversation')
}
