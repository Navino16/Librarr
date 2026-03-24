import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    include: ['tests/server/**/*.test.ts'],
    environment: 'node',
    globals: false,
    reporters: ['default', 'junit'],
    outputFile: {
      junit: '.reports/junit.xml',
    },
    coverage: {
      provider: 'v8',
      include: ['server/**/*.ts'],
      exclude: [
        'server/**/*.d.ts',
        'server/entity/**',
        'server/types/**',
        'server/models/**',
      ],
      reporter: ['text', 'html', 'cobertura'],
      reportsDirectory: '.reports/coverage',
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
  resolve: {
    alias: {
      '@server': path.resolve(__dirname, 'server'),
    },
  },
});
