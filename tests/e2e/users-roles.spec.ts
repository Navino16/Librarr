import { test, expect } from './fixtures';

test.describe('Users Page - Role Assignment & Interactions', () => {
  const mockUsers = {
    results: [
      { id: 1, username: 'admin', email: 'admin@admin.com', userType: 3, permissions: 0xFFFFFFFF, createdAt: '2026-01-01T00:00:00Z' },
      { id: 2, username: 'manager', email: 'manager@test.com', userType: 3, permissions: 4095, createdAt: '2026-02-01T00:00:00Z' },
      { id: 3, username: 'basicuser', email: 'basic@test.com', userType: 3, permissions: 1, createdAt: '2026-03-01T00:00:00Z' },
    ],
    pageInfo: { pages: 1, page: 0, results: 3 },
  };

  const mockRoles = [
    { id: 1, name: 'Admin', permissions: 0xFFFFFFFF, isDefault: false },
    { id: 2, name: 'Manager', permissions: 4095, isDefault: true },
    { id: 3, name: 'User', permissions: 1, isDefault: false },
  ];

  function setupRoutes(page: import('@playwright/test').Page) {
    return Promise.all([
      page.route('**/api/v1/user?*', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockUsers),
        });
      }),
      page.route('**/api/v1/settings/roles', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockRoles),
        });
      }),
    ]);
  }

  test('should display users table with role column', async ({ page }) => {
    await setupRoutes(page);
    await page.goto('/users');

    const main = page.getByRole('main');
    await expect(main.getByText('admin', { exact: true })).toBeVisible();
    await expect(main.getByText('manager', { exact: true })).toBeVisible();
    await expect(main.getByText('basicuser')).toBeVisible();

    // Role column header
    await expect(main.getByText('Role', { exact: true })).toBeVisible();
  });

  test('should show role dropdown for non-self users', async ({ page }) => {
    await setupRoutes(page);
    await page.goto('/users');

    const main = page.getByRole('main');
    await expect(main.getByText('basicuser')).toBeVisible();

    // Non-self users get a role <select>
    const selects = main.locator('select');
    // admin (self) doesn't get a select, manager and basicuser do
    const selectCount = await selects.count();
    expect(selectCount).toBeGreaterThanOrEqual(2);
  });

  test('should change user role via dropdown', async ({ page }) => {
    await setupRoutes(page);

    let updatedPayload: Record<string, unknown> | null = null;
    await page.route('**/api/v1/user/*/settings/permissions', (route) => {
      if (route.request().method() === 'POST') {
        updatedPayload = route.request().postDataJSON();
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        });
      } else {
        route.continue();
      }
    });

    await page.goto('/users');

    const main = page.getByRole('main');
    await expect(main.getByText('basicuser')).toBeVisible();

    // Change basicuser's role from User (id=3) to Manager (id=2)
    const selects = main.locator('select');
    // The last select should be for basicuser
    await selects.last().selectOption('2');

    // Verify the API call was made
    await expect(() => {
      expect(updatedPayload).toBeTruthy();
      expect(updatedPayload!.permissions).toBe(4095);
    }).toPass({ timeout: 5000 });
  });

  test('should show delete button only for non-self users', async ({ page }) => {
    await setupRoutes(page);
    await page.goto('/users');

    const main = page.getByRole('main');
    await expect(main.getByText('basicuser')).toBeVisible();

    // Delete buttons should exist for non-self users
    const deleteButtons = main.getByTitle('Delete');
    const count = await deleteButtons.count();
    // admin is self (no delete button), so 2 delete buttons for manager + basicuser
    expect(count).toBe(2);
  });

  test('should open delete confirmation modal', async ({ page }) => {
    await setupRoutes(page);
    await page.goto('/users');

    const main = page.getByRole('main');
    await expect(main.getByText('basicuser')).toBeVisible();

    // Click delete on basicuser (last delete button)
    await main.getByTitle('Delete').last().click();

    // Delete modal should appear
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('basicuser')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Delete' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeVisible();
  });

  test('should show user type labels', async ({ page }) => {
    await setupRoutes(page);
    await page.goto('/users');

    const main = page.getByRole('main');
    // All users have userType 1 = LOCAL
    await expect(main.getByText('Local').first()).toBeVisible();
  });
});
