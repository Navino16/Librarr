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
import DiscordAgent from '@server/lib/notifications/agents/discord';
import type { NotificationPayload } from '@server/lib/notifications/index';

const mockedAxiosPost = vi.mocked(axios.post);
const mockedGetInstance = vi.mocked(Settings.getInstance);

function mockSettings(discord?: { enabled?: boolean; options?: { webhookUrl?: string } }) {
  mockedGetInstance.mockReturnValue({
    notifications: {
      agents: { discord: discord || {} },
    },
  } as never);
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('DiscordAgent — enabled', () => {
  it('returns false when discord is not configured', () => {
    mockSettings(undefined);
    const agent = new DiscordAgent();
    expect(agent.enabled).toBe(false);
  });

  it('returns true when discord.enabled is true', () => {
    mockSettings({ enabled: true, options: { webhookUrl: 'https://discord.com/api/webhooks/123' } });
    const agent = new DiscordAgent();
    expect(agent.enabled).toBe(true);
  });
});

describe('DiscordAgent — send()', () => {
  const basePayload: NotificationPayload = {
    notificationType: 1, // PENDING
    subject: 'New Request',
    message: 'A book was requested',
  };

  it('returns false when webhookUrl is empty', async () => {
    mockSettings({ enabled: true, options: { webhookUrl: '' } });
    const agent = new DiscordAgent();
    expect(await agent.send(basePayload)).toBe(false);
  });

  it('builds a correct Discord embed', async () => {
    mockSettings({ enabled: true, options: { webhookUrl: 'https://discord.com/api/webhooks/123' } });
    mockedAxiosPost.mockResolvedValue({ status: 200 });
    const agent = new DiscordAgent();

    await agent.send(basePayload);

    expect(mockedAxiosPost).toHaveBeenCalledWith(
      'https://discord.com/api/webhooks/123',
      {
        embeds: [expect.objectContaining({
          title: 'New Request',
          description: 'A book was requested',
          color: 0xf59e0b, // PENDING = yellow
          timestamp: expect.any(String),
        })],
      },
    );
  });

  it('adds thumbnail when coverUrl is present', async () => {
    mockSettings({ enabled: true, options: { webhookUrl: 'https://discord.com/api/webhooks/123' } });
    mockedAxiosPost.mockResolvedValue({ status: 200 });
    const agent = new DiscordAgent();

    const payload: NotificationPayload = {
      ...basePayload,
      media: { mediaType: 'book', title: 'Test', coverUrl: 'https://img.example.com/cover.jpg' },
    };

    await agent.send(payload);

    const sentData = mockedAxiosPost.mock.calls[0][1] as { embeds: { thumbnail?: { url: string } }[] };
    expect(sentData.embeds[0].thumbnail).toEqual({ url: 'https://img.example.com/cover.jpg' });
  });

  it('adds media fields when media is present', async () => {
    mockSettings({ enabled: true, options: { webhookUrl: 'https://discord.com/api/webhooks/123' } });
    mockedAxiosPost.mockResolvedValue({ status: 200 });
    const agent = new DiscordAgent();

    const payload: NotificationPayload = {
      ...basePayload,
      media: { mediaType: 'book', title: 'My Book' },
    };

    await agent.send(payload);

    const sentData = mockedAxiosPost.mock.calls[0][1] as { embeds: { fields?: { name: string; value: string; inline: boolean }[] }[] };
    expect(sentData.embeds[0].fields).toEqual([
      { name: 'Type', value: 'book', inline: true },
      { name: 'Title', value: 'My Book', inline: true },
    ]);
  });

  it('returns true on success', async () => {
    mockSettings({ enabled: true, options: { webhookUrl: 'https://discord.com/api/webhooks/123' } });
    mockedAxiosPost.mockResolvedValue({ status: 200 });
    const agent = new DiscordAgent();
    expect(await agent.send(basePayload)).toBe(true);
  });

  it('returns false on network error', async () => {
    mockSettings({ enabled: true, options: { webhookUrl: 'https://discord.com/api/webhooks/123' } });
    mockedAxiosPost.mockRejectedValue(new Error('Network Error'));
    const agent = new DiscordAgent();
    expect(await agent.send(basePayload)).toBe(false);
  });
});

describe('DiscordAgent — getColor (via embed)', () => {
  beforeEach(() => {
    mockSettings({ enabled: true, options: { webhookUrl: 'https://discord.com/api/webhooks/123' } });
    mockedAxiosPost.mockResolvedValue({ status: 200 });
  });

  const colorCases: [number, number, string][] = [
    [1, 0xf59e0b, 'PENDING = yellow'],
    [2, 0x6366f1, 'APPROVED = indigo'],
    [4, 0x22c55e, 'AVAILABLE = green'],
    [8, 0xef4444, 'FAILED = red'],
    [1024, 0x22d3ee, 'TEST = cyan'],
    [9999, 0x94a3b8, 'unknown = gray'],
  ];

  it.each(colorCases)('type %i → color 0x%s (%s)', async (type, expectedColor) => {
    const agent = new DiscordAgent();
    await agent.send({ notificationType: type, subject: 'Test', message: 'msg' } as NotificationPayload);

    const sentData = mockedAxiosPost.mock.calls[0][1] as { embeds: { color: number }[] };
    expect(sentData.embeds[0].color).toBe(expectedColor);
  });
});

describe('DiscordAgent — test()', () => {
  it('sends a test notification', async () => {
    mockSettings({ enabled: true, options: { webhookUrl: 'https://discord.com/api/webhooks/123' } });
    mockedAxiosPost.mockResolvedValue({ status: 200 });
    const agent = new DiscordAgent();

    const result = await agent.test();

    expect(result).toBe(true);
    const sentData = mockedAxiosPost.mock.calls[0][1] as { embeds: { title: string; color: number }[] };
    expect(sentData.embeds[0].title).toBe('Librarr Test Notification');
    expect(sentData.embeds[0].color).toBe(0x22d3ee); // TEST = cyan
  });
});
