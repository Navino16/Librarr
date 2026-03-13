# Issues

Librarr includes a built-in issue tracking system for reporting problems with media items. Users can flag issues on books, and managers can track and resolve them.

## Creating an Issue

Navigate to a book's detail page and click the **Report Issue** button. Select an issue type and optionally add an initial message (up to 2,000 characters).

### Issue Types

| Type | Use case |
|------|----------|
| **Metadata** | Wrong or missing metadata (title, description, cover, author, etc.) |
| **Quality** | Quality problems with the available file |
| **Format** | Format-related issues (wrong format, conversion problems) |
| **Missing Content** | Incomplete or truncated content |
| **Other** | Anything that doesn't fit the above categories |

Creating an issue requires the **Create Issues** permission.

## Issue Workflow

Issues have two statuses:

- **Open** — the issue is active and awaiting resolution
- **Resolved** — the issue has been addressed

Managers with the **Manage Issues** permission can resolve and reopen issues. Resolving or reopening an issue triggers a notification to the issue creator.

## Comments

Issues support threaded comments for discussion between the reporter and managers. Comments can be up to 5,000 characters.

**Who can comment:**
- The issue creator
- Users with the **Manage Issues** permission
- Administrators

Comments can be deleted by their author, managers, or administrators.

Each new comment triggers an **Issue Comment** notification to the issue creator and managers.

## Viewing Issues

The **Issues** page lists all issues with filter tabs:

- **All** / **Open** / **Resolved**

Each issue row shows the media cover, issue number and type, media title, creator, creation date, and status badge.

Regular users can only see their own issues. Users with the **View Issues** or **Manage Issues** permission can see all issues.

Issue counts per book are also shown on book detail pages.

## Notifications

The following notification events are available for issues:

| Event              | Recipients                              |
|--------------------|-----------------------------------------|
| **Issue Created**  | All users with Manage Issues permission |
| **Issue Comment**  | Issue creator + managers                |
| **Issue Resolved** | Issue creator + managers                |
| **Issue Reopened** | Issue creator + managers                |
