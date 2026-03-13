import { test, expect } from './fixtures';

test.describe('404 Page', () => {
  test('should display 404 page for non-existent routes', async ({ page }) => {
    await page.goto('/this-page-does-not-exist');

    await expect(page.getByText('404')).toBeVisible();
    await expect(page.getByText("The page you're looking for doesn't exist.")).toBeVisible();

    // "Go Home" link should point to /
    const homeLink = page.getByRole('link', { name: 'Go Home' });
    await expect(homeLink).toBeVisible();
    await expect(homeLink).toHaveAttribute('href', '/');
  });

  test('should navigate back to home from 404 page', async ({ page }) => {
    await page.goto('/non-existent-route');

    await expect(page.getByText('404')).toBeVisible();
    await page.getByRole('link', { name: 'Go Home' }).click();
    // Should navigate away from 404 page
    await expect(page.getByText('404')).not.toBeVisible({ timeout: 15000 });
  });
});
