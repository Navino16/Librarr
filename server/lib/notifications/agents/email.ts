import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type { User } from '../../../entity/User';
import type { UserSettings } from '../../../entity/UserSettings';
import type { NotificationPayload, UserNotificationAgent } from '../index';
import type { SmtpSettings } from '@server/types/settings';
import Settings from '../../settings';
import logger from '../../../logger';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

class EmailAgent implements UserNotificationAgent {
  id = 'email';
  private getSmtpConfig(): SmtpSettings | undefined {
    return Settings.getInstance().notifications.smtp;
  }

  private createTransport(): Transporter | null {
    const smtp = this.getSmtpConfig();
    if (!smtp?.host || !smtp.senderAddress) return null;

    return nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port || 587,
      secure: smtp.secure,
      auth:
        smtp.authUser || smtp.authPass
          ? { user: smtp.authUser, pass: smtp.authPass }
          : undefined,
      requireTLS: smtp.requireTls,
      tls: {
        rejectUnauthorized: !smtp.allowSelfSigned,
      },
    });
  }

  async sendToUser(
    payload: NotificationPayload,
    user: User,
    _userSettings: UserSettings
  ): Promise<boolean> {
    if (!user.email) return false;
    return this.sendEmail(payload, user.email);
  }

  async sendPasswordReset(recipientEmail: string, resetUrl: string, appTitle: string): Promise<boolean> {
    const smtp = this.getSmtpConfig();
    if (!smtp?.host || !smtp.senderAddress) return false;

    const transport = this.createTransport();
    if (!transport) return false;

    try {
      const html = this.buildPasswordResetHtml(resetUrl, appTitle);
      await transport.sendMail({
        from: smtp.senderName
          ? `"${smtp.senderName}" <${smtp.senderAddress}>`
          : smtp.senderAddress,
        to: recipientEmail,
        subject: `${appTitle} — Password Reset`,
        html,
      });
      logger.info('Password reset email sent', { to: recipientEmail });
      return true;
    } catch (e) {
      logger.error('Password reset email failed', {
        error: e,
        to: recipientEmail,
      });
      return false;
    }
  }

  async test(recipientEmail: string): Promise<boolean> {
    return this.sendEmail(
      {
        notificationType: 1024,
        subject: 'Librarr Test Notification',
        message: 'This is a test notification from Librarr.',
      },
      recipientEmail
    );
  }

  private async sendEmail(
    payload: NotificationPayload,
    recipientEmail: string
  ): Promise<boolean> {
    const smtp = this.getSmtpConfig();
    if (!smtp?.host || !smtp.senderAddress) return false;

    const transport = this.createTransport();
    if (!transport) return false;

    try {
      const html = this.buildHtml(payload);
      await transport.sendMail({
        from: smtp.senderName
          ? `"${smtp.senderName}" <${smtp.senderAddress}>`
          : smtp.senderAddress,
        to: recipientEmail,
        subject: payload.subject,
        html,
      });
      logger.info('Email notification sent', { to: recipientEmail });
      return true;
    } catch (e) {
      logger.error('Email notification failed', {
        error: e,
        to: recipientEmail,
      });
      return false;
    }
  }

  private buildHtml(payload: NotificationPayload): string {
    const coverHtml = payload.media?.coverUrl
      ? `<tr><td style="padding:0 0 12px 0;"><img src="${escapeHtml(payload.media.coverUrl)}" alt="" width="120" style="display:block;width:120px;" /></td></tr>`
      : '';

    const mediaHtml = payload.media
      ? `<tr><td style="color:#94a3b8;font-size:13px;padding:4px 0 0 0;">${escapeHtml(payload.media.mediaType)} &mdash; ${escapeHtml(payload.media.title)}</td></tr>`
      : '';

    return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#0f172a" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;"><tr><td align="center" style="padding:24px 0;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="520" bgcolor="#1e293b" style="color:#e2e8f0;">
    <tr><td style="padding:24px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr><td style="font-size:18px;font-weight:bold;color:#f8fafc;padding:0 0 12px 0;">${escapeHtml(payload.subject)}</td></tr>
        ${coverHtml}
        <tr><td style="font-size:14px;color:#e2e8f0;padding:0 0 8px 0;">${escapeHtml(payload.message)}</td></tr>
        ${mediaHtml}
        <tr><td style="padding:16px 0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td style="border-top:1px solid #334155;font-size:1px;height:1px;">&nbsp;</td></tr></table></td></tr>
        <tr><td style="color:#64748b;font-size:11px;">Sent by Librarr</td></tr>
      </table>
    </td></tr>
  </table>
</td></tr></table>
</body>
</html>`;
  }

  private buildPasswordResetHtml(resetUrl: string, appTitle: string): string {
    return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#0f172a" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;"><tr><td align="center" style="padding:24px 0;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="520" bgcolor="#1e293b" style="color:#e2e8f0;">
    <tr><td style="padding:24px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr><td style="font-size:18px;font-weight:bold;color:#f8fafc;padding:0 0 12px 0;">${escapeHtml(appTitle)} — Password Reset</td></tr>
        <tr><td style="font-size:14px;color:#e2e8f0;padding:0 0 16px 0;">Someone requested a password reset for your account. Click the button below to set a new password. This link expires in 1 hour.</td></tr>
        <tr><td style="padding:0 0 16px 0;">
          <a href="${escapeHtml(resetUrl)}" style="display:inline-block;background:#6366f1;color:#ffffff;text-decoration:none;padding:10px 24px;border-radius:6px;font-size:14px;font-weight:bold;">Reset Password</a>
        </td></tr>
        <tr><td style="font-size:12px;color:#94a3b8;padding:0 0 8px 0;">If you didn't request this, you can safely ignore this email.</td></tr>
        <tr><td style="padding:16px 0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td style="border-top:1px solid #334155;font-size:1px;height:1px;">&nbsp;</td></tr></table></td></tr>
        <tr><td style="color:#64748b;font-size:11px;">Sent by ${escapeHtml(appTitle)}</td></tr>
      </table>
    </td></tr>
  </table>
</td></tr></table>
</body>
</html>`;
  }
}

const emailAgent = new EmailAgent();
export default emailAgent;
