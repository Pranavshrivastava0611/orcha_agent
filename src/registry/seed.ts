import { toolQueries } from '../db/queries'
import { webSearchSchema } from './tools/webSearch'
import { telegramSchema } from './tools/telegram'
import { sendEmailSchema } from './tools/sendEmail'
import { storeCredentialSchema } from './tools/storeCredential'

export async function seedTools() {
    const platformTools = [
        {
            id: 'perform_internet_search',
            type: 'platform' as const,
            name: 'Internet Search',
            description: 'Search the internet for real-time information using a query.',
            inputSchema: webSearchSchema,
            isPublic: true,
        },
        {
            id: 'telegram_notify',
            type: 'platform' as const,
            name: 'Telegram Notify',
            description: 'Send a message to a Telegram chat using the user\'s bot token.',
            inputSchema: telegramSchema,
            isPublic: true,
        },
        {
            id: 'send_email',
            type: 'platform' as const,
            name: 'Send Email',
            description: 'Send an email via SMTP to a specified recipient.',
            inputSchema: sendEmailSchema,
            isPublic: true,
        },
        {
            id: 'store_credential',
            type: 'platform' as const,
            name: 'Store Credential',
            description: 'Securely store a key-value secret (like an API token) in the vault for future use.',
            inputSchema: storeCredentialSchema,
            isPublic: true,
        },
    ]

    for (const tool of platformTools) {
        await toolQueries.upsertPlatformTool(tool)
    }

    console.log('[seed] Platform tools seeded.')
}
