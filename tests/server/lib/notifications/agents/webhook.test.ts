import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('axios');
vi.mock('@server/lib/settings', () => ({
  default: { getInstance: vi.fn() },
}));
vi.mock('@server/logger', () => ({
  default: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import axios from 'axios';
import Settings from '@server/lib/settings';
import WebhookAgent from '@server/lib/notifications/agents/webhook';
import type { NotificationPayload } from '@server/lib/notifications/index';

const mockedAxiosPost = vi.mocked(axios.post);
const mockedGetInstance = vi.mocked(Settings.getInstance);

function mockSettings(webhook?: { enabled?: boolean; options?: { webhookUrl?: string } }) {
  mockedGetInstance.mockReturnValue({
    notifications: {
      agents: { webhook: webhook || {} },
    },
  } as never);
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('WebhookAgent — enabled', () => {
  it('returns false when webhook is not configured', () => {
    mockSettings(undefined);
    const agent = new WebhookAgent();
    expect(agent.enabled).toBe(false);
  });

  it('returns true when webhook.enabled is true', () => {
    mockSettings({ enabled: true, options: { webhookUrl: 'https://hook.example.com' } });
    const agent = new WebhookAgent();
    expect(agent.enabled).toBe(true);
  });
});

describe('WebhookAgent — send()', () => {
  const payload: NotificationPayload = {
    notificationType: 1,
    subject: 'New Request',
    message: 'A book was requested',
    media: { mediaType: 'book', title: 'Test Book', coverUrl: 'https://img.example.com/cover.jpg' },
    request: { requestedBy: 'user1' },
  };

  it('returns false when webhookUrl is empty', async () => {
    mockSettings({ enabled: true, options: { webhookUrl: '' } });
    const agent = new WebhookAgent();
    expect(await agent.send(payload)).toBe(false);
  });

  it('sends POST with correct payload and headers', async () => {
    mockSettings({ enabled: true, options: { webhookUrl: 'https://hook.example.com/notify' } });
    mockedAxiosPost.mockResolvedValue({ status: 200 });
    const agent = new WebhookAgent();

    await agent.send(payload);

    expect(mockedAxiosPost).toHaveBeenCalledWith(
      'https://hook.example.com/notify',
      {
        notification_type: 1,
        subject: 'New Request',
        message: 'A book was requested',
        media: payload.media,
        request: payload.request,
        issue: undefined,
      },
      { headers: { 'Content-Type': 'application/json' }, timeout: 10000 },
    );
  });

  it('returns true on success', async () => {
    mockSettings({ enabled: true, options: { webhookUrl: 'https://hook.example.com' } });
    mockedAxiosPost.mockResolvedValue({ status: 200 });
    const agent = new WebhookAgent();
    expect(await agent.send(payload)).toBe(true);
  });

  it('returns false on network error', async () => {
    mockSettings({ enabled: true, options: { webhookUrl: 'https://hook.example.com' } });
    mockedAxiosPost.mockRejectedValue(new Error('ECONNREFUSED'));
    const agent = new WebhookAgent();
    expect(await agent.send(payload)).toBe(false);
  });
});

describe('WebhookAgent — test()', () => {
  it('sends a test notification with type 1024', async () => {
    mockSettings({ enabled: true, options: { webhookUrl: 'https://hook.example.com' } });
    mockedAxiosPost.mockResolvedValue({ status: 200 });
    const agent = new WebhookAgent();

    const result = await agent.test();

    expect(result).toBe(true);
    expect(mockedAxiosPost).toHaveBeenCalledWith(
      'https://hook.example.com',
      expect.objectContaining({ notification_type: 1024, subject: 'Librarr Test Notification' }),
      expect.any(Object),
    );
  });
});
