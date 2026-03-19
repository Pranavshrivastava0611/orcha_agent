import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import { users } from './db/schema'
import { db } from './db/index'
import { eq } from 'drizzle-orm'

let KEY: Buffer

function getKey() {
    if (!KEY) {
        if (!process.env.ENCRYPTION_KEY) {
            throw new Error('ENCRYPTION_KEY environment variable is not set')
        }
        KEY = Buffer.from(process.env.ENCRYPTION_KEY, 'hex')
    }
    return KEY
}

function encrypt(text: string): string {
    const iv = randomBytes(16)
    const cipher = createCipheriv('aes-256-cbc', getKey(), iv)
    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
    return iv.toString('hex') + ':' + encrypted.toString('hex')
}

function decrypt(stored: string): string {
    const [ivHex, encHex] = stored.split(':')
    const decipher = createDecipheriv('aes-256-cbc', getKey(), Buffer.from(ivHex, 'hex'))
    return Buffer.concat([
        decipher.update(Buffer.from(encHex, 'hex')),
        decipher.final()
    ]).toString('utf8')
}

export async function setCredential(userId: string, key: string, value: string) {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
    if (!user) throw new Error(`User ${userId} not found`)

    const encrypted = encrypt(value)
    const newVault = { ...(user.vault as Record<string, string>), [key]: encrypted }

    await db.update(users)
        .set({ vault: newVault, updatedAt: new Date() })
        .where(eq(users.id, userId))
}

export async function getCredential(userId: string, key: string): Promise<string | null> {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
    if (!user) {
        console.warn(`[Vault] User ${userId} not found while loading credential ${key}`)
        return null
    }

    const stored = (user.vault as Record<string, string>)[key]
    if (!stored) {
        console.warn(`[Vault] Credential '${key}' is missing for user ${userId}`)
        return null
    }

    // Try to decrypt; if it fails, the value might be stored as plain text
    try {
        const val = decrypt(stored)
        console.log(`[Vault] Decrypted credential '${key}' for user ${userId} (length=${val.length})`)
        return val
    } catch (err: any) {
        console.warn(`[Vault] Decryption failed for '${key}': ${err.message}. Treating as plain text.`)
        return stored
    }
}

export async function getMissingCredentials(
    userId: string,
    required: { key: string; label: string; url?: string }[]
) {
    console.log(`[Vault] Checking required credentials for user ${userId}:`, required.map(r => r.key))
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
    if (!user) return required

    const vault = user.vault as Record<string, string>
    const missing = required.filter(r => !vault[r.key])

    console.log(`[Vault] Status for user ${userId}: FOUND=[${required.filter(r => vault[r.key]).map(r => r.key)}], MISSING=[${missing.map(r => r.key)}]`)
    return missing
}
