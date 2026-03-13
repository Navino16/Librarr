import { test, expect } from './fixtures';

test.describe('Artist Detail Page', () => {
  test.use({ storageState: 'tests/e2e/.auth/user.json' });

  const mockArtist = {
    name: 'The Beatles',
    photoUrl: null,
    type: 'Group',
    country: 'United Kingdom',
    beginDate: '1960',
    genres: ['Rock', 'Pop', 'Psychedelic Rock'],
    bio: 'The Beatles were an English rock band formed in Liverpool in 1960.',
  };

  const mockAlbums = {
    results: [
      {
        musicBrainzId: 'mb-abbey',
        title: 'Abbey Road',
        releaseDate: '1969-09-26',
        coverUrl: null,
        media: { status: 1 },
      },
      {
        musicBrainzId: 'mb-let-it-be',
        title: 'Let It Be',
        releaseDate: '1970-05-08',
        coverUrl: null,
        media: { status: 1 },
      },
    ],
  };

  function setupRoutes(page: import('@playwright/test').Page) {
    return Promise.all([
      page.route('**/api/v1/artist/artist-beatles', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockArtist),
        });
      }),
      page.route('**/api/v1/artist/artist-beatles/albums*', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockAlbums),
        });
      }),
    ]);
  }

  test('should display artist information', async ({ page }) => {
    await setupRoutes(page);
    await page.goto('/artist/artist-beatles');

    // Name
    await expect(page.getByRole('heading', { name: 'The Beatles' })).toBeVisible();

    // Type and country
    await expect(page.getByText('Group')).toBeVisible();
    await expect(page.getByText('United Kingdom')).toBeVisible();

    // Bio
    await expect(page.getByText(/English rock band formed in Liverpool/)).toBeVisible();

    // Active since year
    await expect(page.getByText(/Active since.*1960/)).toBeVisible();
  });

  test('should display genres', async ({ page }) => {
    await setupRoutes(page);
    await page.goto('/artist/artist-beatles');

    await expect(page.getByText('Rock', { exact: true })).toBeVisible();
    await expect(page.getByText('Pop', { exact: true })).toBeVisible();
    await expect(page.getByText('Psychedelic Rock')).toBeVisible();
  });

  test('should display discography with album links', async ({ page }) => {
    await setupRoutes(page);
    await page.goto('/artist/artist-beatles');

    await expect(page.getByText('Discography')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Abbey Road' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Let It Be' })).toBeVisible();
  });

  test('should show artist not found', async ({ page }) => {
    await page.route('**/api/v1/artist/nonexistent', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Not found' }),
      });
    });
    await page.route('**/api/v1/artist/nonexistent/albums*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ results: [] }),
      });
    });

    await page.goto('/artist/nonexistent');
    await expect(page.getByText('Artist not found.')).toBeVisible();
  });
});
