import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@server/logger', () => ({
  default: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@server/lib/settings', () => ({
  default: { getInstance: vi.fn() },
}));

import Settings from '@server/lib/settings';
import type { NotificationAgent, NotificationPayload } from '@server/lib/notifications/index';

const mockedGetInstance = vi.mocked(Settings.getInstance);

function mockAgent(overrides: Partial<NotificationAgent> = {}): NotificationAgent {
  return {
    id: 'test-agent',
    name: 'Test Agent',
    enabled: true,
    send: vi.fn().mockResolvedValue(true),
    test: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

function mockSettings(agents: Record<string, { enabled?: boolean; types: number }>) {
  mockedGetInstance.mockReturnValue({
    notifications: { agents },
  } as never);
}

const payload: NotificationPayload = {
  notificationType: 1,
  subject: 'Test',
  message: 'Hello',
};

// Use dynamic imports with resetModules to get a fresh singleton each test
async function freshManager() {
  vi.resetModules();
  // Re-apply mocks after resetModules
  vi.doMock('@server/logger', () => ({
    default: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
  }));
  vi.doMock('@server/lib/settings', () => ({
    default: { getInstance: mockedGetInstance },
  }));
  const mod = await import('@server/lib/notifications/index');
  return mod.default;
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('NotificationManager — registerAgent / getAgents', () => {
  it('registers and retrieves agents', async () => {
    const mgr = await freshManager();
    const agent = mockAgent({ id: 'webhook' });
    mgr.registerAgent(agent);
    expect(mgr.getAgents()).toEqual([agent]);
  });
});

describe('NotificationManager — sendNotification', () => {
  it('calls send on an enabled agent with matching type', async () => {
    const mgr = await freshManager();
    const agent = mockAgent({ id: 'webhook' });
    mgr.registerAgent(agent);
    mockSettings({ webhook: { enabled: true, types: 0xffff } });

    await mgr.sendNotification(payload);

    expect(agent.send).toHaveBeenCalledWith(payload);
  });

  it('skips a disabled agent', async () => {
    const mgr = await freshManager();
    const agent = mockAgent({ id: 'webhook' });
    mgr.registerAgent(agent);
    mockSettings({ webhook: { enabled: false, types: 0xffff } });

    await mgr.sendNotification(payload);

    expect(agent.send).not.toHaveBeenCalled();
  });

  it('skips when notification type is not in the bitmask', async () => {
    const mgr = await freshManager();
    const agent = mockAgent({ id: 'webhook' });
    mgr.registerAgent(agent);
    // type 1 (PENDING) not included in types bitmask of 4 (AVAILABLE only)
    mockSettings({ webhook: { enabled: true, types: 4 } });

    await mgr.sendNotification(payload);

    expect(agent.send).not.toHaveBeenCalled();
  });

  it('continues if an agent throws', async () => {
    const mgr = await freshManager();
    const failAgent = mockAgent({ id: 'fail', send: vi.fn().mockRejectedValue(new Error('boom')) });
    const okAgent = mockAgent({ id: 'ok' });
    mgr.registerAgent(failAgent);
    mgr.registerAgent(okAgent);
    mockSettings({
      fail: { enabled: true, types: 0xffff },
      ok: { enabled: true, types: 0xffff },
    });

    await mgr.sendNotification(payload);

    expect(failAgent.send).toHaveBeenCalled();
    expect(okAgent.send).toHaveBeenCalled();
  });
});

describe('NotificationManager — testAgent', () => {
  it('calls test() on the agent', async () => {
    const mgr = await freshManager();
    const agent = mockAgent({ id: 'discord' });
    mgr.registerAgent(agent);

    const result = await mgr.testAgent('discord');

    expect(result).toBe(true);
    expect(agent.test).toHaveBeenCalled();
  });

  it('returns false for an unknown agent', async () => {
    const mgr = await freshManager();
    const result = await mgr.testAgent('nonexistent');
    expect(result).toBe(false);
  });
});
