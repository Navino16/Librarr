import type React from 'react';
import { IconDiscord, IconEmail, IconTelegram, IconSlack, IconWebhook, IconNotifBell } from './notificationIcons';

type AgentEntry = { key: string; icon: React.FC; color: string };

/** Channel agents — broadcast to channels/groups (admin-configured) */
export const channelAgentConfig: AgentEntry[] = [
  { key: 'discord', icon: IconDiscord, color: 'bg-indigo-500/15 text-indigo-400' },
  { key: 'webhook', icon: IconWebhook, color: 'bg-orange-500/15 text-orange-400' },
  { key: 'telegram', icon: IconTelegram, color: 'bg-sky-500/15 text-sky-400' },
  { key: 'slack', icon: IconSlack, color: 'bg-purple-500/15 text-purple-400' },
  { key: 'gotify', icon: IconNotifBell, color: 'bg-green-500/15 text-green-400' },
  { key: 'pushbullet', icon: IconNotifBell, color: 'bg-teal-500/15 text-teal-400' },
  { key: 'pushover', icon: IconNotifBell, color: 'bg-cyan-500/15 text-cyan-400' },
];

/** Client agents needing server-side config (admin page) */
export const clientServerConfig: AgentEntry[] = [
  { key: 'email', icon: IconEmail, color: 'bg-blue-500/15 text-blue-400' },
];

/** @deprecated Use channelAgentConfig + clientServerConfig */
export const agentConfig: AgentEntry[] = [...channelAgentConfig, ...clientServerConfig];
