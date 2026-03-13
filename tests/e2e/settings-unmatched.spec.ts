import { test, expect } from './fixtures';

test.describe('Unmatched Items Settings Page', () => {
  const mockUnmatched = {
    results: [
      {
        id: 1,
        title: 'Unknown Book',
        format: 'ebook',
        reason: 'unmatched',
        authors: 'John Doe',
        isbn: '978-1234567890',
        asin: null,
        libraryName: 'Main Library',
        firstSeenAt: '2026-03-01T10:00:00Z',
        lastAttemptedAt: '2026-03-06T10:00:00Z',
        sourceUrl: 'http://localhost:13378/books/123',
      },
      {
        id: 2,
        title: 'Duplicate Audio',
        format: 'audiobook',
        reason: 'duplicate',
        authors: 'Jane Smith',
        isbn: null,
        asin: 'B001234567',
        libraryName: 'Audiobooks',
        firstSeenAt: '2026-03-02T10:00:00Z',
        lastAttemptedAt: '2026-03-05T10:00:00Z',
        sourceUrl: null,
      },
    ],
    pageInfo: { pages: 1, results: 2 },
  };

  function setupRoutes(page: import('@playwright/test').Page) {
    return page.route('**/api/v1/settings/unmatched?*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockUnmatched),
      });
    });
  }

  test('should display unmatched items list with format badges', async ({ page }) => {
    await setupRoutes(page);
    await page.goto('/settings/unmatched');

    await expect(
      page.getByRole('heading', { name: 'Unmatched Items' })
    ).toBeVisible();

    // Item titles visible
    await expect(page.getByText('Unknown Book')).toBeVisible();
    await expect(page.getByText('Duplicate Audio')).toBeVisible();

    // Author names
    await expect(page.getByText('John Doe')).toBeVisible();
    await expect(page.getByText('Jane Smith')).toBeVisible();

    // Format badges
    await expect(page.getByText('ebook', { exact: true })).toBeVisible();
    await expect(page.getByText('audiobook', { exact: true })).toBeVisible();

    // ISBN and ASIN identifiers
    await expect(page.getByText('978-1234567890')).toBeVisible();
    await expect(page.getByText('B001234567')).toBeVisible();

    // Library names
    await expect(page.getByText('Main Library')).toBeVisible();
    await expect(page.getByText('Audiobooks', { exact: true })).toBeVisible();

    // Results count
    await expect(page.getByText('2 items')).toBeVisible();
  });

  test('should show empty state when no unmatched items', async ({ page }) => {
    await page.route('**/api/v1/settings/unmatched?*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          results: [],
          pageInfo: { pages: 0, results: 0 },
        }),
      });
    });

    await page.goto('/settings/unmatched');

    await expect(page.getByText('All items are matched!')).toBeVisible();
  });

  test('should dismiss an unmatched item', async ({ page }) => {
    await setupRoutes(page);

    let dismissedId: number | null = null;
    await page.route('**/api/v1/settings/unmatched/*', (route) => {
      if (route.request().method() === 'DELETE') {
        const url = route.request().url();
        const match = url.match(/\/settings\/unmatched\/(\d+)/);
        dismissedId = match ? Number(match[1]) : null;
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        });
      } else {
        route.continue();
      }
    });

    await page.goto('/settings/unmatched');

    // Wait for items to load
    await expect(page.getByText('Unknown Book')).toBeVisible();

    // Click the first dismiss button
    await page.getByRole('button', { name: 'Dismiss' }).first().click();

    // Verify the DELETE was made
    await expect(() => {
      expect(dismissedId).toBeTruthy();
    }).toPass({ timeout: 5000 });
  });
});
