import { pino } from 'pino'

export const loggerConfig = {
    level: process.env.LOG_LEVEL || 'info',
    transport: process.env.NODE_ENV === 'development' ? {
        target: 'pino-pretty',
        options: {
            translateTime: 'HH:MM:ss Z',
            ignore: 'pid,hostname',
            colorize: true,
        },
    } : undefined,
}

export const logger = pino(loggerConfig)

