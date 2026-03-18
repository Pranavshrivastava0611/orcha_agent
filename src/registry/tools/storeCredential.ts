import { setCredential } from '../../vault'

export async function storeCredential(input: { key: string; value: string }, userId: string) {
    if (!input.key || !input.value) throw new Error('key and value are required')
    await setCredential(userId, input.key, input.value)
    return { ok: true, message: `Credential ${input.key} stored successfully.` }
}

export const storeCredentialSchema = {
    key: { type: 'string', description: 'The formal key for the credential (e.g. telegram_token)' },
    value: { type: 'string', description: 'The secret value to store' }
}
