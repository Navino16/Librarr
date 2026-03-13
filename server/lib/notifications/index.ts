import type { User } from '../../entity/User';
import type { UserSettings } from '../../entity/UserSettings';
import logger from '../../logger';
import Settings from '../settings';

export enum NotificationType {
  MEDIA_PENDING = 1,
  MEDIA_APPROVED = 2,
  MEDIA_AVAILABLE = 4,
  MEDIA_FAILED = 8,
  MEDIA_DECLINED = 16,
  MEDIA_AUTO_APPROVED = 32,
  ISSUE_CREATED = 64,
  ISSUE_COMMENT = 128,
  ISSUE_RESOLVED = 256,
  ISSUE_REOPENED = 512,
  TEST_NOTIFICATION = 1024,
}

export interface NotificationPayload {
  notificationType: NotificationType;
  subject: string;
  message: string;
  media?: {
    mediaType: string;
    title: string;
    coverUrl?: string;
    format?: string;
  };
  request?: {
    requestedBy: string;
    requestedById?: number;
  };
  issue?: {
    reportedBy: string;
    reportedById?: number;
    issueId?: number;
    issueType: string;
  };
}

export interface NotificationAgent {
  id: string;
  name: string;
  enabled: boolean;
  send(payload: NotificationPayload): Promise<boolean>;
  test(): Promise<boolean>;
}

/**
 * Per-user notification agent (email, pushbullet, pushover, telegram, etc.).
 * Each agent decides whether it can send based on the user's settings.
 */
export interface UserNotificationAgent {
  id: string;
  sendToUser(payload: NotificationPayload, user: User, userSettings: UserSettings): Promise<boolean>;
}

class NotificationManager {
  private agents: Map<string, NotificationAgent> = new Map();
  private userAgents: UserNotificationAgent[] = [];

  registerAgent(agent: NotificationAgent) {
    this.agents.set(agent.id, agent);
  }

  registerUserAgent(agent: UserNotificationAgent) {
    this.userAgents.push(agent);
  }

  getUserAgents(): UserNotificationAgent[] {
    return this.userAgents;
  }

  async sendNotification(payload: NotificationPayload): Promise<void> {
    const settings = Settings.getInstance();
    const agentConfigs = settings.notifications.agents;

    for (const [id, agent] of this.agents) {
      const config = agentConfigs[id];
      if (!config?.enabled) continue;

      // Check if this notification type is enabled for the agent
      if (!(config.types & payload.notificationType)) continue;

      try {
        await agent.send(payload);
        logger.info(`Notification sent via ${agent.name}`, {
          type: payload.notificationType,
        });
      } catch (e) {
        logger.error(`Notification failed via ${agent.name}`, { error: e });
      }
    }
  }

  async testAgent(agentId: string): Promise<boolean> {
    const agent = this.agents.get(agentId);
    if (!agent) return false;
    return agent.test();
  }

  getAgents(): NotificationAgent[] {
    return Array.from(this.agents.values());
  }
}

const notificationManager = new NotificationManager();
export default notificationManager;
