/**
 * Standalone script to send all notification types to Mailpit for visual testing.
 * Usage: npx tsx scripts/test-email-notifications.ts
 */
import nodemailer from 'nodemailer';

const SMTP_HOST = process.env.SMTP_HOST || 'localhost';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '1026', 10);
const FROM = 'Librarr <librarr@local.dev>';
const TO = 'test@local.dev';

const transport = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: false,
});

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

interface Payload {
  subject: string;
  message: string;
  media?: { mediaType: string; title: string; coverUrl?: string };
  request?: { requestedBy: string };
  issue?: { reportedBy: string; issueType: string };
}

function buildHtml(payload: Payload): string {
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

const BOOK_COVER = 'https://covers.openlibrary.org/b/id/14625765-L.jpg';
const ALBUM_COVER = 'https://i.scdn.co/image/ab67616d0000b273e8b066f70c206551210d902b';

const payloads: Payload[] = [
  {
    subject: 'New Request: The Name of the Wind',
    message: 'johndoe has requested a new ebook.',
    media: { mediaType: 'Ebook', title: 'The Name of the Wind — Patrick Rothfuss', coverUrl: BOOK_COVER },
    request: { requestedBy: 'johndoe' },
  },
  {
    subject: 'Request Approved: The Name of the Wind',
    message: 'Your ebook request has been approved and is being processed.',
    media: { mediaType: 'Ebook', title: 'The Name of the Wind — Patrick Rothfuss', coverUrl: BOOK_COVER },
  },
  {
    subject: 'Now Available: The Name of the Wind',
    message: 'The Name of the Wind is now available in your library.',
    media: { mediaType: 'Ebook', title: 'The Name of the Wind — Patrick Rothfuss', coverUrl: BOOK_COVER },
  },
  {
    subject: 'Download Failed: The Name of the Wind',
    message: 'The download for this ebook has failed. An admin will look into it.',
    media: { mediaType: 'Ebook', title: 'The Name of the Wind — Patrick Rothfuss', coverUrl: BOOK_COVER },
  },
  {
    subject: 'Request Declined: The Name of the Wind',
    message: 'Your ebook request has been declined.',
    media: { mediaType: 'Ebook', title: 'The Name of the Wind — Patrick Rothfuss', coverUrl: BOOK_COVER },
  },
  {
    subject: 'Auto-Approved: Random Access Memories',
    message: 'janedoe requested a music album that was automatically approved.',
    media: { mediaType: 'Music Album', title: 'Random Access Memories — Daft Punk', coverUrl: ALBUM_COVER },
    request: { requestedBy: 'janedoe' },
  },
  {
    subject: 'New Issue: Audio not synced',
    message: 'johndoe reported an issue: audio playback is not synced with the book.',
    media: { mediaType: 'Audiobook', title: 'Project Hail Mary — Andy Weir' },
    issue: { reportedBy: 'johndoe', issueType: 'Audio' },
  },
  {
    subject: 'New Comment on Issue #42',
    message: 'admin replied: "We are looking into this, thanks for reporting."',
    issue: { reportedBy: 'admin', issueType: 'Audio' },
  },
  {
    subject: 'Issue Resolved: Audio not synced',
    message: 'The issue you reported has been resolved.',
    media: { mediaType: 'Audiobook', title: 'Project Hail Mary — Andy Weir' },
    issue: { reportedBy: 'johndoe', issueType: 'Audio' },
  },
  {
    subject: 'Issue Reopened: Audio not synced',
    message: 'An issue you reported has been reopened.',
    media: { mediaType: 'Audiobook', title: 'Project Hail Mary — Andy Weir' },
    issue: { reportedBy: 'johndoe', issueType: 'Audio' },
  },
  {
    subject: 'Librarr Test Notification',
    message: 'This is a test notification from Librarr. If you received this, your email notifications are working correctly!',
  },
];

async function main() {
  console.log(`Sending ${payloads.length} test emails to ${TO} via ${SMTP_HOST}:${SMTP_PORT}...\n`);

  for (const payload of payloads) {
    const html = buildHtml(payload);
    await transport.sendMail({ from: FROM, to: TO, subject: payload.subject, html });
    console.log(`  ✓ ${payload.subject}`);
  }

  console.log(`\nDone! Check Mailpit at http://localhost:8025`);
  process.exit(0);
}

main().catch((e) => {
  console.error('Failed:', e);
  process.exit(1);
});
