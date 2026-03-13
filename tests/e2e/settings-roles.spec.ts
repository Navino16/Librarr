import { test, expect } from './fixtures';

test.describe('Roles Settings Page', () => {
  const mockRoles = [
    { id: 1, name: 'Admin', permissions: 0xFFFFFFFF, isDefault: false },
    { id: 2, name: 'Manager', permissions: 4095, isDefault: true },
    { id: 3, name: 'User', permissions: 1, isDefault: false },
  ];

  function setupRoutes(page: import('@playwright/test').Page) {
    return page.route('**/api/v1/settings/roles', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockRoles),
      });
    });
  }

  test('should display role list with Admin, Manager, User', async ({ page }) => {
    await setupRoutes(page);
    await page.goto('/settings/users');

    const main = page.getByRole('main');
    await expect(main.getByRole('heading', { name: 'Permission Roles' })).toBeVisible();

    await expect(main.getByText('Admin', { exact: true })).toBeVisible();
    await expect(main.getByText('Manager', { exact: true })).toBeVisible();
    await expect(main.getByText('User', { exact: true })).toBeVisible();
  });

  test('should show default badge on the default role', async ({ page }) => {
    await setupRoutes(page);
    await page.goto('/settings/users');

    const main = page.getByRole('main');
    // The "Default" badge should appear (only Manager has isDefault: true)
    await expect(main.getByText('Default', { exact: true })).toBeVisible();
  });

  test('should show Add Role button', async ({ page }) => {
    await setupRoutes(page);
    await page.goto('/settings/users');

    const main = page.getByRole('main');
    await expect(main.getByRole('button', { name: 'Add Role' })).toBeVisible();
  });
});
