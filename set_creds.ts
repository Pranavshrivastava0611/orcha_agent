import 'dotenv/config'
import { setCredential } from './src/vault'

async function setup() {
    const userId = 'test-user-123'
    await setCredential(userId, 'TELEGRAM_TOKEN', '8620612620:AAEYovQCYyuhTtLh__W8yQaCCWQuj2ilEz4')
    await setCredential(userId, 'TELEGRAM_CHAT_ID', '@pra_0611')
    console.log('Credentials set.')
    process.exit(0)
}

setup().catch(console.error)
