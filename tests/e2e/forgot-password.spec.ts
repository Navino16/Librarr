import { test, expect } from './fixtures';
import { request as playwrightRequest } from '@playwright/test';

const BASE_URL = 'http://localhost:5156';

// All tests run unauthenticated
test.use({ storageState: { cookies: [], origins: [] } });

// Use serial mode: SMTP-off tests run first, then we configure SMTP for the rest
test.describe.serial('Forgot Password', () => {
  // ─── SMTP not configured ─────────────────────────────────────────────

  test('should not show forgot password link when SMTP is not configured', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('link', { name: /forgot|oublié/i })).not.toBeVisible();
  });

  test('should redirect to login when navigating directly to forgot-password without SMTP', async ({ page }) => {
    await page.goto('/login/forgot-password');
    await expect(page).toHaveURL('/login');
  });

  // ─── Configure SMTP (shared API context with admin auth) ─────────────

  test('configure SMTP for subsequent tests', async () => {
    const ctx = await playwrightRequest.newContext({ baseURL: BASE_URL });
    await ctx.post('/api/v1/auth/local', {
      data: { email: 'admin@test.com', password: 'adminadmin' },
    });
    const smtpRes = await ctx.post('/api/v1/settings/notifications/smtp/config', {
      data: {
        host: 'smtp.test.local',
        port: 587,
        secure: false,
        authUser: '',
        authPass: '',
        senderAddress: 'noreply@test.local',
        senderName: 'Librarr Test',
        requireTls: false,
        allowSelfSigned: true,
      },
    });
    expect(smtpRes.ok()).toBeTruthy();

    const mainRes = await ctx.post('/api/v1/settings/main', {
      data: { applicationUrl: BASE_URL },
    });
    expect(mainRes.ok()).toBeTruthy();
    await ctx.dispose();
  });

  // ─── SMTP configured ─────────────────────────────────────────────────

  test('should show forgot password link on login page when SMTP is configured', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('link', { name: /forgot|oublié/i })).toBeVisible();
  });

  test('should navigate to forgot password page and submit email', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('link', { name: /forgot|oublié/i }).click();
    await expect(page).toHaveURL('/login/forgot-password');

    await page.locator('#email').fill('admin@test.com');
    await page.getByRole('button', { name: /send|envoyer/i }).click();

    // Success message (anti-enumeration: always shows success)
    await expect(page.locator('.bg-librarr-success\\/10')).toBeVisible();
  });

  test('should show success even for non-existent email (anti-enumeration)', async ({ page }) => {
    await page.goto('/login/forgot-password');

    await page.locator('#email').fill('nonexistent@example.com');
    await page.getByRole('button', { name: /send|envoyer/i }).click();

    await expect(page.locator('.bg-librarr-success\\/10')).toBeVisible();
  });

  test('should navigate back to login from forgot password page', async ({ page }) => {
    await page.goto('/login/forgot-password');
    await expect(page.locator('#email')).toBeVisible();

    await page.getByRole('link', { name: /back|retour/i }).click();
    await expect(page).toHaveURL('/login');
  });

  // ─── Reset Password Page ─────────────────────────────────────────────

  test('should show error for invalid/expired token', async ({ page }) => {
    await page.goto('/login/reset-password/invalid-guid-12345');

    await page.locator('#password').fill('newpassword123');
    await page.locator('#confirmPassword').fill('newpassword123');

    const responsePromise = page.waitForResponse(
      (resp) => resp.url().includes('/auth/reset-password/')
    );
    await page.locator('button[type="submit"]').click();
    const response = await responsePromise;
    expect(response.status()).toBe(404);

    // Error message should appear
    await expect(page.locator('.bg-librarr-danger\\/10')).toBeVisible();
  });

  test('should show error when passwords do not match', async ({ page }) => {
    await page.goto('/login/reset-password/some-guid');

    await page.locator('#password').fill('newpassword123');
    await page.locator('#confirmPassword').fill('differentpass123');
    await page.locator('button[type="submit"]').click();

    // Client-side validation error
    await expect(page.locator('.bg-librarr-danger\\/10')).toBeVisible();
  });

  test('should navigate back to login from reset password page', async ({ page }) => {
    await page.goto('/login/reset-password/some-guid');

    await expect(page.locator('#password')).toBeVisible();
    await page.getByRole('link', { name: /back|retour/i }).click();
    await expect(page).toHaveURL('/login');
  });

  // ─── Cleanup SMTP ────────────────────────────────────────────────────

  test('cleanup SMTP config', async () => {
    const ctx = await playwrightRequest.newContext({ baseURL: BASE_URL });
    await ctx.post('/api/v1/auth/local', {
      data: { email: 'admin@test.com', password: 'adminadmin' },
    });
    await ctx.post('/api/v1/settings/notifications/smtp/config', {
      data: {
        host: '',
        port: 587,
        secure: false,
        authUser: '',
        authPass: '',
        senderAddress: '',
        senderName: '',
        requireTls: false,
        allowSelfSigned: false,
      },
    });
    await ctx.dispose();
  });
});
