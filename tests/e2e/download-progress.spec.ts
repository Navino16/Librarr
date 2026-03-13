import { test, expect } from './fixtures';

test.describe('Download Progress States', () => {
  test.use({ storageState: 'tests/e2e/.auth/user.json' });

  // RequestStatus: PENDING=1, APPROVED=2, DECLINED=3, COMPLETED=4, FAILED=5
  const baseMockBook = {
    id: 99,
    hardcoverId: 'hc-dl-test',
    title: 'Download Progress Test Book',
    description: 'Testing download states.',
    coverUrl: null,
    authors: [{ id: 1, author: { id: 1, name: 'Test Author', hardcoverId: 'a1' }, role: 'author' }],
    editions: [
      { id: 1, format: 'ebook', isbn13: '9780000000099', source: 'hardcover' },
    ],
    availability: [],
    series: [],
    genresJson: null,
  };

  function setupBookRoute(page: import('@playwright/test').Page, overrides: Record<string, unknown>) {
    return Promise.all([
      page.route('**/api/v1/book/99', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ...baseMockBook, ...overrides }),
        });
      }),
      page.route('**/api/v1/book/99/series', (route) => {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [], seriesName: '' }) });
      }),
      page.route('**/api/v1/book/99/similar', (route) => {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [] }) });
      }),
    ]);
  }

  test('should show downloading progress bar', async ({ page }) => {
    await setupBookRoute(page, {
      status: 3, // PROCESSING
      requests: [{ id: 1, format: 'ebook', status: 2, downloadStatus: 'downloading', downloadProgress: 45.5, downloadTimeLeft: '2m 30s' }],
    });

    await page.goto('/book/99');
    await expect(page.getByText('Download Progress Test Book')).toBeVisible();

    const progressbar = page.getByRole('progressbar');
    await expect(progressbar).toBeVisible();
    await expect(page.getByText('45.5%')).toBeVisible();
  });

  test('should show queued status badge', async ({ page }) => {
    await setupBookRoute(page, {
      status: 3,
      requests: [{ id: 1, format: 'ebook', status: 2, downloadStatus: 'queued' }],
    });

    await page.goto('/book/99');
    await expect(page.getByText('Download Progress Test Book')).toBeVisible();
    await expect(page.getByText('Queued')).toBeVisible();
  });

  test('should show failed download status badge', async ({ page }) => {
    await setupBookRoute(page, {
      status: 3,
      requests: [{ id: 1, format: 'ebook', status: 2, downloadStatus: 'failed' }],
    });

    await page.goto('/book/99');
    await expect(page.getByText('Download Progress Test Book')).toBeVisible();
    await expect(page.getByText('Failed')).toBeVisible();
  });

  test('should show warning status badge', async ({ page }) => {
    await setupBookRoute(page, {
      status: 3,
      requests: [{ id: 1, format: 'ebook', status: 2, downloadStatus: 'warning' }],
    });

    await page.goto('/book/99');
    await expect(page.getByText('Download Progress Test Book')).toBeVisible();
    await expect(page.getByText('Warning')).toBeVisible();
  });

  test('should show paused status badge', async ({ page }) => {
    await setupBookRoute(page, {
      status: 3,
      requests: [{ id: 1, format: 'ebook', status: 2, downloadStatus: 'paused' }],
    });

    await page.goto('/book/99');
    await expect(page.getByText('Download Progress Test Book')).toBeVisible();
    await expect(page.getByText('Paused')).toBeVisible();
  });
});
