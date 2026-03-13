# Notification Settings

Configure how Librarr sends notifications about request and issue events.

Requires the **Manage Notification Settings** permission.

## Channel Agents

Channel agents send notifications to a shared channel (e.g., Discord, webhook). Each agent can be individually enabled and configured with specific notification types.

| Agent       | Status      | Description                                |
|-------------|-------------|--------------------------------------------|
| **Discord** | Available   | Rich embeds via Discord webhook            |
| **Webhook** | Available   | JSON POST to any URL                       |
| Telegram    | Coming soon | —                                          |
| Slack       | Coming soon | —                                          |
| Gotify      | Coming soon | —                                          |

### Discord

- **Webhook URL** — obtain from Discord: Server Settings > Integrations > Webhooks

### Webhook

- **Webhook URL** — any valid HTTPS URL

## Client Agents

Client agents deliver notifications to individual users. Server-side configuration is done here; users toggle their preferences in their own profile settings.

| Agent    | Status      | Description                  |
|----------|-------------|------------------------------|
| **Email**| Available   | HTML emails via SMTP         |

### Email (SMTP)

| Field                        | Default   | Description                               |
|------------------------------|-----------|-------------------------------------------|
| SMTP Host                    | —         | Mail server hostname                      |
| SMTP Port                    | 587       | Mail server port                          |
| SMTP Username                | —         | Authentication username                   |
| SMTP Password                | —         | Authentication password                   |
| Sender Address               | —         | "From" email address                      |
| Sender Name                  | Librarr   | "From" display name                       |
| Use SSL/TLS                  | Off       | Enable for port 465                       |
| Require TLS                  | Off       | Enforce STARTTLS                          |
| Allow Self-Signed Certificates | Off     | For internal/dev mail servers             |

## Notification Types

Each agent can be configured to send only specific event types. See [Notifications](../features/07-notifications.md) for the full list of notification types and recipient rules.

## Testing

Each agent has a **Test** button that sends a test notification to verify the configuration is working.
