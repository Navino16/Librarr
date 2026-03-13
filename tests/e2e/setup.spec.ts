import { test, expect } from './fixtures';

// No auth needed — this runs against a virgin instance (port 5155)
test.use({ storageState: { cookies: [], origins: [] } });

test.describe.serial('Setup Wizard', () => {
  test('should redirect to /setup when not initialized', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/setup/);
  });

  test('should validate password mismatch', async ({ page }) => {
    await page.goto('/setup');

    await page.getByLabel('Username').fill('admin');
    await page.getByLabel('Email').fill('admin@test.com');
    await page.getByLabel('Password', { exact: true }).fill('adminadmin');
    await page.getByLabel('Confirm Password').fill('different123');
    await page.getByRole('button', { name: 'Next', exact: true }).click();

    await expect(page.getByText('Passwords do not match')).toBeVisible();
  });

  test('should validate password minimum length', async ({ page }) => {
    await page.goto('/setup');

    await page.getByLabel('Username').fill('admin');
    await page.getByLabel('Email').fill('admin@test.com');
    await page.getByLabel('Password', { exact: true }).fill('short');
    await page.getByLabel('Confirm Password').fill('short');

    // Remove HTML5 minLength so our custom JS validation can run
    await page.evaluate(() => {
      document.querySelector('form')?.setAttribute('novalidate', '');
    });
    await page.getByRole('button', { name: 'Next', exact: true }).click();

    await expect(page.getByText('Password must be at least 8 characters')).toBeVisible();
  });

  test('should show music requests as coming soon', async ({ page }) => {
    await page.goto('/setup');

    // Step 1: fill valid account info and proceed
    await page.getByLabel('Username').fill('admin');
    await page.getByLabel('Email').fill('admin@test.com');
    await page.getByLabel('Password', { exact: true }).fill('adminadmin');
    await page.getByLabel('Confirm Password').fill('adminadmin');
    await page.getByRole('button', { name: 'Next', exact: true }).click();

    // Step 2: Music checkbox should be disabled with "Coming soon" badge
    await expect(page.getByText('Request Types')).toBeVisible();
    await expect(page.getByText('Enable Music requests')).toBeVisible();
    await expect(page.getByText('Coming soon')).toBeVisible();

    // Music checkbox should be disabled (not clickable)
    const musicCheckbox = page.locator('input[type="checkbox"][disabled]');
    await expect(musicCheckbox).toBeVisible();

    // Lidarr step should still be visible in nav (step always shown)
    const nav = page.locator('nav');
    await expect(nav.getByText('Lidarr')).toBeVisible();
  });

  // Helper to navigate to a specific setup step
  async function navigateToStep(page: import('@playwright/test').Page, step: number) {
    await page.goto('/setup');

    // Step 1: fill account
    await page.getByLabel('Username').fill('admin');
    await page.getByLabel('Email').fill('admin@test.com');
    await page.getByLabel('Password', { exact: true }).fill('adminadmin');
    await page.getByLabel('Confirm Password').fill('adminadmin');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    if (step <= 2) return;

    // Step 2: Request Types
    await expect(page.getByText('Request Types')).toBeVisible();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    if (step <= 3) return;

    // Step 3: Hardcover — skip
    await expect(page.getByText('Hardcover API')).toBeVisible();
    await page.getByText('Skip').click();
    if (step <= 4) return;

    // Step 4: Media Server — skip
    await expect(page.getByRole('heading', { name: 'Media Server' })).toBeVisible();
    await page.getByText('Skip').click();
    if (step <= 5) return;

    // Step 5: Readarr — skip
    await expect(page.getByRole('heading', { name: /Readarr/ })).toBeVisible();
    await page.getByText('Skip').click();
    if (step <= 6) return;

    // Step 6: Lidarr — coming soon, click Next
    await expect(page.getByRole('heading', { name: /Lidarr/ })).toBeVisible();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
  }

  test('Step 4: should display media server type selector and form', async ({ page }) => {
    await page.route('**/api/v1/settings/*/test', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    });

    await navigateToStep(page, 4);
    await expect(page.getByRole('heading', { name: 'Media Server' })).toBeVisible();

    // Type selector buttons
    await expect(page.getByText('Jellyfin')).toBeVisible();
    await expect(page.getByText('Plex')).toBeVisible();
    await expect(page.getByText('Audiobookshelf')).toBeVisible();

    // Form fields
    await expect(page.locator('input[placeholder="localhost"]')).toBeVisible();
    await expect(page.locator('input[type="number"]')).toBeVisible();
    await expect(page.getByText('Use SSL')).toBeVisible();
  });

  test('Step 4: should switch to Plex and show token field', async ({ page }) => {
    await navigateToStep(page, 4);
    await page.getByText('Plex').click();
    await expect(page.locator('input[placeholder="X-Plex-Token"]')).toBeVisible();
  });

  test('Step 4: should switch to Audiobookshelf and show API key field', async ({ page }) => {
    await navigateToStep(page, 4);
    await page.getByText('Audiobookshelf').click();
    await expect(page.locator('input[placeholder="API Key"]')).toBeVisible();
  });

  test('Step 4: should test connection and show success', async ({ page }) => {
    await page.route('**/api/v1/settings/*/test', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    });

    await navigateToStep(page, 4);
    await page.locator('input[placeholder="localhost"]').fill('my-jellyfin');
    await page.getByRole('button', { name: /Test Connection/i }).click();
    await expect(page.getByText('Connection successful')).toBeVisible();
  });

  test('Step 4: should save media server and show saved card', async ({ page }) => {
    await navigateToStep(page, 4);
    await page.locator('input[placeholder="localhost"]').fill('my-jellyfin');
    await page.getByRole('button', { name: 'Save' }).click();

    // After save, the "Add Another" button should appear (form replaced by card)
    await expect(page.getByRole('button', { name: 'Add Another' })).toBeVisible();
    // Saved card URL
    await expect(page.locator('code').getByText('http://my-jellyfin:8096')).toBeVisible();
  });

  test('Step 5: should display Readarr form fields', async ({ page }) => {
    await navigateToStep(page, 5);
    await expect(page.getByRole('heading', { name: /Readarr/ })).toBeVisible();
    await expect(page.locator('input[placeholder="My Readarr"]')).toBeVisible();
    await expect(page.locator('input[placeholder="localhost"]')).toBeVisible();
    await expect(page.locator('input[placeholder="API Key from Readarr"]')).toBeVisible();
    await expect(page.locator('input[placeholder="/books"]')).toBeVisible();
    await expect(page.getByText('Ebook', { exact: true })).toBeVisible();
    await expect(page.getByText('Audiobook', { exact: true })).toBeVisible();
  });

  test('Step 5: should test Readarr connection', async ({ page }) => {
    await page.route('**/api/v1/settings/readarr/test', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    });

    await navigateToStep(page, 5);
    await page.locator('input[placeholder="localhost"]').fill('my-readarr');
    await page.locator('input[placeholder="API Key from Readarr"]').fill('test-key');
    await page.getByRole('button', { name: /Test Connection/i }).click();
    await expect(page.getByText('Connection successful')).toBeVisible();
  });

  test('Step 6: should display Lidarr coming soon state', async ({ page }) => {
    await navigateToStep(page, 6);
    await expect(page.getByRole('heading', { name: /Lidarr/ })).toBeVisible();
    await expect(page.getByText('Coming soon')).toBeVisible();
  });

  test('Step 7: should display confirmation summary', async ({ page }) => {
    await navigateToStep(page, 7);
    await expect(page.getByText('Ready to Go!')).toBeVisible();
    await expect(page.getByText('admin', { exact: true })).toBeVisible();
    await expect(page.getByText('admin@test.com')).toBeVisible();
    await expect(page.getByText('Ebook')).toBeVisible();
    await expect(page.getByText('Audiobook')).toBeVisible();
    await expect(page.getByText('Music')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Complete Setup' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Back' })).toBeVisible();
  });

  // IMPORTANT: This test MUST be last as it initializes the app
  test('should complete the full setup wizard', async ({ page }) => {
    await page.goto('/setup');

    // Step 1: Account
    await page.getByLabel('Username').fill('admin');
    await page.getByLabel('Email').fill('admin@test.com');
    await page.getByLabel('Password', { exact: true }).fill('adminadmin');
    await page.getByLabel('Confirm Password').fill('adminadmin');
    await page.getByRole('button', { name: 'Next', exact: true }).click();

    // Step 2: Request Types — defaults are all checked, just proceed
    await expect(page.getByText('Request Types')).toBeVisible();
    await page.getByRole('button', { name: 'Next', exact: true }).click();

    // Step 3: Hardcover — skip
    await expect(page.getByText('Hardcover API')).toBeVisible();
    await page.getByText('Skip').click();

    // Step 4: Media Server — skip
    await expect(page.getByRole('heading', { name: 'Media Server' })).toBeVisible();
    await page.getByText('Skip').click();

    // Step 5: Readarr — skip
    await expect(page.getByRole('heading', { name: /Readarr/ })).toBeVisible();
    await page.getByText('Skip').click();

    // Step 6: Lidarr — coming soon, click Next
    await expect(page.getByRole('heading', { name: /Lidarr/ })).toBeVisible();
    await page.getByRole('button', { name: 'Next', exact: true }).click();

    // Step 7: Confirm — verify summary
    await expect(page.getByText('Ready to Go!')).toBeVisible();
    await expect(page.getByText('admin', { exact: true })).toBeVisible();
    await expect(page.getByText('admin@test.com')).toBeVisible();
    await expect(page.getByText('Ebook')).toBeVisible();
    await expect(page.getByText('Audiobook')).toBeVisible();
    await expect(page.getByText('Music')).toBeVisible();

    // Complete setup
    await page.getByRole('button', { name: 'Complete Setup' }).click();

    // Should redirect to home page and show admin username
    await expect(page).toHaveURL('/', { timeout: 10000 });
    await expect(page.getByRole('button', { name: /admin/ })).toBeVisible();
  });
});
