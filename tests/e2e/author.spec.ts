import { test, expect } from './fixtures';

test.describe('Author Detail Page', () => {
  test.use({ storageState: 'tests/e2e/.auth/user.json' });

  const mockAuthor = {
    id: 1,
    name: 'J.R.R. Tolkien',
    hardcoverId: 'author-tolkien',
    bio: 'John Ronald Reuel Tolkien was an English writer, poet, philologist, and academic, best known as the author of the high fantasy works The Hobbit and The Lord of the Rings.',
    photoUrl: null,
    birthDate: '1892-01-03',
    deathDate: '1973-09-02',
    sourceUrl: 'https://hardcover.app/authors/jrr-tolkien',
  };

  const mockBooks = {
    results: [
      {
        goodreadsId: 'hc-hobbit',
        title: 'The Hobbit',
        coverUrl: null,
        publishedDate: '1937',
        authors: [{ name: 'J.R.R. Tolkien' }],
      },
      {
        goodreadsId: 'hc-lotr',
        title: 'The Lord of the Rings',
        coverUrl: null,
        publishedDate: '1954',
        authors: [{ name: 'J.R.R. Tolkien' }],
      },
    ],
  };

  function setupRoutes(page: import('@playwright/test').Page) {
    return Promise.all([
      page.route('**/api/v1/author/author-tolkien', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockAuthor),
        });
      }),
      page.route('**/api/v1/author/author-tolkien/books*', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockBooks),
        });
      }),
    ]);
  }

  test('should display author information', async ({ page }) => {
    await setupRoutes(page);
    await page.goto('/author/author-tolkien');

    // Name
    await expect(page.getByRole('heading', { name: 'J.R.R. Tolkien' })).toBeVisible();

    // Bio
    await expect(page.getByText(/English writer, poet, philologist/)).toBeVisible();

    // Birth and death dates
    await expect(page.getByText(/Born.*1892/)).toBeVisible();
    await expect(page.getByText(/Died.*1973/)).toBeVisible();
  });

  test('should display author books', async ({ page }) => {
    await setupRoutes(page);
    await page.goto('/author/author-tolkien');

    await expect(page.getByText('Books')).toBeVisible();
    await expect(page.getByRole('link', { name: 'The Hobbit' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'The Lord of the Rings' })).toBeVisible();
  });

  test('should show author not found', async ({ page }) => {
    await page.route('**/api/v1/author/nonexistent', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Not found' }),
      });
    });
    await page.route('**/api/v1/author/nonexistent/books*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ results: [] }),
      });
    });

    await page.goto('/author/nonexistent');
    await expect(page.getByText('Author not found.')).toBeVisible();
  });
});
