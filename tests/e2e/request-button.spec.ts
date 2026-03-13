import { test, expect } from './fixtures';

test.describe('Request Button States', () => {
  test.use({ storageState: 'tests/e2e/.auth/user.json' });

  // Book detail: RequestStatus PENDING=1, APPROVED=2
  // Book uses FormatStatusCard, not RequestButton directly
  const baseBook = {
    id: 80,
    hardcoverId: 'hc-btn-test',
    title: 'Request Button Test',
    description: 'Testing request button states.',
    coverUrl: null,
    authors: [{ id: 1, author: { id: 1, name: 'Author X', hardcoverId: 'ax' }, role: 'author' }],
    editions: [
      { id: 1, format: 'ebook', isbn13: '9780000000001', source: 'hardcover' },
      { id: 2, format: 'audiobook', asin: 'B000000001', source: 'hardcover' },
    ],
    availability: [],
    series: [],
    genresJson: null,
  };

  function setupBookRoutes(page: import('@playwright/test').Page, bookOverrides: Record<string, unknown>) {
    return Promise.all([
      page.route('**/api/v1/book/80', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ...baseBook, ...bookOverrides }),
        });
      }),
      page.route('**/api/v1/book/80/series', (route) => {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [], seriesName: '' }) });
      }),
      page.route('**/api/v1/book/80/similar', (route) => {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [] }) });
      }),
    ]);
  }

  test('should show Request button on book format cards when no existing request', async ({ page }) => {
    await setupBookRoutes(page, { status: 1, requests: [] });
    await page.goto('/book/80');
    await expect(page.getByText('Request Button Test')).toBeVisible();
    // Format cards show "Request" buttons
    await expect(page.getByRole('button', { name: 'Request' }).first()).toBeVisible();
  });

  test('should show Requested status on book format card when request exists', async ({ page }) => {
    await setupBookRoutes(page, {
      status: 2,
      requests: [
        { id: 1, format: 'ebook', status: 1 }, // PENDING
      ],
    });
    await page.goto('/book/80');
    await expect(page.getByText('Request Button Test')).toBeVisible();
    // The ebook format card should show "Requested" status
    await expect(page.getByText('Requested').first()).toBeVisible();
  });

  test('should show Available status on book format card', async ({ page }) => {
    await setupBookRoutes(page, {
      status: 5,
      ebookAvailable: true,
      audiobookAvailable: false,
      requests: [],
      availability: [
        { id: 1, format: 'ebook', source: 'audiobookshelf', addedAt: '2026-01-01T00:00:00Z', sourceUrl: 'http://abs.local/item/1' },
      ],
    });
    await page.goto('/book/80');
    await expect(page.getByText('Request Button Test')).toBeVisible();
    // The ebook format card should show "Available"
    await expect(page.getByText('Available').first()).toBeVisible();
  });

  test('should open request modal from book format card', async ({ page }) => {
    await setupBookRoutes(page, { status: 1, requests: [] });

    await page.route('**/api/v1/request', (route) => {
      if (route.request().method() === 'POST') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: 1, format: 'ebook', status: 1, workId: 80 }),
        });
      } else {
        route.continue();
      }
    });

    await page.goto('/book/80');
    await expect(page.getByText('Request Button Test')).toBeVisible();

    // Click Request on the first format card
    await page.getByRole('button', { name: 'Request' }).first().click();

    // Modal should show format selection
    const modal = page.getByLabel('Request Book');
    await expect(modal).toBeVisible();
    await expect(modal.getByRole('button', { name: 'Ebook' })).toBeVisible();
    await expect(modal.getByRole('button', { name: 'Audiobook' })).toBeVisible();
  });

  // RequestButton component is used on music page
  test('should show Request Album button on music page', async ({ page }) => {
    const mockAlbum = {
      id: 50,
      musicBrainzId: 'mb-test-123',
      spotifyId: 'sp-123',
      title: 'Test Album',
      artists: [{ id: 'artist-1', name: 'Test Artist' }],
      coverUrl: null,
      albumType: 'album',
      releaseDate: '2025-01-01',
      genres: ['Pop'],
      media: {
        id: 50,
        status: 1,
        available: false,
        requests: [],
      },
    };

    await Promise.all([
      page.route('**/api/v1/music/50', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockAlbum),
        });
      }),
      page.route('**/api/v1/music/50/tracks', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ results: [{ id: 1, title: 'Track 1', trackNumber: 1, durationMs: 180000 }] }),
        });
      }),
    ]);

    await page.goto('/music/50');
    await expect(page.getByText('Test Album')).toBeVisible();
    await expect(page.getByRole('button', { name: /Request Album/i })).toBeVisible();
  });

  test('should show Requested button on music page when already requested', async ({ page }) => {
    // First, get the current user id from /auth/me
    const meResponse = await page.request.get('/api/v1/auth/me');
    const currentUser = await meResponse.json();
    const userId = currentUser.id;

    const mockAlbum = {
      id: 51,
      musicBrainzId: 'mb-test-456',
      spotifyId: 'sp-456',
      title: 'Already Requested Album',
      artists: [{ id: 'artist-2', name: 'Another Artist' }],
      coverUrl: null,
      albumType: 'album',
      releaseDate: '2025-02-01',
      genres: ['Rock'],
      media: {
        id: 51,
        status: 2,
        available: false,
        requests: [
          { id: 1, status: 1, requestedBy: { id: userId, username: 'testuser' } },
        ],
      },
    };

    await Promise.all([
      page.route('**/api/v1/music/51', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockAlbum),
        });
      }),
      page.route('**/api/v1/music/51/tracks', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ results: [] }),
        });
      }),
    ]);

    await page.goto('/music/51');
    await expect(page.getByText('Already Requested Album')).toBeVisible();

    // Should show "Requested" button (disabled)
    const requestedBtn = page.getByRole('button', { name: 'Requested' });
    await expect(requestedBtn).toBeVisible();
    await expect(requestedBtn).toBeDisabled();
  });

  test('should send music request on button click', async ({ page }) => {
    const mockAlbum = {
      id: 52,
      musicBrainzId: 'mb-test-789',
      spotifyId: 'sp-789',
      title: 'Requestable Album',
      artists: [{ id: 'artist-3', name: 'Artist Three' }],
      coverUrl: null,
      albumType: 'album',
      releaseDate: '2025-03-01',
      genres: [],
      media: {
        id: 52,
        status: 1,
        available: false,
        requests: [],
      },
    };

    let requestPayload: Record<string, unknown> | null = null;
    await Promise.all([
      page.route('**/api/v1/music/52', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockAlbum),
        });
      }),
      page.route('**/api/v1/music/52/tracks', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ results: [] }),
        });
      }),
      page.route('**/api/v1/request', (route) => {
        if (route.request().method() === 'POST') {
          requestPayload = route.request().postDataJSON();
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ id: 1, status: 1 }),
          });
        } else {
          route.continue();
        }
      }),
    ]);

    await page.goto('/music/52');
    await expect(page.getByText('Requestable Album')).toBeVisible();

    await page.getByRole('button', { name: /Request Album/i }).click();

    await expect(() => {
      expect(requestPayload).toBeTruthy();
      expect(requestPayload!.mediaType).toBe('music');
      expect(requestPayload!.externalId).toBe('mb-test-789');
    }).toPass({ timeout: 5000 });
  });
});
