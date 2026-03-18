import { runPlatformTool } from './platform'
import { runHttpTool } from './http'
import { runInSandbox } from './sandbox'
import type { Tool } from '../db/schema'

export async function executeTool(tool: Tool, input: any, userId: string): Promise<any> {
    try {
        switch (tool.type) {
            case 'platform': return await runPlatformTool(tool.id, input, userId)
            case 'http': return await runHttpTool(tool, input, userId)
            case 'sandbox': return await runInSandbox(tool.code!, input)
            default: throw new Error(`Unknown tool type: ${tool.type}`)
        }
    } catch (err: any) {
        // Never crash the runner — return structured error
        return { error: err.message }
    }
}
