export async function webSearch(input: { query: string }) {
    if (!process.env.SERPER_API_KEY || process.env.SERPER_API_KEY === '...') {
        return {
            results: [
                { title: 'Mock Result 1', link: 'https://example.com/1', snippet: `Real-time search results for: ${input.query}` },
                { title: 'TypeScript 5.8 released!', link: 'https://example.com/2', snippet: 'TypeScript 5.8 is now available with new features.' }
            ]
        }
    }
    const res = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: {
            'X-API-KEY': process.env.SERPER_API_KEY!,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ q: input.query }),
    })
    const data: any = await res.json()
    return { results: data.organic ?? [] }
}

export const webSearchSchema = {
    query: { type: 'string', description: 'Search query' }
}
