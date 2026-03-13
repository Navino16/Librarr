import { test, expect } from './fixtures';

test.describe('Issues Page', () => {
  // Admin auth (has VIEW_ISSUES permission)

  const mockIssues = {
    pageInfo: { pages: 1, page: 1, results: 3 },
    results: [
      {
        id: 1,
        issueType: 1, // METADATA
        status: 1, // OPEN
        createdAt: new Date().toISOString(),
        createdBy: { id: 2, username: 'testuser' },
      },
      {
        id: 2,
        issueType: 3, // FORMAT
        status: 2, // RESOLVED
        createdAt: new Date().toISOString(),
        createdBy: { id: 1, username: 'admin' },
      },
      {
        id: 3,
        issueType: 5, // OTHER
        status: 1, // OPEN
        createdAt: new Date().toISOString(),
        createdBy: { id: 2, username: 'testuser' },
      },
    ],
  };

  function setupRoutes(page: import('@playwright/test').Page) {
    return page.route('**/api/v1/issue?*', (route) => {
      const url = new URL(route.request().url());
      const filter = url.searchParams.get('filter');

      if (filter === 'open') {
        const filtered = mockIssues.results.filter((i) => i.status === 1);
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            pageInfo: { pages: 1, page: 1, results: filtered.length },
            results: filtered,
          }),
        });
      } else if (filter === 'resolved') {
        const filtered = mockIssues.results.filter((i) => i.status === 2);
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            pageInfo: { pages: 1, page: 1, results: filtered.length },
            results: filtered,
          }),
        });
      } else {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockIssues),
        });
      }
    });
  }

  test('should display issues list with status badges', async ({ page }) => {
    await setupRoutes(page);
    await page.goto('/issues');

    await expect(page.getByRole('heading', { name: 'Issues' })).toBeVisible();

    // Filter tabs
    await expect(page.getByRole('button', { name: 'All' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Resolved' })).toBeVisible();

    // Issues should be visible with type labels
    await expect(page.getByText(/Issue #1.*Metadata/)).toBeVisible();
    await expect(page.getByText(/Issue #2.*Format/)).toBeVisible();
    await expect(page.getByText(/Issue #3.*Other/)).toBeVisible();
  });

  test('should filter by open status', async ({ page }) => {
    await setupRoutes(page);
    await page.goto('/issues');

    // Wait for initial load
    await expect(page.getByText(/Issue #1/)).toBeVisible();

    // Click Open and wait for filtered response in parallel
    await Promise.all([
      page.waitForResponse((resp) =>
        resp.url().includes('/api/v1/issue') && resp.url().includes('filter=open')
      ),
      page.getByRole('button', { name: 'Open', exact: true }).click(),
    ]);

    // Only open issues visible
    await expect(page.getByText(/Issue #1/)).toBeVisible();
    await expect(page.getByText(/Issue #3/)).toBeVisible();
    await expect(page.getByText(/Issue #2/)).not.toBeVisible();
  });

  test('should filter by resolved status', async ({ page }) => {
    await setupRoutes(page);
    await page.goto('/issues');

    await page.getByRole('button', { name: 'Resolved' }).click();

    // Only resolved issue visible
    await expect(page.getByText(/Issue #2/)).toBeVisible();
    await expect(page.getByText(/Issue #1/)).not.toBeVisible();
  });

  test('should show empty state when no issues', async ({ page }) => {
    await page.route('**/api/v1/issue?*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ pageInfo: { pages: 0, page: 1, results: 0 }, results: [] }),
      });
    });

    await page.goto('/issues');
    await expect(page.getByText('No issues found.')).toBeVisible();
  });

  test('should show usernames on issues', async ({ page }) => {
    await setupRoutes(page);
    await page.goto('/issues');

    await expect(page.getByText(/testuser/).first()).toBeVisible();
    await expect(page.getByText(/admin/).first()).toBeVisible();
  });
});
