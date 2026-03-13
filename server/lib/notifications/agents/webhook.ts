import axios from 'axios';
import { NotificationAgent, NotificationPayload } from '../index';
import Settings from '../../settings';
import logger from '../../../logger';

class WebhookAgent implements NotificationAgent {
  id = 'webhook';
  name = 'Webhook';

  get enabled(): boolean {
    const settings = Settings.getInstance();
    return settings.notifications.agents.webhook?.enabled || false;
  }

  private get webhookUrl(): string {
    const settings = Settings.getInstance();
    return settings.notifications.agents.webhook?.options?.webhookUrl || '';
  }

  private isValidUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  async send(payload: NotificationPayload): Promise<boolean> {
    if (!this.webhookUrl || !this.isValidUrl(this.webhookUrl)) return false;

    try {
      await axios.post(this.webhookUrl, {
        notification_type: payload.notificationType,
        subject: payload.subject,
        message: payload.message,
        media: payload.media,
        request: payload.request,
        issue: payload.issue,
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000,
      });

      return true;
    } catch (e) {
      logger.error('Webhook notification error', { error: e });
      return false;
    }
  }

  async test(): Promise<boolean> {
    return this.send({
      notificationType: 1024,
      subject: 'Librarr Test Notification',
      message: 'This is a test notification from Librarr.',
    });
  }
}

export default WebhookAgent;
