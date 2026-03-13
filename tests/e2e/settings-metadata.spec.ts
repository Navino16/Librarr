import { test, expect } from './fixtures';

test.describe('Metadata Settings Page', () => {
  const mockProviderSettings = {
    hardcover: { enabled: true },
    openlibrary: { enabled: true },
    googlebooks: { enabled: false },
    priority: {
      search: ['hardcover', 'openlibrary'],
      description: ['hardcover', 'openlibrary'],
      cover: ['hardcover', 'openlibrary'],
      editions: ['hardcover', 'openlibrary'],
      ratings: ['hardcover'],
    },
  };

  const mockCacheStats = [
    {
      name: 'book_metadata',
      keys: 1250,
      hits: 3420,
      misses: 1580,
      ttl: 86400,
      maxKeys: 5000,
    },
    {
      name: 'author_info',
      keys: 320,
      hits: 891,
      misses: 245,
      ttl: 604800,
      maxKeys: 1000,
    },
  ];

  function setupRoutes(page: import('@playwright/test').Page) {
    return Promise.all([
      page.route('**/api/v1/settings/metadata-providers', (route) => {
        if (route.request().method() === 'GET') {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(mockProviderSettings),
          });
        } else {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(mockProviderSettings),
          });
        }
      }),
      page.route('**/api/v1/cache', (route) => {
        // Only match the exact /cache endpoint, not /cache/*/flush
        if (route.request().url().endsWith('/cache') || route.request().url().endsWith('/cache?')) {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(mockCacheStats),
          });
        } else {
          route.continue();
        }
      }),
    ]);
  }

  test('should display metadata providers with toggle switches', async ({ page }) => {
    await setupRoutes(page);
    await page.goto('/settings/metadata');

    await expect(
      page.getByRole('heading', { name: 'Metadata Providers' }).first()
    ).toBeVisible();

    // Provider names visible
    await expect(page.getByText('Hardcover').first()).toBeVisible();
    await expect(page.getByText('OpenLibrary').first()).toBeVisible();
    await expect(page.getByText('Google Books').first()).toBeVisible();

    // Toggle switches exist for each provider
    const switches = page.getByRole('switch');
    await expect(switches).toHaveCount(3);

    // Hardcover and OpenLibrary should be enabled (aria-checked=true)
    const hardcoverSwitch = switches.nth(0);
    const openLibrarySwitch = switches.nth(1);
    const googleBooksSwitch = switches.nth(2);

    await expect(hardcoverSwitch).toHaveAttribute('aria-checked', 'true');
    await expect(openLibrarySwitch).toHaveAttribute('aria-checked', 'true');
    await expect(googleBooksSwitch).toHaveAttribute('aria-checked', 'false');
  });

  test('should display provider priority lists', async ({ page }) => {
    await setupRoutes(page);
    await page.goto('/settings/metadata');

    // Priority section heading
    await expect(
      page.getByRole('heading', { name: 'Priority Configuration' })
    ).toBeVisible();

    // Priority fields visible
    const main = page.getByRole('main');
    await expect(main.getByText('Search', { exact: true })).toBeVisible();
    await expect(main.getByText('Description', { exact: true })).toBeVisible();
    await expect(main.getByText('Cover', { exact: true })).toBeVisible();
    await expect(main.getByText('Editions', { exact: true })).toBeVisible();
    await expect(main.getByText('Ratings', { exact: true })).toBeVisible();

    // Save and Reset buttons
    await expect(page.getByRole('button', { name: 'Save Changes' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reset to Defaults' })).toBeVisible();
  });

  test('should display cache statistics table', async ({ page }) => {
    await setupRoutes(page);
    await page.goto('/settings/metadata');

    // Cache section heading
    await expect(
      page.getByRole('heading', { name: 'Cache Management' })
    ).toBeVisible();

    // Cache names visible
    await expect(page.getByText('book_metadata')).toBeVisible();
    await expect(page.getByText('author_info')).toBeVisible();

    // Table headers
    await expect(page.getByText('Name', { exact: true })).toBeVisible();
    await expect(page.getByText('Items', { exact: true })).toBeVisible();
    await expect(page.getByText('Hit Rate', { exact: true })).toBeVisible();
    await expect(page.getByText('TTL')).toBeVisible();

    // Flush All button
    await expect(page.getByRole('button', { name: 'Flush All Caches' })).toBeVisible();
  });

  test('should flush a single cache', async ({ page }) => {
    await setupRoutes(page);

    let flushedCacheName: string | null = null;
    await page.route('**/api/v1/cache/*/flush', (route) => {
      if (route.request().method() === 'POST') {
        const url = route.request().url();
        const match = url.match(/\/cache\/([^/]+)\/flush/);
        flushedCacheName = match ? decodeURIComponent(match[1]) : null;
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        });
      } else {
        route.continue();
      }
    });

    await page.goto('/settings/metadata');

    // Wait for cache table to load
    await expect(page.getByText('book_metadata')).toBeVisible();

    // Click the first flush button (for book_metadata)
    await page.getByRole('button', { name: 'Flush cache' }).first().click();

    // Verify the POST was made
    await expect(() => {
      expect(flushedCacheName).toBeTruthy();
    }).toPass({ timeout: 5000 });
  });
});
