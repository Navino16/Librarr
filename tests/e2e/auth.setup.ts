import { test as setup, expect, request as playwrightRequest } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:5156';
const AUTH_DIR = path.join(__dirname, '.auth');

setup('seed database and create auth states', async () => {
  if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
  }

  // --- Admin setup ---
  const adminContext = await playwrightRequest.newContext({ baseURL: BASE_URL });

  // Step 1: Initialize the app (creates admin user + sets initialized=true + auto-login)
  const initRes = await adminContext.post('/api/v1/settings/initialize', {
    data: {
      email: 'admin@test.com',
      username: 'admin',
      password: 'adminadmin',
    },
  });
  expect(initRes.ok()).toBeTruthy();

  // Step 2: Enable all request types via main settings
  const mainRes = await adminContext.post('/api/v1/settings/main', {
    data: {
      enableEbookRequests: true,
      enableAudiobookRequests: true,
      enableMusicRequests: true,
    },
  });
  expect(mainRes.ok()).toBeTruthy();

  // Step 3: Create a regular user
  const userCreateRes = await adminContext.post('/api/v1/user', {
    data: {
      email: 'user@test.com',
      username: 'testuser',
      password: 'testtest123',
    },
  });
  expect(userCreateRes.ok()).toBeTruthy();

  // Save admin storage state
  const adminState = await adminContext.storageState();
  fs.writeFileSync(
    path.join(AUTH_DIR, 'admin.json'),
    JSON.stringify(adminState, null, 2)
  );
  await adminContext.dispose();

  // --- User setup ---
  const userContext = await playwrightRequest.newContext({ baseURL: BASE_URL });

  const userLoginRes = await userContext.post('/api/v1/auth/local', {
    data: {
      email: 'user@test.com',
      password: 'testtest123',
    },
  });
  expect(userLoginRes.ok()).toBeTruthy();

  // Save user storage state
  const userState = await userContext.storageState();
  fs.writeFileSync(
    path.join(AUTH_DIR, 'user.json'),
    JSON.stringify(userState, null, 2)
  );
  await userContext.dispose();
});
