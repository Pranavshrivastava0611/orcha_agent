import { Queue, Worker } from 'bullmq'
import { redis } from './redis'
import { runAgentWithLog } from './runner'
import { agentQueries } from './db/queries'

export const agentQueue = new Queue('agent-jobs', { connection: redis as any })

import { logger } from './utils/logger'

// Worker — picks up jobs and runs the agent
new Worker('agent-jobs', async (job) => {
    const { agentId, userId, message } = job.data
    const logCtx = { jobId: job.id, agentId, userId, name: job.name }

    logger.info(logCtx, `Starting job: ${job.name}`)

    try {
        if (job.name === 'run-agent') {
            const output = await runAgentWithLog(agentId, userId, message ?? undefined, 'scheduled')
            logger.info({ ...logCtx, outputLength: output.length }, `Successfully completed job: ${job.name}`)
        }
    } catch (error) {
        logger.error({ ...logCtx, error }, `Failed job: ${job.name}`)
        throw error
    }
}, { connection: redis as any })


// Convert human-readable interval to milliseconds
export function parseInterval(str: string): number {
    const map: Record<string, number> = {
        'every 10 seconds': 10_000,
        'every 30 seconds': 30_000,
        'every 1 minute': 60_000,
        'every 5 minutes': 300_000,
        'every 15 minutes': 900_000,
        'every 30 minutes': 1_800_000,
        'every 1 hour': 3_600_000,
        'every 6 hours': 21_600_000,
        'every 12 hours': 43_200_000,
        'every day': 86_400_000,
    }
    const ms = map[str] ?? 3_600_000  // default: 1 hour
    logger.info({ interval: str, ms }, `Parsed interval`)
    return ms
}

export async function scheduleAgent(agentId: string, userId: string, interval: string) {
    const ms = parseInterval(interval)
    const jobId = `agent-${agentId}`

    logger.info({ agentId, userId, interval, ms, jobId }, 'Scheduling repeating agent job')

    await agentQueue.add(
        'run-agent',
        { agentId, userId },
        { repeat: { every: ms }, jobId }
    )
    // Store the BullMQ job ID on the agent record
    await agentQueries.update(agentId, { bullJobId: jobId })
    logger.info({ agentId, jobId }, 'Agent scheduled successfully')
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
