import { test, expect } from './fixtures';

test.describe('Users Management - Admin', () => {
  test.describe.configure({ mode: 'serial' });

  test('should display user list with admin and test user', async ({ page }) => {
    await page.goto('/users');

    await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();

    // Table should show both users created in auth.setup
    await expect(page.getByRole('cell', { name: 'admin@test.com' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'user@test.com' })).toBeVisible();
  });

  test('should show Create User button for admin', async ({ page }) => {
    await page.goto('/users');
    await expect(page.getByRole('button', { name: 'Create User' })).toBeVisible();
  });

  test('should open create user modal and validate password', async ({ page }) => {
    await page.goto('/users');

    await page.getByRole('button', { name: 'Create User' }).first().click();

    // Modal should be visible
    const dialog = page.getByRole('dialog', { name: 'Create User' });
    await expect(dialog).toBeVisible();

    // Fill with short password
    await dialog.getByPlaceholder('johndoe').fill('newuser');
    await dialog.getByPlaceholder('user@example.com').fill('new@test.com');
    await dialog.getByPlaceholder('Min. 8 characters').fill('short');
    await dialog.getByPlaceholder('Repeat your password').fill('short');

    // Bypass HTML5 validation on the dialog's form
    await page.evaluate(() => {
      document.querySelectorAll('form').forEach((f) => f.setAttribute('novalidate', ''));
    });

    // Submit
    await dialog.getByRole('button', { name: 'Create User' }).click();

    // Should show password error
    await expect(dialog.getByText('Password must be at least 8 characters')).toBeVisible();
  });

  test('should validate password mismatch in create user modal', async ({ page }) => {
    await page.goto('/users');

    await page.getByRole('button', { name: 'Create User' }).first().click();

    const dialog = page.getByRole('dialog', { name: 'Create User' });
    await expect(dialog).toBeVisible();

    await dialog.getByPlaceholder('johndoe').fill('newuser');
    await dialog.getByPlaceholder('user@example.com').fill('new@test.com');
    await dialog.getByPlaceholder('Min. 8 characters').fill('password123');
    await dialog.getByPlaceholder('Repeat your password').fill('different123');

    await dialog.getByRole('button', { name: 'Create User' }).click();

    await expect(dialog.getByText('Passwords do not match')).toBeVisible();
  });

  test('should create a new user successfully', async ({ page }) => {
    await page.goto('/users');

    await page.getByRole('button', { name: 'Create User' }).first().click();

    const dialog = page.getByRole('dialog', { name: 'Create User' });
    await expect(dialog).toBeVisible();

    await dialog.getByPlaceholder('johndoe').fill('e2euser');
    await dialog.getByPlaceholder('user@example.com').fill('e2e-create@test.com');
    await dialog.getByPlaceholder('Min. 8 characters').fill('e2epassword');
    await dialog.getByPlaceholder('Repeat your password').fill('e2epassword');

    await dialog.getByRole('button', { name: 'Create User' }).click();

    // Modal should close and feedback should appear
    await expect(dialog).not.toBeVisible();
    await expect(page.getByText('User created!')).toBeVisible();

    // New user should appear in the list
    await expect(page.getByText('e2euser')).toBeVisible();
  });

  test('should show error when creating user with existing email', async ({ page }) => {
    await page.goto('/users');

    await page.getByRole('button', { name: 'Create User' }).first().click();

    const dialog = page.getByRole('dialog', { name: 'Create User' });
    await expect(dialog).toBeVisible();

    await dialog.getByPlaceholder('johndoe').fill('duplicate');
    await dialog.getByPlaceholder('user@example.com').fill('admin@test.com'); // Already exists
    await dialog.getByPlaceholder('Min. 8 characters').fill('password123');
    await dialog.getByPlaceholder('Repeat your password').fill('password123');

    await dialog.getByRole('button', { name: 'Create User' }).click();

    // Should show duplicate email error
    await expect(dialog.getByText(/already exists/i)).toBeVisible();
  });

  test('should not show delete button for own user', async ({ page }) => {
    await page.goto('/users');

    // The admin row should not have a delete button
    // Find the row with admin username and check there's no delete button
    const adminRow = page.locator('tr', { has: page.locator('text=admin@test.com') });
    await expect(adminRow.getByTitle('Delete')).not.toBeVisible();
  });

  test('should delete a user with confirmation', async ({ page }) => {
    await page.goto('/users');
    await page.waitForLoadState('networkidle');

    // Wait for the e2euser created in the previous test
    await expect(page.getByRole('cell', { name: 'e2e-create@test.com' })).toBeVisible({ timeout: 10000 });

    // Find the delete button in the e2euser row (not testuser — used by other test files)
    const userRow = page.getByRole('row', { name: /e2euser.*e2e-create@test.com/ });
    await userRow.getByTitle('Delete').click();

    // Confirmation modal
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10000 });
    await expect(dialog.getByText(/Are you sure you want to delete the user/)).toBeVisible();

    // Confirm delete and verify API response
    const responsePromise = page.waitForResponse(
      (r) => r.url().includes('/api/v1/user/') && r.request().method() === 'DELETE'
    );
    await dialog.getByRole('button', { name: 'Delete' }).click();
    const response = await responsePromise;
    expect(response.status()).toBe(200);

    // User should be removed from the table
    await expect(page.getByRole('cell', { name: 'e2e-create@test.com' })).not.toBeVisible({ timeout: 10000 });
  });
});

test.describe('Users Page - Regular User', () => {
  test.use({ storageState: 'tests/e2e/.auth/user.json' });

  test('should not have access to users page', async ({ page }) => {
    // Regular users don't have MANAGE_USERS permission
    // They should be redirected or see access denied
    await page.goto('/users');

    // The Users link is not in sidebar, and the page should not show user list
    // It may redirect to / or show nothing
    await expect(page.getByRole('heading', { name: 'Users' })).not.toBeVisible();
  });
});
