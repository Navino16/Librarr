import { test, expect } from './fixtures';

test.describe('User Profile Page', () => {
  test('should display admin profile via /users/:id', async ({ page }) => {
    // First get the admin user ID
    const meResponse = await page.request.get('/api/v1/auth/me');
    const me = await meResponse.json();
    const userId = me.id;

    await page.goto(`/users/${userId}`);

    // Profile info
    await expect(page.getByRole('heading', { name: 'admin' })).toBeVisible();
    await expect(page.getByText('admin@test.com')).toBeVisible();

    // Recent Requests section
    await expect(page.getByText('Recent Requests')).toBeVisible();

    // Edit Settings button (own profile)
    await expect(page.getByText('Edit Settings')).toBeVisible();
  });

  test('should navigate to user settings from profile', async ({ page }) => {
    const meResponse = await page.request.get('/api/v1/auth/me');
    const me = await meResponse.json();

    await page.goto(`/users/${me.id}`);
    await page.getByText('Edit Settings').click();

    await expect(page).toHaveURL(new RegExp(`/users/${me.id}/settings`));
    await expect(page.getByRole('heading', { name: 'User Settings' })).toBeVisible();
  });
});

test.describe('User Settings Page', () => {
  test('should display general settings and password form', async ({ page }) => {
    const meResponse = await page.request.get('/api/v1/auth/me');
    const me = await meResponse.json();

    await page.goto(`/users/${me.id}/settings`);

    const main = page.getByRole('main');

    // General section
    await expect(main.getByRole('heading', { name: 'General' })).toBeVisible();
    await expect(main.getByText('Display Language')).toBeVisible();

    // Password section
    await expect(main.getByRole('heading', { name: 'Password' })).toBeVisible();
    await expect(main.getByText('Current Password')).toBeVisible();
    await expect(main.getByText('New Password', { exact: true })).toBeVisible();
    await expect(main.getByText('Confirm Password')).toBeVisible();
    await expect(main.getByRole('button', { name: 'Update Password' })).toBeVisible();
  });

  test('should validate password minimum length', async ({ page }) => {
    const meResponse = await page.request.get('/api/v1/auth/me');
    const me = await meResponse.json();

    await page.goto(`/users/${me.id}/settings`);

    const main = page.getByRole('main');

    // Use placeholders to target specific password inputs
    await main.locator('input[placeholder="Enter your password"]').fill('adminadmin');
    await main.locator('input[placeholder="Min. 8 characters"]').fill('short');
    await main.locator('input[placeholder="Repeat your password"]').fill('short');

    await main.getByRole('button', { name: 'Update Password' }).click();

    await expect(main.getByText('Password must be at least 8 characters')).toBeVisible();
  });

  test('should validate password mismatch', async ({ page }) => {
    const meResponse = await page.request.get('/api/v1/auth/me');
    const me = await meResponse.json();

    await page.goto(`/users/${me.id}/settings`);

    const main = page.getByRole('main');

    // Use placeholders to target specific password inputs
    await main.locator('input[placeholder="Enter your password"]').fill('adminadmin');
    await main.locator('input[placeholder="Min. 8 characters"]').fill('newpassword123');
    await main.locator('input[placeholder="Repeat your password"]').fill('different123');

    await main.getByRole('button', { name: 'Update Password' }).click();

    await expect(main.getByText('Passwords do not match')).toBeVisible();
  });

  test('should save display language', async ({ page }) => {
    const meResponse = await page.request.get('/api/v1/auth/me');
    const me = await meResponse.json();

    await page.goto(`/users/${me.id}/settings`);

    // Save without changes should work
    await page.getByRole('button', { name: 'Save Changes' }).first().click();
    await expect(page.getByText('Settings saved!')).toBeVisible();
  });
});

test.describe('User Settings - Admin viewing other user', () => {
  test('should show permissions section when admin views another user', async ({ page }) => {
    // Get testuser's ID
    const usersResponse = await page.request.get('/api/v1/user?take=25&skip=0');
    const usersData = await usersResponse.json();
    const testuser = usersData.results.find((u: { username: string }) => u.username === 'testuser');

    if (!testuser) {
      test.skip();
      return;
    }

    await page.goto(`/users/${testuser.id}/settings`);

    // Should see Permissions section (admin viewing other user)
    await expect(page.getByRole('heading', { name: 'Permissions' })).toBeVisible();
    await expect(page.getByText('Apply Role')).toBeVisible();
  });
});
