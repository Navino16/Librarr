import { test, expect } from './fixtures';

test.describe('Notification Settings Page', () => {
  test('should display notification agents grid', async ({ page }) => {
    await page.goto('/settings/notifications');

    const main = page.getByRole('main');
    await expect(main.getByRole('heading', { name: 'Notification Settings' })).toBeVisible();

    // Verify that notification agents are displayed
    await expect(main.getByRole('heading', { name: 'Discord' })).toBeVisible();
    await expect(main.getByRole('heading', { name: 'Email' })).toBeVisible();
    await expect(main.getByRole('heading', { name: 'Telegram' })).toBeVisible();
    await expect(main.getByRole('heading', { name: 'Slack' })).toBeVisible();
    await expect(main.getByRole('heading', { name: 'Webhook' })).toBeVisible();
    await expect(main.getByRole('heading', { name: 'Gotify' })).toBeVisible();
    await expect(main.getByRole('heading', { name: 'Pushbullet' })).toBeVisible();
    await expect(main.getByRole('heading', { name: 'Pushover' })).toBeVisible();
  });

  test('should show edit buttons for implemented agents only', async ({ page }) => {
    await page.goto('/settings/notifications');

    const main = page.getByRole('main');
    // Only implemented agents (discord, webhook, email) have edit (pencil) buttons
    // Non-implemented agents show "Coming soon" badge instead
    const editButtons = main.locator('button svg path[d*="18.5 2.5"]');
    await expect(editButtons).toHaveCount(3);

    // Coming soon badges should be visible for non-implemented agents
    await expect(main.getByText('Coming soon').first()).toBeVisible();
  });
});
