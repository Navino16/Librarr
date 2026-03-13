import { test, expect } from './fixtures';

test.describe('Book Detail Page', () => {
  test.use({ storageState: 'tests/e2e/.auth/user.json' });

  const mockBook = {
    id: 100,
    hardcoverId: 'hc-100',
    title: 'The Midnight Library',
    originalTitle: 'The Midnight Library',
    description: 'Between life and death there is a library, and within that library, the shelves go on forever. Every book provides a chance to try another life you could have lived.',
    coverUrl: null,
    publishedDate: '2020-08-13',
    pageCount: 288,
    averageRating: 4.2,
    ratingsCount: 150000,
    genresJson: JSON.stringify(['Fiction', 'Fantasy', 'Contemporary']),
    status: 1, // UNKNOWN
    ebookAvailable: false,
    audiobookAvailable: false,
    hasEbookEdition: true,
    hasAudiobookEdition: true,
    sourceUrl: 'https://hardcover.app/books/the-midnight-library',
    authors: [
      {
        id: 1,
        author: { id: 1, name: 'Matt Haig', hardcoverId: 'author-haig' },
        role: 'author',
      },
    ],
    editions: [
      { id: 1, format: 'ebook', isbn13: '9780525559474', source: 'hardcover' },
      { id: 2, format: 'audiobook', asin: 'B08K3RB7J4', source: 'hardcover' },
    ],
    requests: [],
    availability: [],
    series: null,
    seriesPosition: null,
  };

  function setupBookRoutes(page: import('@playwright/test').Page) {
    return Promise.all([
      page.route('**/api/v1/book/100', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockBook),
        });
      }),
      page.route('**/api/v1/book/100/series', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ results: [], seriesName: '' }),
        });
      }),
      page.route('**/api/v1/book/100/similar', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ results: [] }),
        });
      }),
    ]);
  }

  test('should display book metadata', async ({ page }) => {
    await setupBookRoutes(page);
    await page.goto('/book/100');

    // Title
    await expect(page.getByRole('heading', { name: 'The Midnight Library' })).toBeVisible();

    // Author
    await expect(page.getByText('Matt Haig')).toBeVisible();

    // Published date
    await expect(page.getByText(/Published.*2020/)).toBeVisible();

    // Page count
    await expect(page.getByText('288 pages')).toBeVisible();

    // Rating
    await expect(page.getByText('4.2/5')).toBeVisible();

    // Description
    await expect(page.getByText(/Between life and death there is a library/)).toBeVisible();
  });

  test('should display genres', async ({ page }) => {
    await setupBookRoutes(page);
    await page.goto('/book/100');

    await expect(page.getByText('Fiction')).toBeVisible();
    await expect(page.getByText('Fantasy')).toBeVisible();
    await expect(page.getByText('Contemporary')).toBeVisible();
  });

  test('should display format status cards', async ({ page }) => {
    await setupBookRoutes(page);
    await page.goto('/book/100');

    // Format Status heading
    await expect(page.getByText('Format Status')).toBeVisible();

    // Ebook and Audiobook cards with "Not Requested" status
    await expect(page.getByText('Ebook').first()).toBeVisible();
    await expect(page.getByText('Audiobook').first()).toBeVisible();
    await expect(page.getByText('Not Requested').first()).toBeVisible();
  });

  test('should show request buttons on format cards', async ({ page }) => {
    await setupBookRoutes(page);
    await page.goto('/book/100');

    // Both format cards should have Request buttons
    const requestButtons = page.getByRole('button', { name: 'Request' });
    await expect(requestButtons).toHaveCount(2);
  });

  test('should open request modal when clicking Request on format card', async ({ page }) => {
    await setupBookRoutes(page);

    // Mock the request creation
    await page.route('**/api/v1/request', (route) => {
      if (route.request().method() === 'POST') {
        route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ id: 1, format: 'ebook', status: 1, workId: 100 }),
        });
      } else {
        route.continue();
      }
    });

    await page.goto('/book/100');

    // Click first Request button (ebook)
    await page.getByRole('button', { name: 'Request' }).first().click();

    // Request modal should open
    await expect(page.getByText('Request Book')).toBeVisible();
  });

  test('should display book with available ebook format', async ({ page }) => {
    const availableBook = {
      ...mockBook,
      status: 5, // AVAILABLE
      ebookAvailable: true,
      audiobookAvailable: false,
      availability: [
        { format: 'ebook', source: 'audiobookshelf', sourceUrl: 'https://abs.local/item/123', addedAt: '2024-01-15T00:00:00.000Z' },
      ],
    };

    await page.route('**/api/v1/book/100', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(availableBook),
      });
    });
    await page.route('**/api/v1/book/100/series', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [], seriesName: '' }) });
    });
    await page.route('**/api/v1/book/100/similar', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [] }) });
    });

    await page.goto('/book/100');

    // Ebook should show "Available"
    await expect(page.getByText('Available').first()).toBeVisible();

    // Audiobook should still show "Not Requested"
    await expect(page.getByText('Not Requested')).toBeVisible();
  });

  test('should display book with active request', async ({ page }) => {
    const requestedBook = {
      ...mockBook,
      status: 2, // PENDING
      requests: [
        {
          id: 1,
          format: 'ebook',
          status: 1, // PENDING
          requestedBy: { id: 3, username: 'testuser' },
          createdAt: '2024-01-10T00:00:00.000Z',
          downloadProgress: null,
          downloadStatus: null,
          downloadTimeLeft: null,
        },
      ],
    };

    await page.route('**/api/v1/book/100', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(requestedBook),
      });
    });
    await page.route('**/api/v1/book/100/series', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [], seriesName: '' }) });
    });
    await page.route('**/api/v1/book/100/similar', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [] }) });
    });

    await page.goto('/book/100');

    // Ebook should show "Requested" status
    await expect(page.getByText('Requested').first()).toBeVisible();
  });

  test('should show series section when book has series', async ({ page }) => {
    await page.route('**/api/v1/book/100', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...mockBook,
          series: { name: 'The Midnight Saga' },
          seriesPosition: 1,
        }),
      });
    });
    await page.route('**/api/v1/book/100/series', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          seriesName: 'The Midnight Saga',
          results: [
            {
              goodreadsId: 'hc-100',
              title: 'The Midnight Library',
              coverUrl: null,
              authors: [{ name: 'Matt Haig' }],
              series: { position: 1 },
            },
            {
              goodreadsId: 'hc-101',
              title: 'The Second Midnight',
              coverUrl: null,
              authors: [{ name: 'Matt Haig' }],
              series: { position: 2 },
            },
          ],
        }),
      });
    });
    await page.route('**/api/v1/book/100/similar', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [] }) });
    });

    await page.goto('/book/100');

    // Series badge should show
    await expect(page.getByText(/The Midnight Saga #1/)).toBeVisible();

    // Series section
    await expect(page.getByText('Books in this Series')).toBeVisible();
    await expect(page.getByText('The Second Midnight')).toBeVisible();
  });

  test('should show book not found for invalid ID', async ({ page }) => {
    // Return 200 with an empty response that resolves to no work/metadata
    await page.route('**/api/v1/book/999', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      });
    });
    await page.route('**/api/v1/book/999/series', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [], seriesName: '' }) });
    });
    await page.route('**/api/v1/book/999/similar', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [] }) });
    });

    await page.goto('/book/999');
    await expect(page.getByText('Book not found.')).toBeVisible();
  });

  test('should show report issue button when work exists', async ({ page }) => {
    await setupBookRoutes(page);
    await page.goto('/book/100');

    await expect(page.getByRole('button', { name: /Report an Issue/i })).toBeVisible();
  });

  test('should show open issues badge when issues exist', async ({ page }) => {
    await setupBookRoutes(page);
    await page.route('**/api/v1/issue/count/work/100', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ open: 2 }),
      });
    });

    await page.goto('/book/100');

    await expect(page.getByText('2 open issues')).toBeVisible();
  });

  test('should open issue modal and submit issue', async ({ page }) => {
    await setupBookRoutes(page);

    // Mock the issue creation API
    await page.route('**/api/v1/issue', (route) => {
      if (route.request().method() === 'POST') {
        route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ id: 1, issueType: 3, status: 1, workId: 100, message: 'Audio is out of sync' }),
        });
      } else {
        route.continue();
      }
    });

    await page.goto('/book/100');

    // Click report issue button
    await page.getByRole('button', { name: /Report an Issue/i }).click();

    // Modal should open (use heading role to avoid matching the button text too)
    await expect(page.getByRole('heading', { name: 'Report an Issue' })).toBeVisible();

    // Issue type should be a select dropdown
    const typeSelect = page.locator('#issue-type-select');
    await expect(typeSelect).toBeVisible();

    // Select "Quality" type from dropdown
    await typeSelect.selectOption({ label: 'Quality' });

    // Fill in description
    const messageField = page.locator('#issue-message');
    await expect(messageField).toBeVisible();
    await messageField.fill('Audio is out of sync');

    // Submit
    await page.getByRole('button', { name: 'Submit' }).click();

    // Modal should close after submit
    await expect(page.getByRole('heading', { name: 'Report an Issue' })).not.toBeVisible();
  });

  test('should show long description with expand/collapse', async ({ page }) => {
    const longDesc = 'A'.repeat(600);
    await page.route('**/api/v1/book/100', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...mockBook, description: longDesc }),
      });
    });
    await page.route('**/api/v1/book/100/series', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [], seriesName: '' }) });
    });
    await page.route('**/api/v1/book/100/similar', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [] }) });
    });

    await page.goto('/book/100');

    // "Show more" button should be visible for long description
    await expect(page.getByText('Show more')).toBeVisible();

    // Click to expand
    await page.getByText('Show more').click();
    await expect(page.getByText('Show less')).toBeVisible();
  });
});
