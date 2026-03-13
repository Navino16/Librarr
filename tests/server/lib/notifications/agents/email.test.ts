import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSendMail = vi.fn();
vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({ sendMail: mockSendMail })),
  },
}));
vi.mock('@server/lib/settings', () => ({
  default: { getInstance: vi.fn() },
}));
vi.mock('@server/logger', () => ({
  default: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import nodemailer from 'nodemailer';
import Settings from '@server/lib/settings';
import emailAgent from '@server/lib/notifications/agents/email';
import type { NotificationPayload } from '@server/lib/notifications/index';
import type { SmtpSettings } from '@server/types/settings';
import type { User } from '@server/entity/User';
import type { UserSettings } from '@server/entity/UserSettings';

const mockedGetInstance = vi.mocked(Settings.getInstance);
const mockedCreateTransport = vi.mocked(nodemailer.createTransport);

const smtpDefaults: SmtpSettings = {
  host: 'mail.example.com',
  port: 587,
  secure: false,
  authUser: '',
  authPass: '',
  senderAddress: 'librarr@example.com',
  senderName: 'Librarr',
  requireTls: false,
  allowSelfSigned: false,
};

function mockSmtp(smtp?: Partial<SmtpSettings> | null) {
  mockedGetInstance.mockReturnValue({
    notifications: {
      smtp: smtp === null ? undefined : { ...smtpDefaults, ...smtp },
    },
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSendMail.mockResolvedValue({ messageId: '<test@example.com>' });
});

// ---------------------------------------------------------------------------
// sendToUser
// ---------------------------------------------------------------------------
describe('EmailAgent — sendToUser()', () => {
  const payload: NotificationPayload = {
    notificationType: 4,
    subject: 'Now Available',
    message: 'Your book is ready.',
  };

  it('returns false when user has no email', async () => {
    mockSmtp();
    const user = { email: '' } as User;
    const result = await emailAgent.sendToUser(payload, user, {} as UserSettings);
    expect(result).toBe(false);
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it('sends email to user and returns true', async () => {
    mockSmtp();
    const user = { email: 'reader@example.com' } as User;
    const result = await emailAgent.sendToUser(payload, user, {} as UserSettings);

    expect(result).toBe(true);
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'reader@example.com',
        subject: 'Now Available',
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// test()
// ---------------------------------------------------------------------------
describe('EmailAgent — test()', () => {
  it('sends a test notification to the given address', async () => {
    mockSmtp();
    const result = await emailAgent.test('admin@example.com');

    expect(result).toBe(true);
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'admin@example.com',
        subject: 'Librarr Test Notification',
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// SMTP config guards
// ---------------------------------------------------------------------------
describe('EmailAgent — SMTP config validation', () => {
  it('returns false when smtp config is undefined', async () => {
    mockSmtp(null);
    const result = await emailAgent.test('a@b.com');
    expect(result).toBe(false);
    expect(mockedCreateTransport).not.toHaveBeenCalled();
  });

  it('returns false when host is empty', async () => {
    mockSmtp({ host: '' });
    const result = await emailAgent.test('a@b.com');
    expect(result).toBe(false);
  });

  it('returns false when senderAddress is empty', async () => {
    mockSmtp({ senderAddress: '' });
    const result = await emailAgent.test('a@b.com');
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Transport creation
// ---------------------------------------------------------------------------
describe('EmailAgent — createTransport options', () => {
  it('passes auth when authUser is set', async () => {
    mockSmtp({ authUser: 'user', authPass: 'pass' });
    await emailAgent.test('a@b.com');

    expect(mockedCreateTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: { user: 'user', pass: 'pass' },
      }),
    );
  });

  it('omits auth when no credentials', async () => {
    mockSmtp({ authUser: '', authPass: '' });
    await emailAgent.test('a@b.com');

    expect(mockedCreateTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: undefined,
      }),
    );
  });

  it('defaults port to 587 when not set', async () => {
    mockSmtp({ port: 0 });
    await emailAgent.test('a@b.com');

    expect(mockedCreateTransport).toHaveBeenCalledWith(
      expect.objectContaining({ port: 587 }),
    );
  });

  it('uses configured port', async () => {
    mockSmtp({ port: 465 });
    await emailAgent.test('a@b.com');

    expect(mockedCreateTransport).toHaveBeenCalledWith(
      expect.objectContaining({ port: 465 }),
    );
  });

  it('sets tls.rejectUnauthorized=false when allowSelfSigned', async () => {
    mockSmtp({ allowSelfSigned: true });
    await emailAgent.test('a@b.com');

    expect(mockedCreateTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        tls: { rejectUnauthorized: false },
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// From header
// ---------------------------------------------------------------------------
describe('EmailAgent — from header', () => {
  it('uses "Name <address>" when senderName is set', async () => {
    mockSmtp({ senderName: 'My App', senderAddress: 'app@example.com' });
    await emailAgent.test('a@b.com');

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: '"My App" <app@example.com>',
      }),
    );
  });

  it('uses bare address when senderName is empty', async () => {
    mockSmtp({ senderName: '', senderAddress: 'app@example.com' });
    await emailAgent.test('a@b.com');

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'app@example.com',
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------
describe('EmailAgent — error handling', () => {
  it('returns false when sendMail throws', async () => {
    mockSmtp();
    mockSendMail.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const result = await emailAgent.test('a@b.com');
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// HTML output
// ---------------------------------------------------------------------------
describe('EmailAgent — HTML template', () => {
  function getHtml(): string {
    return mockSendMail.mock.calls[0][0].html as string;
  }

  it('includes subject in the body', async () => {
    mockSmtp();
    await emailAgent.test('a@b.com');
    expect(getHtml()).toContain('Librarr Test Notification');
  });

  it('includes XHTML doctype', async () => {
    mockSmtp();
    await emailAgent.test('a@b.com');
    expect(getHtml()).toContain('<!DOCTYPE html');
    expect(getHtml()).toContain('xhtml1-transitional.dtd');
  });

  it('uses table-based layout (no divs)', async () => {
    mockSmtp();
    await emailAgent.test('a@b.com');
    const html = getHtml();
    expect(html).not.toContain('<div');
    expect(html).toContain('<table role="presentation"');
  });

  it('includes cover image when media has coverUrl', async () => {
    mockSmtp();
    const user = { email: 'a@b.com' } as User;
    await emailAgent.sendToUser(
      {
        notificationType: 1,
        subject: 'New Request',
        message: 'Requested',
        media: { mediaType: 'Ebook', title: 'Test Book', coverUrl: 'https://img.example.com/cover.jpg' },
      },
      user,
      {} as UserSettings,
    );

    const html = getHtml();
    expect(html).toContain('<img src="https://img.example.com/cover.jpg"');
    expect(html).toContain('width="120"');
  });

  it('omits cover image when no coverUrl', async () => {
    mockSmtp();
    const user = { email: 'a@b.com' } as User;
    await emailAgent.sendToUser(
      {
        notificationType: 1,
        subject: 'New Request',
        message: 'Requested',
        media: { mediaType: 'Ebook', title: 'Test Book' },
      },
      user,
      {} as UserSettings,
    );

    expect(getHtml()).not.toContain('<img');
  });

  it('includes media type and title when media is present', async () => {
    mockSmtp();
    const user = { email: 'a@b.com' } as User;
    await emailAgent.sendToUser(
      {
        notificationType: 1,
        subject: 'Test',
        message: 'msg',
        media: { mediaType: 'Audiobook', title: 'Project Hail Mary' },
      },
      user,
      {} as UserSettings,
    );

    const html = getHtml();
    expect(html).toContain('Audiobook');
    expect(html).toContain('Project Hail Mary');
  });

  it('omits media row when no media', async () => {
    mockSmtp();
    await emailAgent.test('a@b.com');
    const html = getHtml();
    // Only the subject, message, separator, and footer — no media-specific content
    expect(html).not.toContain('&mdash;');
  });

  it('escapes HTML in subject and message', async () => {
    mockSmtp();
    const user = { email: 'a@b.com' } as User;
    await emailAgent.sendToUser(
      {
        notificationType: 1,
        subject: '<script>alert("xss")</script>',
        message: 'Hello & "goodbye"',
      },
      user,
      {} as UserSettings,
    );

    const html = getHtml();
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).toContain('Hello &amp; &quot;goodbye&quot;');
  });

  it('always includes "Sent by Librarr" footer', async () => {
    mockSmtp();
    await emailAgent.test('a@b.com');
    expect(getHtml()).toContain('Sent by Librarr');
  });
});
