import { test, expect } from './fixtures';

test.describe('Readarr Settings Page', () => {
  const mockServer = {
    id: 1,
    name: 'Main Readarr',
    hostname: 'localhost',
    port: 8787,
    apiKey: 'test-api-key-123',
    useSsl: false,
    baseUrl: '',
    activeProfileId: 1,
    activeDirectory: '/books',
    isDefault: true,
    contentType: 'ebook',
  };

  function setupRoutes(
    page: import('@playwright/test').Page,
    servers: typeof mockServer[] = [mockServer]
  ) {
    return page.route('**/api/v1/settings/readarr', (route) => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(servers),
        });
      } else if (route.request().method() === 'POST') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: 2, ...JSON.parse(route.request().postData() || '{}') }),
        });
      } else {
        route.continue();
      }
    });
  }

  test('should display empty state when no servers configured', async ({ page }) => {
    await setupRoutes(page, []);
    await page.goto('/settings/readarr');

    await expect(page.getByRole('heading', { name: 'Readarr Settings' })).toBeVisible();
    await expect(page.getByText('No Readarr servers configured.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add Server' }).first()).toBeVisible();
  });

  test('should display server list with server cards', async ({ page }) => {
    await setupRoutes(page);
    await page.goto('/settings/readarr');

    await expect(page.getByRole('heading', { name: 'Readarr Settings' })).toBeVisible();

    // Server card should show name and connection info
    await expect(page.getByText('Main Readarr')).toBeVisible();
    await expect(page.getByText('http://localhost:8787')).toBeVisible();

    // Content type badge
    await expect(page.getByText('Ebook')).toBeVisible();

    // Default badge
    await expect(page.getByText('Default')).toBeVisible();
  });

  test('should show add server form', async ({ page }) => {
    await setupRoutes(page);
    await page.goto('/settings/readarr');

    // Click the Add Server button
    await page.getByRole('button', { name: 'Add Server' }).first().click();

    // The form fields should appear
    await expect(page.getByText('Name', { exact: true })).toBeVisible();
    await expect(page.getByText('Hostname', { exact: true })).toBeVisible();
    await expect(page.getByText('Port', { exact: true })).toBeVisible();
    await expect(page.getByText('API Key', { exact: true })).toBeVisible();
    await expect(page.getByText('Root Folder', { exact: true })).toBeVisible();

    // Action buttons
    await expect(page.getByRole('button', { name: 'Test Connection' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
  });

  test('should test connection successfully', async ({ page }) => {
    await setupRoutes(page);

    // Mock test endpoint with success
    await page.route('**/api/v1/settings/readarr/test', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    });

    await page.goto('/settings/readarr');

    // Open the add form
    await page.getByRole('button', { name: 'Add Server' }).first().click();

    // Click Test Connection
    await page.getByRole('button', { name: 'Test Connection' }).click();

    // Success message should appear
    await expect(page.getByText('Connection successful!')).toBeVisible();
  });

  test('should show test connection failure', async ({ page }) => {
    await setupRoutes(page);

    // Mock test endpoint with failure
    await page.route('**/api/v1/settings/readarr/test', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: false }),
      });
    });

    await page.goto('/settings/readarr');

    // Open the add form
    await page.getByRole('button', { name: 'Add Server' }).first().click();

    // Click Test Connection
    await page.getByRole('button', { name: 'Test Connection' }).click();

    // Failure message should appear
    await expect(page.getByText('Connection failed')).toBeVisible();
  });

  test('should delete a server with confirmation', async ({ page }) => {
    let deleted = false;

    await setupRoutes(page);

    // Mock DELETE endpoint
    await page.route('**/api/v1/settings/readarr/1', (route) => {
      if (route.request().method() === 'DELETE') {
        deleted = true;
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        });
      } else {
        route.continue();
      }
    });

    await page.goto('/settings/readarr');

    // Wait for server card to be visible
    await expect(page.getByText('Main Readarr')).toBeVisible();

    // Set up dialog handler to accept the confirm prompt
    page.on('dialog', (dialog) => dialog.accept());

    // Click the delete button (identified by title)
    await page.getByTitle('Delete').click();

    // Verify the DELETE request was made
    await page.waitForTimeout(500);
    expect(deleted).toBe(true);
  });
});
