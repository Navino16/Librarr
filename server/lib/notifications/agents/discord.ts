import axios from 'axios';
import { NotificationAgent, NotificationPayload } from '../index';
import Settings from '../../settings';
import logger from '../../../logger';

class DiscordAgent implements NotificationAgent {
  id = 'discord';
  name = 'Discord';

  get enabled(): boolean {
    const settings = Settings.getInstance();
    return settings.notifications.agents.discord?.enabled || false;
  }

  private get webhookUrl(): string {
    const settings = Settings.getInstance();
    return settings.notifications.agents.discord?.options?.webhookUrl || '';
  }

  private isValidDiscordUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return (
        parsed.protocol === 'https:' &&
        (parsed.hostname === 'discord.com' || parsed.hostname.endsWith('.discord.com'))
      );
    } catch {
      return false;
    }
  }

  async send(payload: NotificationPayload): Promise<boolean> {
    if (!this.webhookUrl || !this.isValidDiscordUrl(this.webhookUrl)) return false;

    try {
      const embed: {
        title: string;
        description?: string;
        color: number;
        timestamp: string;
        thumbnail?: { url: string };
        fields?: { name: string; value: string; inline: boolean }[];
      } = {
        title: payload.subject,
        description: payload.message,
        color: this.getColor(payload.notificationType),
        timestamp: new Date().toISOString(),
      };

      if (payload.media?.coverUrl) {
        embed.thumbnail = { url: payload.media.coverUrl };
      }

      if (payload.media) {
        embed.fields = [
          { name: 'Type', value: payload.media.mediaType, inline: true },
          { name: 'Title', value: payload.media.title, inline: true },
        ];
      }

      await axios.post(this.webhookUrl, {
        embeds: [embed],
      });

      return true;
    } catch (e) {
      logger.error('Discord notification error', { error: e });
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

  private getColor(type: number): number {
    const colors: Record<number, number> = {
      1: 0xf59e0b,   // PENDING - yellow
      2: 0x6366f1,   // APPROVED - indigo
      4: 0x22c55e,   // AVAILABLE - green
      8: 0xef4444,   // FAILED - red
      16: 0xef4444,  // DECLINED - red
      32: 0x6366f1,  // AUTO_APPROVED - indigo
      64: 0xf59e0b,  // ISSUE_CREATED - yellow
      128: 0x94a3b8, // ISSUE_COMMENT - gray
      256: 0x22c55e, // ISSUE_RESOLVED - green
      512: 0xf59e0b, // ISSUE_REOPENED - yellow
      1024: 0x22d3ee, // TEST - cyan
    };
    return colors[type] || 0x94a3b8;
  }
}

export default DiscordAgent;
