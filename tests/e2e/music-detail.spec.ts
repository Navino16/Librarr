import { test, expect } from './fixtures';

test.describe('Music Album Detail Page', () => {
  test.use({ storageState: 'tests/e2e/.auth/user.json' });

  const mockAlbum = {
    id: 50,
    musicBrainzId: 'mb-album-1',
    spotifyId: 'spotify-123',
    title: 'OK Computer',
    coverUrl: null,
    releaseDate: '1997-06-16',
    type: 'album',
    trackCount: 12,
    label: 'Parlophone',
    genres: ['Alternative Rock', 'Art Rock', 'Electronic'],
    artists: [
      { id: 1, name: 'Radiohead' },
    ],
    media: {
      id: 50,
      status: 1,
      requests: [],
    },
  };

  const mockTracks = {
    results: [
      { musicBrainzId: 'track-1', position: 1, title: 'Airbag', duration: 270000 },
      { musicBrainzId: 'track-2', position: 2, title: 'Paranoid Android', duration: 383000 },
      { musicBrainzId: 'track-3', position: 3, title: 'Subterranean Homesick Alien', duration: 266000 },
      { musicBrainzId: 'track-4', position: 4, title: 'Exit Music (For a Film)', duration: 262000 },
      { musicBrainzId: 'track-5', position: 5, title: 'Let Down', duration: 298000 },
    ],
  };

  function setupRoutes(page: import('@playwright/test').Page) {
    return Promise.all([
      page.route('**/api/v1/music/mb-album-1', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockAlbum),
        });
      }),
      page.route('**/api/v1/music/mb-album-1/tracks', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockTracks),
        });
      }),
    ]);
  }

  test('should display album metadata', async ({ page }) => {
    await setupRoutes(page);
    await page.goto('/music/mb-album-1');

    // Title
    await expect(page.getByRole('heading', { name: 'OK Computer' })).toBeVisible();

    // Artist
    await expect(page.getByText('Radiohead')).toBeVisible();

    // Release date
    await expect(page.getByText(/Released.*1997/)).toBeVisible();

    // Track count
    await expect(page.getByText('12 tracks')).toBeVisible();

    // Label
    await expect(page.getByText(/Label.*Parlophone/)).toBeVisible();
  });

  test('should display genres', async ({ page }) => {
    await setupRoutes(page);
    await page.goto('/music/mb-album-1');

    await expect(page.getByText('Alternative Rock')).toBeVisible();
    await expect(page.getByText('Art Rock')).toBeVisible();
    await expect(page.getByText('Electronic')).toBeVisible();
  });

  test('should display track list', async ({ page }) => {
    await setupRoutes(page);
    await page.goto('/music/mb-album-1');

    // Track list heading
    await expect(page.getByRole('heading', { name: 'Tracks' })).toBeVisible();

    // Track titles
    await expect(page.getByText('Airbag')).toBeVisible();
    await expect(page.getByText('Paranoid Android')).toBeVisible();
    await expect(page.getByText('Subterranean Homesick Alien')).toBeVisible();
    await expect(page.getByText('Exit Music (For a Film)')).toBeVisible();
    await expect(page.getByText('Let Down')).toBeVisible();

    // Track table header
    await expect(page.getByRole('columnheader', { name: '#' })).toBeVisible();
  });

  test('should show external links', async ({ page }) => {
    await setupRoutes(page);
    await page.goto('/music/mb-album-1');

    await expect(page.getByText('MusicBrainz')).toBeVisible();
    await expect(page.getByText('Spotify')).toBeVisible();
  });

  test('should show request button for album', async ({ page }) => {
    await setupRoutes(page);

    // Mock the music request API
    await page.route('**/api/v1/request', (route) => {
      if (route.request().method() === 'POST') {
        route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ id: 1, status: 1 }),
        });
      } else {
        route.continue();
      }
    });

    // Mock the request modal's server lookup
    await page.route('**/api/v1/settings/servers-for-request*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.goto('/music/mb-album-1');

    // Request button should be visible
    const requestBtn = page.getByRole('button', { name: /Request/i });
    await expect(requestBtn.first()).toBeVisible();
  });

  test('should show album not found', async ({ page }) => {
    await page.route('**/api/v1/music/nonexistent', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Not found' }),
      });
    });
    await page.route('**/api/v1/music/nonexistent/tracks', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ results: [] }),
      });
    });

    await page.goto('/music/nonexistent');
    await expect(page.getByText('Album not found.')).toBeVisible();
  });

  test('should show report issue button when album has local media', async ({ page }) => {
    await setupRoutes(page);
    await page.goto('/music/mb-album-1');

    // The mock album has media.id, so the button should be visible
    await expect(page.getByRole('button', { name: /Report an Issue/i })).toBeVisible();
  });

  test('should show open issues badge when issues exist for album', async ({ page }) => {
    await setupRoutes(page);
    await page.route('**/api/v1/issue/count/music/50', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ open: 3 }),
      });
    });

    await page.goto('/music/mb-album-1');

    await expect(page.getByText('3 open issues')).toBeVisible();
  });

  test('should open issue modal from music page and submit', async ({ page }) => {
    await setupRoutes(page);

    // Mock the issue creation API
    await page.route('**/api/v1/issue', (route) => {
      if (route.request().method() === 'POST') {
        route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ id: 1, issueType: 3, status: 1, message: 'Wrong tracklist' }),
        });
      } else {
        route.continue();
      }
    });

    await page.goto('/music/mb-album-1');

    // Click report issue button
    await page.getByRole('button', { name: /Report an Issue/i }).click();

    // Modal should open (use heading role to avoid matching the button text too)
    await expect(page.getByRole('heading', { name: 'Report an Issue' })).toBeVisible();

    // Select "Quality" type from dropdown and fill description
    await page.locator('#issue-type-select').selectOption({ label: 'Quality' });
    await page.locator('#issue-message').fill('Wrong tracklist');

    // Submit
    await page.getByRole('button', { name: 'Submit' }).click();

    // Modal should close
    await expect(page.getByRole('heading', { name: 'Report an Issue' })).not.toBeVisible();
  });

  test('should display download progress for approved request', async ({ page }) => {
    const albumWithDownload = {
      ...mockAlbum,
      media: {
        status: 2,
        requests: [
          {
            id: 1,
            status: 2, // APPROVED
            downloadProgress: 67,
            downloadStatus: 'downloading',
            downloadTimeLeft: '3m',
            requestedBy: { id: 3, username: 'testuser' },
          },
        ],
      },
    };

    await page.route('**/api/v1/music/mb-album-1', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(albumWithDownload),
      });
    });
    await page.route('**/api/v1/music/mb-album-1/tracks', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockTracks),
      });
    });

    await page.goto('/music/mb-album-1');

    // Download progress should be visible (rendered as "67.0%")
    await expect(page.getByText('67.0%')).toBeVisible();
  });
});
