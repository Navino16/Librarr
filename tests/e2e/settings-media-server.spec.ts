import { test, expect } from './fixtures';

test.describe('Media Server Settings Page', () => {
  const mockJellyfin = {
    hostname: 'jellyfin.local',
    port: 8096,
    useSsl: false,
    baseUrl: '',
    serverId: 'jf-123',
    apiKey: 'jf-api-key',
  };

  const _mockPlex = {
    hostname: 'plex.local',
    port: 32400,
    useSsl: false,
    token: 'plex-token-xyz',
    machineId: 'machine-456',
  };

  const mockAudiobookshelf = {
    hostname: 'abs.local',
    port: 13378,
    useSsl: false,
    baseUrl: '',
    apiKey: 'abs-api-key',
  };

  function setupEmptyRoutes(page: import('@playwright/test').Page) {
    return Promise.all([
      page.route('**/api/v1/settings/jellyfin', (route) => {
        if (route.request().method() === 'GET') {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({}),
          });
        } else {
          route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
        }
      }),
      page.route('**/api/v1/settings/plex', (route) => {
        if (route.request().method() === 'GET') {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({}),
          });
        } else {
          route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
        }
      }),
      page.route('**/api/v1/settings/audiobookshelf', (route) => {
        if (route.request().method() === 'GET') {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({}),
          });
        } else {
          route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
        }
      }),
    ]);
  }

  function setupJellyfinRoute(page: import('@playwright/test').Page) {
    return Promise.all([
      page.route('**/api/v1/settings/jellyfin', (route) => {
        if (route.request().method() === 'GET') {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(mockJellyfin),
          });
        } else {
          route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
        }
      }),
      page.route('**/api/v1/settings/plex', (route) => {
        if (route.request().method() === 'GET') {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({}),
          });
        } else {
          route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
        }
      }),
      page.route('**/api/v1/settings/audiobookshelf', (route) => {
        if (route.request().method() === 'GET') {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({}),
          });
        } else {
          route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
        }
      }),
    ]);
  }

  function setupAudiobookshelfRoute(page: import('@playwright/test').Page) {
    return Promise.all([
      page.route('**/api/v1/settings/jellyfin', (route) => {
        if (route.request().method() === 'GET') {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({}),
          });
        } else {
          route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
        }
      }),
      page.route('**/api/v1/settings/plex', (route) => {
        if (route.request().method() === 'GET') {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({}),
          });
        } else {
          route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
        }
      }),
      page.route('**/api/v1/settings/audiobookshelf', (route) => {
        if (route.request().method() === 'GET') {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(mockAudiobookshelf),
          });
        } else {
          route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
        }
      }),
    ]);
  }

  test('should display empty state when no servers configured', async ({ page }) => {
    await setupEmptyRoutes(page);
    await page.goto('/settings/media-server');

    await expect(page.getByRole('heading', { name: 'Media Server Settings' })).toBeVisible();

    // Empty state message and Add Server button
    await expect(
      page.getByText('No media servers configured. Click "Add Server" to get started.')
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add Server' }).first()).toBeVisible();
  });

  test('should display configured Jellyfin server', async ({ page }) => {
    await setupJellyfinRoute(page);
    await page.goto('/settings/media-server');

    await expect(page.getByRole('heading', { name: 'Media Server Settings' })).toBeVisible();

    // Jellyfin server card should be visible with label and URL
    const main = page.getByRole('main');
    await expect(main.getByText('Jellyfin').first()).toBeVisible();
    await expect(main.getByText('http://jellyfin.local:8096')).toBeVisible();
  });

  test('should display configured Audiobookshelf server', async ({ page }) => {
    await setupAudiobookshelfRoute(page);
    await page.goto('/settings/media-server');

    await expect(page.getByRole('heading', { name: 'Media Server Settings' })).toBeVisible();

    // Audiobookshelf server card should be visible with label and URL
    const main = page.getByRole('main');
    await expect(main.getByText('Audiobookshelf').first()).toBeVisible();
    await expect(main.getByText('http://abs.local:13378')).toBeVisible();
  });

  test('should show server type selector when adding', async ({ page }) => {
    await setupEmptyRoutes(page);
    await page.goto('/settings/media-server');

    // Click Add Server button
    await page.getByRole('button', { name: 'Add Server' }).first().click();

    // Server type selector should show 3 type buttons
    await expect(page.getByRole('button', { name: 'Jellyfin', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Plex', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Audiobookshelf', exact: true })).toBeVisible();

    // Form fields should be visible
    await expect(page.getByText('Hostname')).toBeVisible();
    await expect(page.getByText('Port')).toBeVisible();
  });

  test('should test Jellyfin connection successfully', async ({ page }) => {
    await setupEmptyRoutes(page);

    // Mock the test connection endpoint for Jellyfin
    await page.route('**/api/v1/settings/jellyfin/test', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    });

    await page.goto('/settings/media-server');

    // Open add server form
    await page.getByRole('button', { name: 'Add Server' }).first().click();

    // Jellyfin should be selected by default; fill in hostname
    const main = page.getByRole('main');
    const hostnameInput = main.locator('input[type="text"]').first();
    await hostnameInput.fill('jellyfin.local');

    // Click Test Connection
    await page.getByRole('button', { name: 'Test Connection' }).click();

    // Success message should appear
    await expect(page.getByText('Connection successful!')).toBeVisible();
  });

  test('should show test connection failure', async ({ page }) => {
    await setupEmptyRoutes(page);

    // Mock the test connection endpoint for Jellyfin returning failure
    await page.route('**/api/v1/settings/jellyfin/test', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: false }),
      });
    });

    await page.goto('/settings/media-server');

    // Open add server form
    await page.getByRole('button', { name: 'Add Server' }).first().click();

    // Fill in hostname
    const main = page.getByRole('main');
    const hostnameInput = main.locator('input[type="text"]').first();
    await hostnameInput.fill('bad-host.local');

    // Click Test Connection
    await page.getByRole('button', { name: 'Test Connection' }).click();

    // Failure message should appear
    await expect(page.getByText('Connection failed')).toBeVisible();
  });

  test('should edit an existing Jellyfin server', async ({ page }) => {
    await setupJellyfinRoute(page);
    await page.goto('/settings/media-server');

    const main = page.getByRole('main');
    await expect(main.getByText('Jellyfin').first()).toBeVisible();

    // Click edit button on Jellyfin card
    const editBtn = main.locator('button').filter({ has: page.locator('svg') }).nth(1);
    await editBtn.click();

    // Edit form should show with hostname pre-filled
    await expect(main.locator('input[placeholder="localhost"]')).toBeVisible();
  });

  test('should save a new server via Add Server form', async ({ page }) => {
    await setupEmptyRoutes(page);

    let savedPayload: Record<string, unknown> | null = null;
    await page.route('**/api/v1/settings/jellyfin', (route) => {
      if (route.request().method() === 'POST') {
        savedPayload = route.request().postDataJSON();
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        });
      } else {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({}),
        });
      }
    });

    await page.goto('/settings/media-server');
    await page.getByRole('button', { name: 'Add Server' }).first().click();

    // Fill hostname
    const main = page.getByRole('main');
    await main.locator('input[placeholder="localhost"]').fill('new-jellyfin.local');

    // Click Save
    await page.getByRole('button', { name: 'Save' }).click();

    // Verify POST was made
    await expect(() => {
      expect(savedPayload).toBeTruthy();
      expect(savedPayload!.hostname).toBe('new-jellyfin.local');
    }).toPass({ timeout: 5000 });
  });

  test('should switch to Plex type and show token field in add form', async ({ page }) => {
    await setupEmptyRoutes(page);
    await page.goto('/settings/media-server');

    await page.getByRole('button', { name: 'Add Server' }).first().click();

    // Switch to Plex
    await page.getByRole('button', { name: 'Plex', exact: true }).click();

    // Plex Token field should appear
    await expect(page.getByText('Plex Token')).toBeVisible();
  });

  test('should switch to Audiobookshelf type and show API key in add form', async ({ page }) => {
    await setupEmptyRoutes(page);
    await page.goto('/settings/media-server');

    await page.getByRole('button', { name: 'Add Server' }).first().click();

    // Switch to Audiobookshelf
    await page.getByRole('button', { name: 'Audiobookshelf', exact: true }).click();

    // API Key field should appear
    await expect(page.getByText('API Key')).toBeVisible();

    // Base URL field should appear for audiobookshelf
    await expect(page.getByText('Base URL')).toBeVisible();
  });

  test('should cancel adding a server', async ({ page }) => {
    await setupEmptyRoutes(page);
    await page.goto('/settings/media-server');

    await page.getByRole('button', { name: 'Add Server' }).first().click();

    // Form should be visible
    await expect(page.getByText('Hostname')).toBeVisible();

    // Cancel
    await page.getByRole('button', { name: 'Cancel' }).click();

    // Should be back to empty state
    await expect(page.getByText('No media servers configured')).toBeVisible();
  });
});
