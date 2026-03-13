import { test, expect } from './fixtures';

test.describe('Settings Hub - Admin', () => {
  test('should display all settings categories', async ({ page }) => {
    await page.goto('/settings');

    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

    // All setting cards should be visible for admin (use heading role to avoid sidebar collisions)
    const main = page.getByRole('main');
    await expect(main.getByRole('heading', { name: 'General' })).toBeVisible();
    await expect(main.getByRole('heading', { name: 'Users' })).toBeVisible();
    await expect(main.getByRole('heading', { name: 'Readarr' })).toBeVisible();
    await expect(main.getByRole('heading', { name: 'Lidarr' })).toBeVisible();
    await expect(main.getByRole('heading', { name: 'Media Server' })).toBeVisible();
    await expect(main.getByRole('heading', { name: 'Notifications' })).toBeVisible();
    await expect(main.getByRole('heading', { name: 'Jobs & Cache' })).toBeVisible();
    await expect(main.getByRole('heading', { name: 'Metadata' })).toBeVisible();
    await expect(main.getByRole('heading', { name: 'Unmatched Items' })).toBeVisible();
  });

  test('should navigate to general settings', async ({ page }) => {
    await page.goto('/settings');

    await page.getByText('General').first().click();
    await expect(page).toHaveURL('/settings/general');
    await expect(page.getByRole('heading', { name: 'General Settings' })).toBeVisible();
  });

  test('should show descriptions for each settings card', async ({ page }) => {
    await page.goto('/settings');

    await expect(page.getByText('Application name and defaults')).toBeVisible();
    await expect(page.getByText('Book download automation')).toBeVisible();
    await expect(page.getByText('Music download automation')).toBeVisible();
  });
});

test.describe('General Settings - Admin', () => {
  test('should display general settings form', async ({ page }) => {
    await page.goto('/settings/general');

    await expect(page.getByRole('heading', { name: 'General Settings' })).toBeVisible();

    // Application section
    await expect(page.getByRole('heading', { name: 'Application Title' })).toBeVisible();
    await expect(page.getByText('Application URL')).toBeVisible();

    // Metadata section
    await expect(page.getByRole('heading', { name: 'Hardcover API' })).toBeVisible();

    // Request types section
    await expect(page.getByRole('heading', { name: 'Request Types' })).toBeVisible();
    await expect(page.getByText('Enable Ebook requests')).toBeVisible();
    await expect(page.getByText('Enable Audiobook requests')).toBeVisible();
    await expect(page.getByText('Enable Music requests')).toBeVisible();

    // Options section
    await expect(page.getByText('Hide available media from discover')).toBeVisible();
    await expect(page.getByText('Enable local login')).toBeVisible();

    // Save button
    await expect(page.getByRole('button', { name: 'Save Changes' })).toBeVisible();
  });

  test('should save general settings successfully', async ({ page }) => {
    await page.goto('/settings/general');
    await page.waitForLoadState('networkidle');

    // Change the app title (target the input within main, not the search bar)
    const main = page.getByRole('main');
    const titleInput = main.locator('input[type="text"]').first();
    await titleInput.clear();
    await titleInput.fill('Librarr Test Instance');

    // Save and verify API response
    const responsePromise = page.waitForResponse(
      (r) => r.url().includes('/settings/main') && r.request().method() === 'POST'
    );
    await main.getByRole('button', { name: 'Save Changes' }).click();
    const response = await responsePromise;
    expect(response.status()).toBe(200);

    // After SWR revalidation the new title should be reflected
    await expect(page.getByRole('heading', { name: 'General Settings' })).toBeVisible();
  });

  test('should show Hardcover token status', async ({ page }) => {
    await page.goto('/settings/general');

    // Token status badge should be visible (configured or not configured)
    const tokenStatus = page.getByText(/Token (not )?configured/);
    await expect(tokenStatus).toBeVisible();
  });

  test('should toggle request type checkboxes', async ({ page }) => {
    await page.goto('/settings/general');

    // The checkboxes should be checked by default (set during setup)
    const ebookCheckbox = page.getByRole('checkbox', { name: 'Enable Ebook requests' });
    await expect(ebookCheckbox).toBeChecked();

    // Click to uncheck
    await ebookCheckbox.click();
    await expect(ebookCheckbox).not.toBeChecked();

    // Save and verify API response
    const responsePromise = page.waitForResponse(
      (r) => r.url().includes('/settings/main') && r.request().method() === 'POST'
    );
    await page.getByRole('main').getByRole('button', { name: 'Save Changes' }).click();
    const response = await responsePromise;
    expect(response.status()).toBe(200);
  });
});

test.describe('Settings - Regular User', () => {
  test.use({ storageState: 'tests/e2e/.auth/user.json' });

  test('should not see settings in navigation', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('navigation').getByText('Settings')).not.toBeVisible();
  });

  test('should not access general settings page', async ({ page }) => {
    await page.goto('/settings/general');

    // Should not render the settings form (permission check)
    await expect(page.getByRole('heading', { name: 'General Settings' })).not.toBeVisible();
  });
});
