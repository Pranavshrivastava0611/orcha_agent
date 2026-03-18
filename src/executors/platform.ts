import { platformHandlers } from '../registry/registry'

export async function runPlatformTool(toolId: string, input: any, userId: string): Promise<any> {
    const handler = platformHandlers[toolId]
    if (!handler) throw new Error(`No platform handler for tool: ${toolId}`)

    const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Tool ${toolId} timed out`)), 10000)
    )
    try {
        return await Promise.race([handler(input, userId), timeout])
    } catch (err: any) {
        return { error: err.message }
    }
}
