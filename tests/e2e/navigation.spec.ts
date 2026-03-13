import { test, expect } from './fixtures';

test.describe('Navigation - Admin', () => {
  // Uses default admin storageState from config

  test('should see all sidebar links including Settings and Users', async ({ page }) => {
    await page.goto('/');
    const nav = page.getByRole('navigation');

    await expect(nav.getByText('Discover')).toBeVisible();
    await expect(nav.getByText('Search')).toBeVisible();
    await expect(nav.getByText('Requests')).toBeVisible();
    await expect(nav.getByText('Issues')).toBeVisible();
    await expect(nav.getByText('Users')).toBeVisible();
    await expect(nav.getByText('Settings')).toBeVisible();
  });

  test('should navigate to each sidebar link without error', async ({ page }) => {
    await page.goto('/');

    const links = [
      { name: 'Requests', url: '/requests' },
      { name: 'Search', url: '/search' },
      { name: 'Issues', url: '/issues' },
      { name: 'Users', url: '/users' },
      { name: 'Settings', url: '/settings' },
      { name: 'Discover', url: '/' },
    ];

    for (const link of links) {
      await page.getByRole('navigation').getByText(link.name).click();
      await expect(page).toHaveURL(link.url);
      // Page should not show an unexpected error
      await expect(page.getByText('Something went wrong')).not.toBeVisible();
    }
  });
});

test.describe('Navigation - User', () => {
  test.use({ storageState: 'tests/e2e/.auth/user.json' });

  test('should not see Settings or Users in sidebar', async ({ page }) => {
    await page.goto('/');
    const nav = page.getByRole('navigation');

    await expect(nav.getByText('Discover')).toBeVisible();
    await expect(nav.getByText('Search')).toBeVisible();
    await expect(nav.getByText('Requests')).toBeVisible();

    await expect(nav.getByText('Settings')).not.toBeVisible();
    await expect(nav.getByText('Users')).not.toBeVisible();
  });

  test('should show discover sections on home page', async ({ page }) => {
    await page.goto('/');

    // Welcome message with username
    await expect(page.getByText(/Welcome back/)).toBeVisible();
  });
});
