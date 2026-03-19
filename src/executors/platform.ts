import { platformHandlers } from '../registry/registry'

export async function runPlatformTool(toolId: string, input: any, userId: string): Promise<any> {
    const handler = platformHandlers[toolId]
    if (!handler) throw new Error(`No platform handler for tool: ${toolId}`)

    console.log(`[Platform Tool] Executing '${toolId}' for user ${userId} with input:`, JSON.stringify(input))

    const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Tool ${toolId} timed out after 30s`)), 30000)
    )
    try {
        const result = await Promise.race([handler(input, userId), timeout])
        console.log(`[Platform Tool] '${toolId}' completed successfully:`, JSON.stringify(result))
        return result
    } catch (err: any) {
        console.error(`[Platform Tool] '${toolId}' FAILED:`, err.message)
        return { error: err.message }
    }
}
