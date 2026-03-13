import notificationManager from './index';
import DiscordAgent from './agents/discord';
import WebhookAgent from './agents/webhook';
import emailAgent from './agents/email';
import logger from '../../logger';

export function initNotifications(): void {
  // Global agents (broadcast, filtered by notification type only)
  notificationManager.registerAgent(new DiscordAgent());
  notificationManager.registerAgent(new WebhookAgent());

  // Per-user agents (filtered by user permissions + preferences)
  notificationManager.registerUserAgent(emailAgent);

  logger.info('Notification agents registered');
}
