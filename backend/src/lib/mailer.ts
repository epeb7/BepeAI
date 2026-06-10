import { Resend } from 'resend';
import { env } from './env';
import logger from './logger';

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<boolean> {
  if (!resend) {
    logger.warn({ to }, '[Mailer] RESEND_API_KEY não configurado — e-mail não enviado');
    return false;
  }

  const { error } = await resend.emails.send({
    from: env.RESEND_FROM,
    to,
    subject: 'Redefinição de senha — BepeAI',
    html: `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0f1117;font-family:'Segoe UI',system-ui,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f1117;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" style="max-width:480px;background:#141720;border:1px solid #1e2430;border-radius:16px;overflow:hidden;">

        <!-- Header -->
        <tr><td style="padding:32px 32px 24px;border-bottom:1px solid #1e2430;">
          <table cellpadding="0" cellspacing="0">
            <tr>
              <td style="width:40px;height:40px;background:linear-gradient(135deg,#5b3df5,#3b6aeb);border-radius:10px;text-align:center;vertical-align:middle;">
                <span style="color:#fff;font-size:20px;font-weight:700;line-height:40px;">B</span>
              </td>
              <td style="padding-left:12px;">
                <span style="font-size:18px;font-weight:700;background:linear-gradient(135deg,#8b6ef5,#6b9ef5);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">BepeAI</span>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:32px;">
          <h1 style="margin:0 0 12px;font-size:20px;font-weight:600;color:#dde4f0;line-height:1.3;">
            Redefinição de senha
          </h1>
          <p style="margin:0 0 24px;font-size:14px;color:#7a8499;line-height:1.6;">
            Recebemos uma solicitação para redefinir a senha da sua conta.<br>
            Clique no botão abaixo para criar uma nova senha. Este link é válido por <strong style="color:#aab2c8;">1 hora</strong> e pode ser usado apenas uma vez.
          </p>

          <a href="${resetUrl}" style="display:block;text-align:center;padding:14px 24px;background:linear-gradient(135deg,#5b3df5,#3b6aeb);color:#fff;text-decoration:none;border-radius:10px;font-size:15px;font-weight:600;letter-spacing:0.01em;">
            Redefinir minha senha
          </a>

          <p style="margin:24px 0 0;font-size:12px;color:#4a5268;line-height:1.6;">
            Se você não solicitou a redefinição, ignore este e-mail — sua senha permanece a mesma.<br>
            Por segurança, nunca compartilhe este link com ninguém.
          </p>

          <div style="margin-top:20px;padding:12px 14px;background:#0f1117;border-radius:8px;border:1px solid #1e2430;">
            <p style="margin:0;font-size:11px;color:#3d4558;">Link completo (caso o botão não funcione):</p>
            <p style="margin:4px 0 0;font-size:11px;color:#5a6278;word-break:break-all;">${resetUrl}</p>
          </div>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:16px 32px;border-top:1px solid #1e2430;text-align:center;">
          <p style="margin:0;font-size:11px;color:#2d3548;">
            © ${new Date().getFullYear()} BepeAI · Automação documental jurídica
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`,
  });

  if (error) {
    logger.error({ error, to }, '[Mailer] Erro ao enviar e-mail de reset');
    return false;
  }

  logger.info({ to }, '[Mailer] E-mail de reset enviado');
  return true;
}
