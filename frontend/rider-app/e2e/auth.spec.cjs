const { test, expect } = require('@playwright/test');

const rider = { id: '11111111-1111-4111-8111-111111111111', name: 'Asha Rider', phone: '+919876543210', email: null, status: 'pending', identity_verification_status: 'not_started' };
const session = { token: 't'.repeat(43), expiresAt: new Date(Date.now() + 86400000).toISOString(), rider };

test('desktop scene persists across login and signup', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: testInfo.outputPath('login-desktop.png'), fullPage: true });
  await page.locator('canvas').evaluate(canvas => { canvas.dataset.sceneInstance = 'original'; });
  await page.getByRole('button', { name: 'Join us', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your journey starts here.' })).toBeVisible();
  await expect(page.locator('canvas')).toHaveAttribute('data-scene-instance', 'original');
  expect(errors).toEqual([]);
});

test('mobile phone signup verifies OTP and opens the pending account', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/auth/signup/start', route => route.fulfill({ status: 202, json: { challengeId: rider.id, expiresAt: new Date(Date.now() + 300000).toISOString(), resendAfterSeconds: 60 } }));
  await page.route('**/auth/signup/verify', async route => {
    expect(route.request().postDataJSON().code).toBe('012345');
    await route.fulfill({ status: 201, json: session });
  });
  await page.route('**/rider/me', route => route.fulfill({ json: { rider, currentOrder: null } }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Join us', exact: true }).click();
  await page.getByRole('textbox', { name: 'Full name', exact: true }).fill('Asha Rider');
  await page.getByRole('textbox', { name: 'Phone number', exact: true }).fill('+91 98765 43210');
  await expect(page.getByTestId('auth-form')).toHaveCSS('opacity', '1');
  await page.screenshot({ path: testInfo.outputPath('signup-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: 'Create my account' }).click();
  await expect(page.getByRole('heading', { name: 'Check your messages.' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Resend in/ })).toBeDisabled();
  await page.getByLabel('Six-digit verification code').fill('012345');
  await expect(page.getByTestId('auth-form')).toHaveCSS('opacity', '1');
  await page.screenshot({ path: testInfo.outputPath('otp-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: 'Verify and continue' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome, Asha.' })).toBeVisible();
  await expect(page.getByText('Contact verified', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('email validation, password visibility and reset flow', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Email address' }).click();
  await page.getByRole('textbox', { name: 'Email address', exact: true }).fill('rider@example.com');
  await page.getByLabel('Password', { exact: true }).fill('a very long password');
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: 'Show password' }).click();
  await expect(page.getByLabel('Password', { exact: true })).toHaveJSProperty('type', 'text');
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await page.route('**/auth/password/reset/start', route => route.fulfill({ status: 202, json: { challengeId: rider.id, expiresAt: new Date(Date.now() + 300000).toISOString(), resendAfterSeconds: 60 } }));
  await page.route('**/auth/password/reset/complete', route => route.fulfill({ json: { message: 'Password updated' } }));
  await page.getByRole('button', { name: 'Send reset code' }).click();
  await page.getByLabel('Six-digit verification code').fill('012345');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByLabel('New password', { exact: true }).fill('a new unique password');
  await page.getByLabel('Confirm password', { exact: true }).fill('different password');
  await page.getByRole('button', { name: 'Update password' }).click();
  await expect(page.getByText('Your passwords do not match.')).toBeVisible();
  await page.getByLabel('Confirm password', { exact: true }).fill('a new unique password');
  await page.getByRole('button', { name: 'Update password' }).click();
  await expect(page.getByText('Password updated. Sign in with your new password.')).toBeVisible();
});

test('graphics failure leaves usable authentication forms', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) { return type.includes('webgl') ? null : original.call(this, type, ...args); };
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Phone number', exact: true }).fill('+919876543210');
  await expect(page.getByRole('button', { name: 'Send login code' })).toBeEnabled();
});

test('rate-limited OTP requests show a wait state without sending again', async ({ page }) => {
  let sends = 0;
  await page.route('**/auth/signin/otp/start', route => {
    sends += 1;
    return route.fulfill({ status: 429, headers: { 'Retry-After': '120' }, json: { error: { code: 'RATE_LIMITED', message: 'Too many attempts.', details: { retryAfterSeconds: 120 } } } });
  });
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Phone number', exact: true }).fill('+919876543210');
  await page.getByRole('button', { name: 'Send login code', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Send login code', exact: true })).toBeDisabled();
  await expect(page.getByText(/Too many attempts. Try again in/)).toBeVisible();
  expect(sends).toBe(1);
});
