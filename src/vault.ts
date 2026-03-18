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
    if (!user) return null

    const encrypted = (user.vault as Record<string, string>)[key]
    return encrypted ? decrypt(encrypted) : null
}

export async function getMissingCredentials(
    userId: string,
    required: { key: string; label: string; url?: string }[]
) {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
    if (!user) return required

    const vault = user.vault as Record<string, string>
    return required.filter(r => !vault[r.key])
}
