import { test, expect } from './fixtures';

test.describe('Role Editor - Full Permission Management', () => {
  const mockRoles = [
    { id: 1, name: 'Admin', permissions: 0xFFFFFFFF, isDefault: false },
    { id: 2, name: 'Manager', permissions: 4095, isDefault: true },
    { id: 3, name: 'User', permissions: 1, isDefault: false },
  ];

  function setupRoutes(page: import('@playwright/test').Page) {
    return page.route('**/api/v1/settings/roles', (route) => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockRoles),
        });
      } else if (route.request().method() === 'POST') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: 4, ...route.request().postDataJSON() }),
        });
      } else {
        route.continue();
      }
    });
  }

  test('should open create role form with permission categories', async ({ page }) => {
    await setupRoutes(page);
    await page.goto('/settings/users');

    const main = page.getByRole('main');
    await expect(main.getByRole('heading', { name: 'Permission Roles' })).toBeVisible();

    // Click "Add Role"
    await main.getByRole('button', { name: 'Add Role' }).click();

    // Should show the role name input
    await expect(main.locator('input[type="text"]')).toBeVisible();

    // Should show permission category sections with checkboxes
    const checkboxes = main.locator('input[type="checkbox"]');
    const count = await checkboxes.count();
    expect(count).toBeGreaterThan(5);

    // Should show Save and Cancel buttons
    await expect(main.getByRole('button', { name: 'Save' })).toBeVisible();
    await expect(main.getByRole('button', { name: 'Cancel' })).toBeVisible();
  });

  test('should edit an existing role and display permission checkboxes', async ({ page }) => {
    await setupRoutes(page);

    // Mock role update
    await page.route('**/api/v1/settings/roles/*', (route) => {
      if (route.request().method() === 'PUT') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        });
      } else {
        route.continue();
      }
    });

    await page.goto('/settings/users');

    const main = page.getByRole('main');
    await expect(main.getByText('User', { exact: true })).toBeVisible();

    // Click the edit button on the "User" role (title="Edit")
    const editButtons = main.getByTitle('Edit');
    await editButtons.last().click();

    // Should now show the role editor with name input pre-filled
    const nameInput = main.locator('input[type="text"]');
    await expect(nameInput).toHaveValue('User');

    // Permission checkboxes should be visible
    const checkboxes = main.locator('input[type="checkbox"]');
    const count = await checkboxes.count();
    expect(count).toBeGreaterThan(5);
  });

  test('should save a new role via API', async ({ page }) => {
    let createdRole: Record<string, unknown> | null = null;
    await page.route('**/api/v1/settings/roles', (route) => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockRoles),
        });
      } else if (route.request().method() === 'POST') {
        createdRole = route.request().postDataJSON();
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: 4, ...createdRole }),
        });
      } else {
        route.continue();
      }
    });

    await page.goto('/settings/users');

    const main = page.getByRole('main');
    await main.getByRole('button', { name: 'Add Role' }).click();

    // Fill the role name
    await main.locator('input[type="text"]').fill('Custom Role');

    // Toggle a permission checkbox
    const checkboxes = main.locator('input[type="checkbox"]');
    await checkboxes.first().click();

    // Save
    await main.getByRole('button', { name: 'Save' }).click();

    // Verify API call was made
    await expect(() => {
      expect(createdRole).toBeTruthy();
      expect(createdRole!.name).toBe('Custom Role');
    }).toPass({ timeout: 5000 });
  });

  test('should cancel role creation', async ({ page }) => {
    await setupRoutes(page);
    await page.goto('/settings/users');

    const main = page.getByRole('main');
    await main.getByRole('button', { name: 'Add Role' }).click();

    // Fill something
    await main.locator('input[type="text"]').fill('Will Cancel');

    // Cancel
    await main.getByRole('button', { name: 'Cancel' }).click();

    // The form should be gone, Add Role button back
    await expect(main.getByRole('button', { name: 'Add Role' })).toBeVisible();
  });

  test('should show set-as-default button for non-default roles', async ({ page }) => {
    await setupRoutes(page);
    await page.route('**/api/v1/settings/roles/*', (route) => {
      if (route.request().method() === 'PUT') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        });
      } else {
        route.continue();
      }
    });

    await page.goto('/settings/users');

    const main = page.getByRole('main');
    // "User" role (not default) should have a "Set as default" button
    const starButtons = main.getByTitle('Set as default');
    await expect(starButtons.first()).toBeVisible();
  });

  test('should show permission count for non-admin roles', async ({ page }) => {
    await setupRoutes(page);
    await page.goto('/settings/users');

    const main = page.getByRole('main');
    // Non-admin roles show "X/Y permissions" text (lowercase 'permissions')
    await expect(main.getByText(/\d+\/\d+ permissions/).first()).toBeVisible();
  });
});
