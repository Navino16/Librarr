# Users & Roles Settings

Manage roles and their associated permissions. This page is accessible to users with the **Manage Permissions Settings** permission.

## Roles

Roles are preset permission combinations that can be applied to users.

### Built-in Roles

| Role        | Description                                                                                    |
|-------------|------------------------------------------------------------------------------------------------|
| **Admin**   | Full access to everything                                                                      |
| **Manager** | Manage users, all request/view permissions, all issue permissions, bypass request quota         |
| **User**    | Request ebook, request audiobook, request music, create issues, view issues                     |

Built-in roles cannot be deleted or renamed. Their permissions are fixed.

### Custom Roles

Click **Create Role** to define a custom role with any combination of permissions.

- **Name** — display name for the role
- **Permissions** — toggle individual permissions grouped by category
- **Default** — one role can be marked as default, automatically applied to new users created via Plex or OIDC auto-create

### Request Quotas

Each role can define per-format request quotas:

- **Ebook quota** — max ebook requests per 7-day sliding window
- **Audiobook quota** — max audiobook requests per 7-day sliding window
- **Music quota** — *(coming soon)*

Leave empty for unlimited. Quotas can be overridden per-user in the user's settings page.

See [Users & Permissions](../features/06-users-and-permissions.md) for the full permission list and quota resolution logic.
