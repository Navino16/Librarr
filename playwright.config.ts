import { defineConfig, devices } from '@playwright/test';
import path from 'path';

const TEST_CONFIG_DIR = path.join(__dirname, 'tests', 'e2e', '.test-config');
const SETUP_CONFIG_DIR = path.join(__dirname, 'tests', 'e2e', '.test-config-setup');
const reuseServer = process.env.E2E_REUSE_SERVER === 'true';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['list'],
    ['junit', { outputFile: '.reports/junit-e2e.xml' }],
    ['monocart-reporter', {
      name: 'E2E Coverage Report',
      outputFile: '.reports/monocart/index.html',
      coverage: {
        reports: ['v8', 'console-details'],
        entryFilter: (entry: { url?: string }) => {
          const url = entry.url || '';
          // Keep only webpack-internal modules from our src/ (not node_modules)
          return url.includes('webpack-internal://') && url.includes('/src/')
            && !url.includes('node_modules');
        },
        sourcePath: (filePath: string) => {
          // "webpack-internal:///(pages-dir-browser)/./src/pages/setup.tsx" → absolute src path
          const match = filePath.match(/webpack-internal:\/\/[^/]*\/\.\/(src\/.+)/);
          if (match) {
            return path.resolve(__dirname, match[1]);
          }
          return filePath;
        },
        all: {
          dir: ['./src/pages', './src/components'],
          filter: {
            '**/*.tsx': true,
            '**/*.ts': true,
          },
        },
      },
    }],
  ],
  outputDir: '.reports/test-results',
  use: {
    baseURL: 'http://localhost:5156',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'setup-page',
      testMatch: /setup\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:5155',
      },
    },
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'e2e',
      testIgnore: [/\.setup\.ts/, /setup\.spec\.ts/],
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'tests/e2e/.auth/admin.json',
      },
      dependencies: ['setup'],
    },
  ],
  webServer: [
    {
      command: `npx ts-node --project server/tsconfig.json server/index.ts`,
      url: 'http://localhost:5155/api/v1/settings/public',
      reuseExistingServer: reuseServer,
      timeout: 120000,
      env: {
        CONFIG_DIR: SETUP_CONFIG_DIR,
        DB_SYNCHRONIZE: 'true',
        PORT: '5155',
        NODE_ENV: 'development',
        SESSION_SECRET: 'e2e-setup-secret',
        NEXT_DIST_DIR: '.next-setup',
        USE_WEBPACK: 'true',
      },
    },
    {
      command: `npx ts-node --project server/tsconfig.json server/index.ts`,
      url: 'http://localhost:5156/api/v1/settings/public',
      reuseExistingServer: reuseServer,
      timeout: 120000,
      env: {
        CONFIG_DIR: TEST_CONFIG_DIR,
        DB_SYNCHRONIZE: 'true',
        PORT: '5156',
        NODE_ENV: 'development',
        SESSION_SECRET: 'e2e-test-secret',
        NEXT_DIST_DIR: '.next-test',
        USE_WEBPACK: 'true',
      },
    },
  ],
  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',
});
