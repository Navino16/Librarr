import { test, expect } from './fixtures';

// Lidarr feature is currently disabled ("Coming soon").
// These tests will be re-enabled when the feature is implemented.

test.describe('Lidarr Settings Page', () => {
  test('should show coming soon state', async ({ page }) => {
    await page.goto('/settings/lidarr');

    await expect(page.getByText(/coming soon/i)).toBeVisible();
  });
});
