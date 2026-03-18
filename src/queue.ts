import { Queue, Worker } from 'bullmq'
import { redis } from './redis'
import { runAgent } from './runner'
import { agentQueries } from './db/queries'

export const agentQueue = new Queue('agent-jobs', { connection: redis as any })

// Worker — picks up jobs and runs the agent
new Worker('agent-jobs', async (job) => {
    const { agentId, userId, message } = job.data

    if (job.name === 'run-agent') {
        await runAgent(agentId, userId, message ?? undefined)
    }
}, { connection: redis as any })

// Convert human-readable interval to milliseconds
export function parseInterval(str: string): number {
    const map: Record<string, number> = {
        'every 1 minute': 60_000,
        'every 5 minutes': 300_000,
        'every 15 minutes': 900_000,
        'every 30 minutes': 1_800_000,
        'every 1 hour': 3_600_000,
        'every 6 hours': 21_600_000,
        'every 12 hours': 43_200_000,
        'every day': 86_400_000,
    }
    return map[str] ?? 3_600_000  // default: 1 hour
}

export async function scheduleAgent(agentId: string, userId: string, interval: string) {
    const jobId = `agent-${agentId}`
    await agentQueue.add(
        'run-agent',
        { agentId, userId },
        { repeat: { every: parseInterval(interval) }, jobId }
    )
    // Store the BullMQ job ID on the agent record
    await agentQueries.update(agentId, { bullJobId: jobId })
}

export async function pauseAgent(agentId: string) {
    const [agent] = await agentQueries.findById(agentId)
    if (agent?.bullJobId) {
        await agentQueue.removeRepeatable('run-agent', {
            every: 0, jobId: agent.bullJobId
        })
        await agentQueries.update(agentId, { bullJobId: null as any })
    }
}
