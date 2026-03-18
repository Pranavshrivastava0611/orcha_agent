import { toolQueries } from '../db/queries'
import { webSearch, webSearchSchema } from './tools/webSearch'
import { telegramNotify, telegramSchema } from './tools/telegram'
import { sendEmail, sendEmailSchema } from './tools/sendEmail'
import { storeCredential, storeCredentialSchema } from './tools/storeCredential'
import type { Tool } from '../db/schema'

// Maps platform tool ID → its handler function
export const platformHandlers: Record<string, Function> = {
    web_search: webSearch,
    telegram_notify: telegramNotify,
    send_email: sendEmail,
    store_credential: storeCredential,
}

// Load tool rows from DB for a given agent
export async function getToolsForAgent(toolIds: string[]): Promise<Tool[]> {
    return toolQueries.findByIds(toolIds)
}

// Convert a DB tool row into Anthropic tool definition format
export function toAnthropicTool(tool: Tool) {
    return {
        name: tool.id,
        description: tool.description,
        input_schema: { type: 'object', properties: tool.inputSchema },
    }
}
