import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.ethereal.email',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
})

export async function sendPlainEmail(to: string, subject: string, html: string) {
    const info = await transporter.sendMail({
        from: process.env.SMTP_FROM || '"Event Planner" <noreply@eventplanner.com>',
        to,
        subject,
        html,
        text: html.replace(/<[^>]+>/g, ''), // naive HTML-to-text strip
    })
    console.log('Intelligence email sent: %s', info.messageId)
    return info
}

export async function sendEmail(to: string, subject: string, text: string, html: string, icsContent: string, filename: string) {
    try {
        const info = await transporter.sendMail({
            from: process.env.SMTP_FROM || '"Event Planner" <noreply@eventplanner.com>',
            to,
            subject,
            text,
            html,
            attachments: [
                {
                    filename: filename,
                    content: icsContent,
                    contentType: 'text/calendar'
                }
            ]
        })

        console.log('Message sent: %s', info.messageId)
        return info
    } catch (error) {
        console.error('Error sending email:', error)
        throw error
    }
}
