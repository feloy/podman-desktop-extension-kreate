import { defineConfig } from '@playwright/test';
import type { ReporterDescription } from '@playwright/test';

const reporter: ReporterDescription[] = [
  ['list'],
  ['junit', { outputFile: './output/junit-results.xml' }],
  ['html', { open: 'never', outputFolder: './output/html-results' }],
];

if (process.env.VIDEO_SUBTITLES === 'true') {
  reporter.push([
    './src/video-captions/reporter.ts',
    {
      outputFile: './recordings/kreate-e2e.ass',
      chapterFile: './recordings/kreate-e2e.ffmetadata',
      testTitleDurationMs: 3_000,
    },
  ]);
}

export default defineConfig({
  testDir: './src',
  timeout: 90_000,
  expect: { timeout: 30_000 },
  workers: 1,
  retries: 0,
  outputDir: './output/test-results',
  reporter,
  // The Podman Desktop runner starts and stops tracing itself.
  use: { screenshot: 'only-on-failure' },
});
