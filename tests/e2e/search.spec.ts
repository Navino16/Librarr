import { test, expect } from './fixtures';

test.describe('Search', () => {
  test.use({ storageState: 'tests/e2e/.auth/user.json' });

  const mockSearchResults = {
    results: [
      {
        type: 'book',
        book: {
          hardcoverId: 'hc-123',
          title: 'The Great Gatsby',
          coverUrl: null,
          authors: [{ name: 'F. Scott Fitzgerald' }],
          work: null,
        },
      },
      {
        type: 'book',
        book: {
          hardcoverId: 'hc-456',
          title: 'To Kill a Mockingbird',
          coverUrl: null,
          authors: [{ name: 'Harper Lee' }],
          work: null,
        },
      },
    ],
    totalResults: 2,
  };

  const mockBookDetail = {
    id: 1,
    hardcoverId: 'hc-123',
    title: 'The Great Gatsby',
    description: 'A novel about the American Dream.',
    coverUrl: null,
    authors: [{ id: 1, author: { id: 1, name: 'F. Scott Fitzgerald', hardcoverId: 'author-1' }, role: 'author' }],
    status: 1,
    ebookAvailable: false,
    audiobookAvailable: false,
    editions: [],
    requests: [],
    series: [],
  };

  test('should search and display results', async ({ page }) => {
    // Mock the search API
    await page.route('**/api/v1/search*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockSearchResults),
      });
    });

    await page.goto('/');

    // Type in the search bar and submit
    const searchInput = page.getByRole('textbox', { name: /Search books/i });
    await searchInput.fill('gatsby');
    await searchInput.press('Enter');

    // Should show results
    await expect(page.getByText('The Great Gatsby')).toBeVisible();
    await expect(page.getByText('To Kill a Mockingbird')).toBeVisible();
    await expect(page.getByText('2 results found')).toBeVisible();
  });

  test('should navigate to book detail from search results', async ({ page }) => {
    await page.route('**/api/v1/search*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockSearchResults),
      });
    });

    // hc-123 is non-numeric → page fetches /api/v1/book/lookup/hc-123
    await page.route('**/api/v1/book/lookup/hc-123', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockBookDetail),
      });
    });

    // Mock series and similar to avoid real backend calls
    await page.route('**/api/v1/book/hc-123/series', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ results: [], seriesName: '' }),
      });
    });
    await page.route('**/api/v1/book/hc-123/similar', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ results: [] }),
      });
    });

    await page.goto('/search?query=gatsby');
    await page.getByText('The Great Gatsby').click();

    // Should navigate to book detail page
    await expect(page).toHaveURL(/\/book\/hc-123/);
    await expect(page.getByText('The Great Gatsby')).toBeVisible();
    await expect(page.getByText('F. Scott Fitzgerald')).toBeVisible();
    await expect(page.getByText('A novel about the American Dream.')).toBeVisible();
  });

  test('should show no results message', async ({ page }) => {
    await page.route('**/api/v1/search*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ results: [], totalResults: 0 }),
      });
    });

    await page.goto('/');
    const searchInput = page.getByRole('textbox', { name: /Search books/i });
    await searchInput.fill('zzzznonexistent');
    await searchInput.press('Enter');

    await expect(page.getByText(/No results found/)).toBeVisible();
  });
});
