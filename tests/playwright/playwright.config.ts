import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './src',
  timeout: 90_000,
  expect: { timeout: 30_000 },
  workers: 1,
  retries: 0,
  outputDir: './output/test-results',
  reporter: [
    ['list'],
    ['junit', { outputFile: './output/junit-results.xml' }],
    ['html', { open: 'never', outputFolder: './output/html-results' }],
  ],
  // The Podman Desktop runner starts and stops tracing itself.
  use: { screenshot: 'only-on-failure' },
});
