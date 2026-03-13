# Notifications

Librarr can notify users and administrators about request and issue events through multiple channels. Notifications are split into two categories: **channel agents** (server-wide broadcasts) and **client agents** (per-user delivery).

## Notification Types

| Type                    | Trigger                                         |
|-------------------------|-------------------------------------------------|
| **Media Pending**       | A new request is submitted                      |
| **Media Approved**      | A request is approved                           |
| **Media Available**     | Requested media is now available in the library |
| **Media Failed**        | Request processing encountered an error         |
| **Media Declined**      | A request is declined                           |
| **Media Auto-Approved** | A request is automatically approved             |
| **Issue Created**       | A new issue is reported                         |
| **Issue Comment**       | A comment is added to an issue                  |
| **Issue Resolved**      | An issue is resolved                            |
| **Issue Reopened**      | A resolved issue is reopened                    |

## Who Receives Notifications

Each notification type is sent to a specific set of users:

| Type                | Recipients                                                      |
|---------------------|-----------------------------------------------------------------|
| Media Pending       | Managers (users with Manage Requests permission for the format) |
| Media Approved      | The requesting user                                             |
| Media Available     | The requesting user                                             |
| Media Failed        | The requesting user + managers                                  |
| Media Declined      | The requesting user                                             |
| Media Auto-Approved | Managers (users with Manage Requests permission for the format) |
| Issue Created       | Users with Manage Issues permission                             |
| Issue Comment       | Issue creator + managers                                        |
| Issue Resolved      | Issue creator + managers                                        |
| Issue Reopened      | Issue creator + managers                                        |

The user who triggered the event is always excluded from the notification (e.g., an admin who approves a request will not receive the "approved" notification).

## Channel Agents

Channel agents send notifications to a shared channel visible to administrators. They are configured in **Settings > Notifications**. Each agent can be individually enabled and configured with a bitmask of notification types to filter which events are sent.

### Discord

Sends rich embed messages to a Discord channel via a webhook URL.

**Configuration:**
- **Webhook URL** — must be a `https://discord.com/*` URL. Obtain it from Discord: Server Settings > Integrations > Webhooks

Embeds are color-coded by event type (yellow for pending/issues, indigo for approved, green for available, red for failed/declined).

### Webhook

Sends an HTTP POST with a JSON payload to any URL. Useful for custom integrations or automation.

**Configuration:**
- **Webhook URL** — any valid HTTPS URL

**Payload format:**
```json
{
  "notification_type": "MEDIA_APPROVED",
  "subject": "Request Approved",
  "message": "Your request for ... has been approved",
  "media": { ... },
  "request": { ... },
  "issue": { ... }
}
```

### Planned Channel Agents

The following channel agents are planned for future releases:

- **Telegram** *(coming soon)*
- **Slack** *(coming soon)*
- **Gotify** *(coming soon)*
- **Pushbullet** *(coming soon)*
- **Pushover** *(coming soon)*

## Client Agents

Client agents deliver notifications to individual users. All notification types are **enabled by default** for new users. Each user can disable specific types from their **User Settings > Notifications** page. The available types are filtered by the user's permissions — users will only see notification types they are eligible to receive.

### Email

Sends HTML emails via SMTP to each user's registered email address. Users without an email address are skipped.

**Server configuration** (admin, in Settings > Notifications):
- **SMTP Host** — your mail server hostname
- **SMTP Port** — default: 587
- **SMTP Username** and **Password**
- **Sender Address** — the "from" address
- **Sender Name** — defaults to "Librarr"
- **Use SSL/TLS** — enable for port 465
- **Require TLS** — enforce TLS (STARTTLS)
- **Allow Self-Signed Certificates** — for development/internal mail servers

**User configuration** (per-user, in User Settings > Notifications):
- Toggle individual notification types on/off

### Planned Client Agents

The following per-user notification agents are planned:

- **Pushbullet** *(coming soon)*
- **Pushover** *(coming soon)*

## Testing Notifications

Each notification agent has a **Test** button in the admin settings. Clicking it sends a test notification through the configured agent to verify the setup is working correctly.
