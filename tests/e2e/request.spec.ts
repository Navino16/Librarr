import { test, expect } from './fixtures';

test.describe('Book Request Flow', () => {
  test.use({ storageState: 'tests/e2e/.auth/user.json' });

  // Use a numeric ID so the page hits /api/v1/book/:id (not /lookup/)
  const mockBookDetail = {
    id: 42,
    hardcoverId: 'hc-req-test',
    title: 'Test Book for Request',
    description: 'A test book description.',
    coverUrl: null,
    authors: [{ id: 1, author: { id: 1, name: 'Test Author', hardcoverId: 'author-1' }, role: 'author' }],
    status: 1,
    ebookAvailable: false,
    audiobookAvailable: false,
    editions: [
      { id: 1, format: 'ebook', isbn13: '9781234567890', source: 'hardcover' },
      { id: 2, format: 'audiobook', asin: 'B001234567', source: 'hardcover' },
    ],
    requests: [],
    availability: [],
    series: [],
    genresJson: null,
  };

  test('should request an ebook from book detail page', async ({ page }) => {
    // Mock the book detail API (numeric ID → /api/v1/book/42)
    await page.route('**/api/v1/book/42', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockBookDetail),
      });
    });

    // Mock series and similar endpoints to avoid real backend calls
    await page.route('**/api/v1/book/42/series', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ results: [], seriesName: '' }),
      });
    });

    await page.route('**/api/v1/book/42/similar', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ results: [] }),
      });
    });

    // Mock the request creation API
    let requestPayload: Record<string, unknown> | null = null;
    await page.route('**/api/v1/request', (route) => {
      if (route.request().method() === 'POST') {
        requestPayload = route.request().postDataJSON();
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 1,
            format: 'ebook',
            status: 2, // PENDING
            workId: 42,
          }),
        });
      } else {
        route.continue();
      }
    });

    await page.goto('/book/42');

    // Should show the book title
    await expect(page.getByText('Test Book for Request')).toBeVisible();

    // Should show "Not Requested" status for ebook
    await expect(page.getByText('Not Requested').first()).toBeVisible();

    // Click the Request button on the ebook format card
    const requestButtons = page.getByRole('button', { name: 'Request' });
    await requestButtons.first().click();

    // Request modal should open
    await expect(page.getByText('Request Book')).toBeVisible();

    // Ebook format should be available to select
    await page.getByRole('button', { name: 'Ebook' }).click();

    // Submit the request (target the button inside the modal dialog)
    await page.getByLabel('Request Book').getByRole('button', { name: 'Request' }).click();

    // Verify the request was made with correct format
    expect(requestPayload).toBeTruthy();
    expect(requestPayload!.format).toBe('ebook');
  });
});
