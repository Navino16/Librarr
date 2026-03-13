import { test, expect } from './fixtures';

test.describe('Jobs Settings Page', () => {
  const mockJobs = [
    {
      id: 'downloadSync',
      name: 'Download Sync',
      schedule: '*/5 * * * *',
      running: false,
      nextRun: '2026-03-06T15:00:00Z',
    },
    {
      id: 'availabilitySync',
      name: 'Availability Sync',
      schedule: '*/15 * * * *',
      running: true,
      nextRun: '2026-03-06T15:15:00Z',
    },
    {
      id: 'arrLibraryScan',
      name: 'Readarr Library Scan',
      schedule: '0 3 * * *',
      running: false,
      nextRun: '2026-03-07T03:00:00Z',
    },
  ];

  function setupRoutes(page: import('@playwright/test').Page) {
    return page.route('**/api/v1/settings/jobs', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockJobs),
      });
    });
  }

  test('should display job list with schedules', async ({ page }) => {
    await setupRoutes(page);
    await page.goto('/settings/jobs');

    await expect(
      page.getByRole('heading', { name: 'Jobs & Cache' })
    ).toBeVisible();

    // All job names visible
    await expect(page.getByText('Download Sync')).toBeVisible();
    await expect(page.getByText('Availability Sync')).toBeVisible();
    await expect(page.getByText('Readarr Library Scan')).toBeVisible();

    // Schedule cron expressions visible
    await expect(page.getByText('*/5 * * * *')).toBeVisible();
    await expect(page.getByText('*/15 * * * *')).toBeVisible();
    await expect(page.getByText('0 3 * * *')).toBeVisible();
  });

  test('should show running badge for active job', async ({ page }) => {
    await setupRoutes(page);
    await page.goto('/settings/jobs');

    // The "Running" badge should appear for the availabilitySync job
    await expect(page.getByText('Running')).toBeVisible();

    // Only one job is running, so there should be exactly one Running badge
    await expect(page.getByText('Running')).toHaveCount(1);
  });

  test('should trigger a job manually', async ({ page }) => {
    await setupRoutes(page);

    let triggeredJobId: string | null = null;
    await page.route('**/api/v1/settings/jobs/*/run', (route) => {
      if (route.request().method() === 'POST') {
        const url = route.request().url();
        // Extract jobId from URL: .../settings/jobs/{jobId}/run
        const match = url.match(/\/settings\/jobs\/([^/]+)\/run/);
        triggeredJobId = match ? match[1] : null;
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        });
      } else {
        route.continue();
      }
    });

    await page.goto('/settings/jobs');

    // Wait for jobs to load
    await expect(page.getByText('Download Sync')).toBeVisible();

    // Click the first "Run Now" button (for Download Sync, since it's not running)
    await page.getByRole('button', { name: 'Run Now' }).first().click();

    // Verify that the POST was made
    await expect(() => {
      expect(triggeredJobId).toBeTruthy();
    }).toPass({ timeout: 5000 });
  });
});
