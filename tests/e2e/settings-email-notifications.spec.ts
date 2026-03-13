import { test, expect } from './fixtures';

const defaultAgents = {
  discord: { enabled: false, types: 0, options: {} },
  webhook: { enabled: false, types: 0, options: {} },
  email: { enabled: false, types: 0, options: {} },
};

const smtpConfig = {
  host: 'smtp.example.com',
  port: 587,
  secure: false,
  authUser: '',
  authPass: '',
  senderAddress: 'noreply@example.com',
  senderName: 'Librarr',
  requireTls: false,
  allowSelfSigned: false,
};

function setupRoutes(
  page: import('@playwright/test').Page,
  opts: { smtp?: typeof smtpConfig; agents?: typeof defaultAgents } = {}
) {
  const agents = opts.agents ?? defaultAgents;
  const smtp = opts.smtp;
  return page.route('**/api/v1/settings/notifications', (route) => {
    if (route.request().method() === 'GET') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ agents, smtp }),
      });
    } else {
      route.continue();
    }
  });
}

test.describe('Email Notification Settings', () => {
  test('should open email edit panel with SMTP fields', async ({ page }) => {
    await setupRoutes(page);
    await page.goto('/settings/notifications');

    // Click the edit button on the Email card
    const emailCard = page.locator('.card', { has: page.getByRole('heading', { name: 'Email' }) });
    await emailCard.locator('button').click();

    // SMTP form fields should be visible
    await expect(page.getByText('SMTP Host')).toBeVisible();
    await expect(page.getByText('Port', { exact: true })).toBeVisible();
    await expect(page.getByText('Username', { exact: true })).toBeVisible();
    await expect(page.getByText('Password', { exact: true })).toBeVisible();
    await expect(page.getByText('Sender Address')).toBeVisible();
    await expect(page.getByText('Sender Name')).toBeVisible();

    // Checkboxes
    await expect(page.getByText('SSL/TLS')).toBeVisible();
    await expect(page.getByText('Require TLS')).toBeVisible();
    await expect(page.getByText('Allow self-signed')).toBeVisible();

    // Action buttons
    await expect(page.getByRole('button', { name: 'Test' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
  });

  test('should populate SMTP fields from existing config', async ({ page }) => {
    await setupRoutes(page, {
      smtp: { ...smtpConfig, host: 'mail.test.com', port: 465, senderAddress: 'app@test.com' },
      agents: { ...defaultAgents, email: { enabled: true, types: 0, options: {} } },
    });
    await page.goto('/settings/notifications');

    const emailCard = page.locator('.card', { has: page.getByRole('heading', { name: 'Email' }) });
    await emailCard.locator('button').click();

    await expect(page.locator('input[placeholder="smtp.example.com"]')).toHaveValue('mail.test.com');
    await expect(page.locator('input[type="number"]')).toHaveValue('465');
    await expect(page.locator('input[placeholder="noreply@example.com"]')).toHaveValue('app@test.com');
  });

  test('should save email config', async ({ page }) => {
    await setupRoutes(page);

    let agentSaved = false;
    let smtpSaved = false;

    await page.route('**/api/v1/settings/notifications/email', (route) => {
      if (route.request().method() === 'POST') {
        agentSaved = true;
        const body = JSON.parse(route.request().postData() || '{}');
        expect(body.enabled).toBe(true);
        route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      } else {
        route.continue();
      }
    });

    await page.route('**/api/v1/settings/notifications/smtp/config', (route) => {
      smtpSaved = true;
      const body = JSON.parse(route.request().postData() || '{}');
      expect(body.host).toBe('mailpit');
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    await page.goto('/settings/notifications');

    const emailCard = page.locator('.card', { has: page.getByRole('heading', { name: 'Email' }) });
    await emailCard.locator('button').click();

    // Enable and fill SMTP host
    await page.getByText('Enable this agent').click();
    const hostInput = page.locator('input[placeholder="smtp.example.com"]');
    await hostInput.fill('mailpit');

    await page.getByRole('button', { name: 'Save' }).click();

    await page.waitForTimeout(500);
    expect(agentSaved).toBe(true);
    expect(smtpSaved).toBe(true);
  });

  test('should show success on test notification', async ({ page }) => {
    await setupRoutes(page, { smtp: smtpConfig });
    await page.route('**/api/v1/settings/notifications/email/test', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    });

    await page.goto('/settings/notifications');

    const emailCard = page.locator('.card', { has: page.getByRole('heading', { name: 'Email' }) });
    await emailCard.locator('button').click();

    await page.getByRole('button', { name: 'Test' }).click();

    await expect(page.getByText('Test notification sent!')).toBeVisible();
  });

  test('should show failure on test notification', async ({ page }) => {
    await setupRoutes(page, { smtp: smtpConfig });
    await page.route('**/api/v1/settings/notifications/email/test', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: false }),
      });
    });

    await page.goto('/settings/notifications');

    const emailCard = page.locator('.card', { has: page.getByRole('heading', { name: 'Email' }) });
    await emailCard.locator('button').click();

    await page.getByRole('button', { name: 'Test' }).click();

    await expect(page.getByText('Test notification failed.')).toBeVisible();
  });

  test('should cancel editing', async ({ page }) => {
    await setupRoutes(page);
    await page.goto('/settings/notifications');

    const emailCard = page.locator('.card', { has: page.getByRole('heading', { name: 'Email' }) });
    await emailCard.locator('button').click();

    // SMTP fields visible
    await expect(page.getByText('SMTP Host')).toBeVisible();

    // Cancel
    await page.getByRole('button', { name: 'Cancel' }).click();

    // SMTP fields should be hidden
    await expect(page.getByText('SMTP Host')).not.toBeVisible();
  });

  test('should send recipientEmail in test payload', async ({ page }) => {
    await setupRoutes(page, {
      smtp: { ...smtpConfig, senderAddress: 'test@myapp.com' },
    });

    let receivedEmail = '';
    await page.route('**/api/v1/settings/notifications/email/test', (route) => {
      const body = JSON.parse(route.request().postData() || '{}');
      receivedEmail = body.recipientEmail;
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    });

    await page.goto('/settings/notifications');

    const emailCard = page.locator('.card', { has: page.getByRole('heading', { name: 'Email' }) });
    await emailCard.locator('button').click();

    await page.getByRole('button', { name: 'Test' }).click();
    await expect(page.getByText('Test notification sent!')).toBeVisible();

    expect(receivedEmail).toBe('test@myapp.com');
  });
});
