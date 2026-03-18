import { Redis } from 'ioredis'

declare global { var __redis: Redis | undefined }

export const redis = globalThis.__redis ?? new Redis(process.env.REDIS_URL!, {
    maxRetriesPerRequest: null,   // required by BullMQ
    enableReadyCheck: false,  // required by BullMQ
})

if (process.env.NODE_ENV !== 'production') globalThis.__redis = redis
