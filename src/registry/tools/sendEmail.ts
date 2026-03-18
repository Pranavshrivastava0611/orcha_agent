import nodemailer from 'nodemailer'
import { getCredential } from '../../vault'

export async function sendEmail(
    input: { to: string; subject: string; body: string },
    userId: string
) {
    const smtpUser = await getCredential(userId, 'SMTP_USER')
    const smtpPass = await getCredential(userId, 'SMTP_PASS')
    const smtpHost = await getCredential(userId, 'SMTP_HOST') ?? 'smtp.gmail.com'

    if (!smtpUser || !smtpPass) {
        throw new Error('Missing SMTP Credentials (SMTP_USER/SMTP_PASS). Please provide them in your settings.')
    }

    const transporter = nodemailer.createTransport({
        host: smtpHost, port: 587, secure: false,
        auth: { user: smtpUser!, pass: smtpPass! },
    })

    await transporter.sendMail({
        from: smtpUser!, to: input.to,
        subject: input.subject, text: input.body,
    })
    return { success: true }
}

export const sendEmailSchema = {
    to: { type: 'string', description: 'Recipient email address' },
    subject: { type: 'string', description: 'Email subject' },
    body: { type: 'string', description: 'Email body text' },
}
