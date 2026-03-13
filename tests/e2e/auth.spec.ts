import { test, expect } from './fixtures';

// These tests run WITHOUT pre-loaded storageState (no auth)
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Authentication', () => {
  test('should login as admin and see username in header', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('admin@test.com');
    await page.getByLabel('Password').fill('adminadmin');
    await page.getByRole('button', { name: 'Sign In' }).click();

    // Should redirect to home page
    await expect(page).toHaveURL('/');

    // Username should be visible in the user dropdown button
    await expect(page.getByRole('button', { name: 'A admin' })).toBeVisible();
  });

  test('should login as regular user and not see admin links', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('user@test.com');
    await page.getByLabel('Password').fill('testtest123');
    await page.getByRole('button', { name: 'Sign In' }).click();

    await expect(page).toHaveURL('/');
    await expect(page.getByRole('button', { name: 'T testuser' })).toBeVisible();

    // Regular user should NOT see Settings or Users in sidebar
    await expect(page.getByRole('navigation').getByText('Settings')).not.toBeVisible();
    await expect(page.getByRole('navigation').getByText('Users')).not.toBeVisible();
  });

  test('should show error with invalid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('wrong@test.com');
    await page.getByLabel('Password').fill('wrongpassword');
    await page.getByRole('button', { name: 'Sign In' }).click();

    // Should stay on login page with error message
    await expect(page.getByRole('alert').filter({ hasText: /./  })).toBeVisible();
    await expect(page).toHaveURL('/login');
  });

  test('should logout and redirect to login', async ({ page }) => {
    // First login
    await page.goto('/login');
    await page.getByLabel('Email').fill('admin@test.com');
    await page.getByLabel('Password').fill('adminadmin');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page).toHaveURL('/');

    // Open user dropdown and click Sign Out
    await page.getByRole('button', { name: 'A admin' }).click();
    await page.getByRole('menuitem', { name: 'Sign Out' }).click();

    await expect(page).toHaveURL('/login');
  });

  test('should redirect to login when accessing protected page without auth', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
  });
});
