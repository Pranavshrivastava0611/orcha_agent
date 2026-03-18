import { getCredential } from '../vault'
import type { Tool } from '../db/schema'

export async function runHttpTool(tool: Tool, input: any, userId: string): Promise<any> {
    // Replace {CREDENTIAL_KEY} placeholders in headers with real values
    const headers: Record<string, string> = {}
    for (const [k, v] of Object.entries((tool.headers as Record<string, string>) ?? {})) {
        const match = String(v).match(/\{(\w+)\}/)
        headers[k] = match ? (await getCredential(userId, match[1])) ?? v : v
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10000)

    try {
        const res = await fetch(tool.url!, {
            method: tool.method ?? 'POST',
            headers: { 'Content-Type': 'application/json', ...headers },
            body: JSON.stringify(input),
            signal: controller.signal,
        })
        return await res.json()
    } catch (err: any) {
        return { error: err.message }
    } finally {
        clearTimeout(timer)
    }
}
