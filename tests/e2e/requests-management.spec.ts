import { test, expect } from './fixtures';

test.describe('Requests Management - Admin', () => {
  // Admin auth from default config

  const mockRequestCounts = {
    pending: 2,
    approved: 1,
    declined: 1,
    completed: 3,
    failed: 0,
  };

  const mockRequests = {
    pageInfo: { pages: 1, page: 1, results: 4 },
    results: [
      {
        id: 1,
        type: 'book',
        format: 'ebook',
        status: 1, // PENDING
        createdAt: new Date().toISOString(),
        work: { id: 10, title: 'Pending Book', coverUrl: null, hardcoverId: 'hc-10' },
        requestedBy: { id: 2, username: 'testuser', avatar: null },
        downloadProgress: null,
        downloadStatus: null,
        downloadTimeLeft: null,
        declineReason: null,
        requestedLanguage: null,
      },
      {
        id: 2,
        type: 'book',
        format: 'audiobook',
        status: 2, // APPROVED
        createdAt: new Date().toISOString(),
        work: { id: 11, title: 'Approved Audiobook', coverUrl: null, hardcoverId: 'hc-11' },
        requestedBy: { id: 2, username: 'testuser', avatar: null },
        downloadProgress: 45,
        downloadStatus: 'downloading',
        downloadTimeLeft: '5m',
        declineReason: null,
        requestedLanguage: null,
      },
      {
        id: 3,
        type: 'music',
        status: 3, // DECLINED
        createdAt: new Date().toISOString(),
        album: { id: 20, title: 'Declined Album', coverUrl: null, musicBrainzId: 'mb-20' },
        requestedBy: { id: 2, username: 'testuser', avatar: null },
        downloadProgress: null,
        downloadStatus: null,
        downloadTimeLeft: null,
        declineReason: 'not_available',
        requestedLanguage: null,
      },
      {
        id: 4,
        type: 'book',
        format: 'ebook',
        status: 4, // COMPLETED
        createdAt: new Date().toISOString(),
        work: { id: 12, title: 'Completed Book', coverUrl: null, hardcoverId: 'hc-12' },
        requestedBy: { id: 2, username: 'testuser', avatar: null },
        downloadProgress: null,
        downloadStatus: null,
        downloadTimeLeft: null,
        declineReason: null,
        requestedLanguage: null,
      },
    ],
  };

  function setupRoutes(page: import('@playwright/test').Page) {
    return Promise.all([
      page.route('**/api/v1/request/count', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockRequestCounts),
        });
      }),
      page.route('**/api/v1/request?*', (route) => {
        const url = new URL(route.request().url());
        const statusParam = url.searchParams.get('status');

        if (statusParam) {
          const filtered = mockRequests.results.filter(
            (r) => r.status === Number(statusParam)
          );
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
            body: JSON.stringify(mockRequests),
          });
        }
      }),
    ]);
  }

  test('should display requests list with status badges and format badges', async ({ page }) => {
    await setupRoutes(page);
    await page.goto('/requests');

    // Title
    await expect(page.getByRole('heading', { name: 'Requests' })).toBeVisible();

    // Filter tabs visible with counts
    await expect(page.getByRole('button', { name: /All/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Pending/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Approved/ })).toBeVisible();

    // Request items visible
    await expect(page.getByText('Pending Book')).toBeVisible();
    await expect(page.getByText('Approved Audiobook')).toBeVisible();
    await expect(page.getByText('Declined Album')).toBeVisible();
    await expect(page.getByText('Completed Book')).toBeVisible();

    // Format badges
    await expect(page.getByText('Ebook').first()).toBeVisible();
    await expect(page.getByText('Audiobook').first()).toBeVisible();
    await expect(page.getByText('Music')).toBeVisible();
  });

  test('should filter requests by status', async ({ page }) => {
    await setupRoutes(page);
    await page.goto('/requests');

    // Click Pending filter
    await page.getByRole('button', { name: /Pending/ }).click();

    // Only pending request should be visible
    await expect(page.getByText('Pending Book')).toBeVisible();
    await expect(page.getByText('Approved Audiobook')).not.toBeVisible();
    await expect(page.getByText('Completed Book')).not.toBeVisible();
  });

  test('should show download progress for approved request', async ({ page }) => {
    await setupRoutes(page);
    await page.goto('/requests');

    // Download progress should be shown for the approved request
    await expect(page.getByText('45%')).toBeVisible();
  });

  test('should show decline reason on declined request', async ({ page }) => {
    await setupRoutes(page);
    await page.goto('/requests');

    // Declined request should show the reason
    await expect(page.getByText(/Reason:.*Not available/)).toBeVisible();
  });

  test('should show approve and decline buttons for pending request', async ({ page }) => {
    await setupRoutes(page);
    await page.goto('/requests');

    // Pending request should have Approve and Decline buttons
    // Use first() because there may also be a Complete button for approved request
    await expect(page.getByRole('button', { name: 'Approve Request' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Decline Request' }).first()).toBeVisible();
  });

  test('should approve a request', async ({ page }) => {
    await setupRoutes(page);

    // Mock the servers-for-request endpoint (0 or 1 server = auto-approve)
    await page.route('**/api/v1/settings/servers-for-request*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    // Mock the PUT for approve
    let approvePayload: Record<string, unknown> | null = null;
    await page.route('**/api/v1/request/1', (route) => {
      if (route.request().method() === 'PUT') {
        approvePayload = route.request().postDataJSON();
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ...mockRequests.results[0], status: 2 }),
        });
      } else {
        route.continue();
      }
    });

    await page.goto('/requests');
    await page.getByRole('button', { name: 'Approve Request' }).click();

    // Verify approve was called with status 2 (APPROVED)
    await expect(() => {
      expect(approvePayload).toBeTruthy();
      expect(approvePayload!.status).toBe(2);
    }).toPass({ timeout: 5000 });
  });

  test('should open decline modal and submit with reason', async ({ page }) => {
    await setupRoutes(page);

    let declinePayload: Record<string, unknown> | null = null;
    await page.route('**/api/v1/request/1', (route) => {
      if (route.request().method() === 'PUT') {
        declinePayload = route.request().postDataJSON();
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ...mockRequests.results[0], status: 3 }),
        });
      } else {
        route.continue();
      }
    });

    await page.goto('/requests');

    // Click the first Decline button (for the pending request)
    await page.getByRole('button', { name: 'Decline Request' }).first().click();

    // Modal should open with reason dropdown
    const modal = page.getByRole('dialog', { name: 'Decline Request' });
    await expect(modal).toBeVisible();

    // Select a reason from the dropdown
    await modal.getByRole('combobox').selectOption('not_available');

    // Submit decline via the modal's Decline button
    await page.getByRole('button', { name: 'Decline', exact: true }).click();

    await expect(() => {
      expect(declinePayload).toBeTruthy();
      expect(declinePayload!.status).toBe(3);
      expect(declinePayload!.declineReason).toBe('not_available');
    }).toPass({ timeout: 5000 });
  });

  test('should show delete buttons for terminal requests', async ({ page }) => {
    await setupRoutes(page);
    await page.goto('/requests');

    // Both declined and completed requests should have Delete buttons
    await expect(page.getByRole('button', { name: 'Delete Request' }).first()).toBeVisible();
    // There should be 2 delete buttons (declined + completed)
    await expect(page.getByRole('button', { name: 'Delete Request' })).toHaveCount(2);
  });

  test('should open delete confirmation modal and delete', async ({ page }) => {
    await setupRoutes(page);

    let deleteCalledForId: string | null = null;
    await page.route('**/api/v1/request/4', (route) => {
      if (route.request().method() === 'DELETE') {
        deleteCalledForId = '4';
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        });
      } else {
        route.continue();
      }
    });
    // Also catch delete for request 3 (declined)
    await page.route('**/api/v1/request/3', (route) => {
      if (route.request().method() === 'DELETE') {
        deleteCalledForId = '3';
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        });
      } else {
        route.continue();
      }
    });

    await page.goto('/requests');

    // Click first Delete button (first terminal request)
    await page.getByRole('button', { name: 'Delete Request' }).first().click();

    // Confirmation modal
    await expect(page.getByText('Are you sure you want to delete this request?')).toBeVisible();

    // Confirm delete
    await page.getByRole('button', { name: 'Delete', exact: true }).click();

    await expect(() => {
      expect(deleteCalledForId).toBeTruthy();
    }).toPass({ timeout: 5000 });
  });

  test('should show empty state when no requests', async ({ page }) => {
    await page.route('**/api/v1/request/count', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ pending: 0, approved: 0, declined: 0, completed: 0, failed: 0 }),
      });
    });
    await page.route('**/api/v1/request?*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ pageInfo: { pages: 0, page: 1, results: 0 }, results: [] }),
      });
    });

    await page.goto('/requests');
    await expect(page.getByText('No requests found.')).toBeVisible();
  });

  test('should show server selection modal when multiple servers available', async ({ page }) => {
    await setupRoutes(page);

    await page.route('**/api/v1/settings/servers-for-request*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 1, name: 'Readarr Main', isDefault: true },
          { id: 2, name: 'Readarr Backup', isDefault: false },
        ]),
      });
    });

    await page.route('**/api/v1/request/1', (route) => {
      if (route.request().method() === 'PUT') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ...mockRequests.results[0], status: 2 }),
        });
      } else {
        route.continue();
      }
    });

    await page.goto('/requests');
    await page.getByRole('button', { name: 'Approve Request' }).click();

    // Server selection modal should appear
    await expect(page.getByText('Select Server')).toBeVisible();
    await expect(page.getByText('Readarr Main')).toBeVisible();
    await expect(page.getByText('Readarr Backup')).toBeVisible();
    await expect(page.getByText('Default')).toBeVisible();
  });
});

test.describe('Requests Page - Regular User', () => {
  test.use({ storageState: 'tests/e2e/.auth/user.json' });

  test('should see own requests but not management actions', async ({ page }) => {
    const userRequests = {
      pageInfo: { pages: 1, page: 1, results: 1 },
      results: [
        {
          id: 10,
          type: 'book',
          format: 'ebook',
          status: 1,
          createdAt: new Date().toISOString(),
          work: { id: 100, title: 'My Requested Book', coverUrl: null, hardcoverId: 'hc-100' },
          requestedBy: { id: 3, username: 'testuser', avatar: null },
          downloadProgress: null,
          downloadStatus: null,
          downloadTimeLeft: null,
          declineReason: null,
          requestedLanguage: null,
        },
      ],
    };

    await page.route('**/api/v1/request/count', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ pending: 1, approved: 0, declined: 0, completed: 0, failed: 0 }),
      });
    });
    await page.route('**/api/v1/request?*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(userRequests),
      });
    });

    await page.goto('/requests');
    await expect(page.getByText('My Requested Book')).toBeVisible();

    // Regular user should NOT see Approve/Decline buttons (no manage permission)
    await expect(page.getByRole('button', { name: 'Approve Request' })).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Decline Request' })).not.toBeVisible();
  });
});
