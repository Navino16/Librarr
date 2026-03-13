import { test, expect } from './fixtures';

test.describe('Home / Discover Page', () => {
  test('should show welcome message with admin username', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(/Welcome back, admin/)).toBeVisible();
  });

  test('should show discover description', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Discover and request books for your library.')).toBeVisible();
  });

  test('should show empty state when no media configured', async ({ page }) => {
    // Mock the discover endpoints to return empty
    await page.route('**/api/v1/discover/recent', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ results: [] }),
      });
    });
    await page.route('**/api/v1/discover/books*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ results: [] }),
      });
    });
    await page.route('**/api/v1/discover/music*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ results: [] }),
      });
    });

    await page.goto('/');

    // Empty state message
    await expect(page.getByText(/No media available yet/)).toBeVisible();
  });

  test('should show trending books slider when available', async ({ page }) => {
    // Mock public settings to enable books (requires hardcoverToken in real setup)
    await page.route('**/api/v1/settings/public', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          appTitle: 'Librarr',
          initialized: true,
          localLogin: true,
          bookEnabled: true,
          hideAvailable: false,
          enableEbookRequests: true,
          enableAudiobookRequests: true,
          enableMusicRequests: true,
        }),
      });
    });
    await page.route('**/api/v1/discover/recent', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ results: [] }),
      });
    });
    await page.route('**/api/v1/discover/books*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          results: [
            {
              goodreadsId: 'hc-1',
              title: 'Trending Book One',
              coverUrl: null,
              authors: [{ name: 'Author One' }],
            },
            {
              goodreadsId: 'hc-2',
              title: 'Trending Book Two',
              coverUrl: null,
              authors: [{ name: 'Author Two' }],
            },
          ],
        }),
      });
    });
    await page.route('**/api/v1/discover/music*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ results: [] }),
      });
    });

    await page.goto('/');

    // Trending books section
    await expect(page.getByText('Trending Books')).toBeVisible();
    await expect(page.getByText('Trending Book One')).toBeVisible();
    await expect(page.getByText('Trending Book Two')).toBeVisible();
  });

  test('should show recent requests slider', async ({ page }) => {
    await page.route('**/api/v1/discover/recent', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          results: [
            {
              request: { id: 1, format: 'ebook', status: 1 },
              requests: [{ format: 'ebook', status: 1 }],
              work: { id: 10, title: 'Recently Requested Book', coverUrl: null, status: 2, ebookAvailable: false, audiobookAvailable: false },
            },
          ],
        }),
      });
    });
    await page.route('**/api/v1/discover/books*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ results: [] }),
      });
    });
    await page.route('**/api/v1/discover/music*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ results: [] }),
      });
    });

    await page.goto('/');

    await expect(page.getByText('Recent Requests')).toBeVisible();
    await expect(page.getByText('Recently Requested Book')).toBeVisible();
  });
});

test.describe('Home Page - Regular User', () => {
  test.use({ storageState: 'tests/e2e/.auth/user.json' });

  test('should show welcome with user username', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(/Welcome back, testuser/)).toBeVisible();
  });
});
