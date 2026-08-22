import nodemailer from 'nodemailer';

const host = process.env.SMTP_HOST || 'smtp.ethereal.email';
const port = parseInt(process.env.SMTP_PORT || '587');
const user = process.env.SMTP_USER || '';
const pass = process.env.SMTP_PASS || '';
const from = process.env.EMAIL_FROM || 'noreply@healthcare-app.com';

const transporter = nodemailer.createTransport({
  host,
  port,
  auth: user && pass ? { user, pass } : undefined,
});

export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  try {
    if (!user || host === 'smtp.ethereal.email') {
      console.log(`[EMAIL DISPATCH MOCK -> ${to}] Subject: "${subject}"\nContent: ${html.replace(/<[^>]*>?/gm, '')}`);
      return true;
    }
    await transporter.sendMail({
      from,
      to,
      subject,
      html,
    });
    return true;
  } catch (error) {
    console.error(`[EMAIL ERROR to ${to}]:`, error);
    throw error;
  }
}
