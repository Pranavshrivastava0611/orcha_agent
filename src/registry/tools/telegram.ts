import { getCredential } from '../../vault'

export async function telegramNotify(input: { message: string }, userId: string) {
    const token = await getCredential(userId, 'TELEGRAM_TOKEN')
    const chatId = await getCredential(userId, 'TELEGRAM_CHAT_ID')

    if (!token || !chatId) {
        throw new Error(`Missing Telegram Credentials (TELEGRAM_TOKEN/TELEGRAM_CHAT_ID). Please provide them in your settings.`)
    }

    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: input.message }),
    })
    const data: any = await res.json()
    console.log('[Telegram Tool] Response:', JSON.stringify(data, null, 2))
    return { ok: data.ok }
}

export const telegramSchema = {
    message: { type: 'string', description: 'Message to send via Telegram' }
}
