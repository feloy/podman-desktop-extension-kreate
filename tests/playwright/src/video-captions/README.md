# E2E video captions

This directory turns a Playwright e2e run into a paced, captioned recording.
It is designed to make the recorded video explain itself without adding video-
specific helpers around every UI action. Captioning and pacing are disabled for
normal e2e runs.

## Components

- `runtime.ts` configures caption pacing and exports the Playwright `test` API
  with support for marked video steps.
- `slow-typing.ts` transparently replaces `Locator.fill()` with sequential
  typing over a fixed duration.
- `reporter.ts` produces an ASS subtitle track and FFmetadata chapters.

## Enable the framework

Configure the reporter when a recording is requested:

```ts
if (process.env.VIDEO_SUBTITLES === 'true') {
  reporter.push([
    './src/video-captions/reporter.ts',
    {
      outputFile: './recordings/e2e.ass',
      chapterFile: './recordings/e2e.ffmetadata',
    },
  ]);
}
```

Install the runtime once from the shared Playwright fixture hook:

```ts
test.beforeEach(({ page }, testInfo) => {
  configureVideoCaptions(page, testInfo);
});
```

The recording script must export these variables for the test process:

| Variable                     | Purpose                                                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------------------------ |
| `VIDEO_SUBTITLES=true`       | Enables the reporter.                                                                                  |
| `CAPTION_PACE_MS`            | Pause after each emitted caption. Set to `0` for no pacing.                                            |
| `CAPTION_TYPING_DURATION_MS` | Total duration for each non-empty `.fill()` call. Set to `0` for normal fills.                         |
| `VIDEO_RECORDING_STARTED_AT` | Epoch milliseconds captured immediately before recording begins, used to align subtitles and chapters. |

## Write a captioned step

Mark a `test.step` with `{ params: { videoCaption: true } }` for one meaningful,
reviewer-facing business outcome. Put the UI actions that produce that outcome
and the checks that verify it in the same block. Do not use it for setup,
navigation, cleanup, or a single click.

Import the helpers from the caption framework:

```ts
import { expect, frameForCaption, test } from './video-captions/runtime';
```

Use this `test` export for marked steps so the runtime can scope action and
expectation captions to their callbacks.

The recommended form has one named, final expectation. Its message says what
is already visible on screen after the action succeeds:

```ts
await test.step(
  'Create the administrator user',
  async () => {
    await page.getByRole('button', { name: 'Create user' }).click();
    await page.getByRole('textbox', { name: 'User name' }).fill('admin');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'admin', exact: true }),
      'The newly created administrator user is listed',
    ).toBeVisible();
  },
  { params: { videoCaption: true } },
);
```

The example produces yellow captions for the button click and text entry, then
a green caption—“The newly created administrator user is listed”—once the final
assertion passes. Each caption remains visible for `CAPTION_PACE_MS`.

When the final assertion's target may be off-screen, call
`frameForCaption(locator)` immediately before it. During paced recordings this
centers the element and checks that it is in the viewport; normal runs are
unchanged. For a disappearance assertion, frame a nearby surviving element.

## Caption rules

| Code                                                                    | Caption                                 | Colour | Timing                      |
| ----------------------------------------------------------------------- | --------------------------------------- | ------ | --------------------------- |
| `.click()`, `.check()`, `.uncheck()`, or `.fill()` inside a marked step | The action and accessible control label | Yellow | After the interaction       |
| `expect(value, 'message')` inside a marked step                         | The custom expectation message          | Green  | After the assertion passes  |
| A marked step with no named expectation                                 | The step title                          | Green  | After the callback succeeds |
| Any action or expectation outside a marked step                         | None                                    | —      | No caption or added delay   |

For a named expectation to produce a caption, import `expect` from
`./video-captions/runtime`, not from the underlying Playwright fixture package.
Unnamed expectations are still normal checks, but do not create a caption.
Always await a named expectation so its caption finishes before the next action
or test starts. For synchronous matchers such as `toMatchObject`, use
`await Promise.resolve(expect(value, 'message').toMatchObject(expected))` because
Playwright types the matcher as returning `void` while the caption wrapper
returns a promise.

### More than one named expectation

Every named expectation inside a marked step produces its own green caption
and its own pacing delay, in the order in which the expectations pass. The
business-step fallback caption is not added when at least one named expectation
is present.

Use multiple named expectations only when each one verifies a distinct state a
reviewer should have time to inspect. Usually, keep intermediate checks
unnamed and give only the final, durable result a message. This keeps the video
concise and ensures the final caption describes the state that remains on
screen.

```ts
await test.step(
  'Create the administrator user',
  async () => {
    await page.getByRole('button', { name: 'Create user' }).click();
    await expect(dialog).toBeVisible(); // Check only: no caption.
    // …complete the dialog…
    await expect(userRow, 'The newly created administrator user is listed').toBeVisible();
  },
  { params: { videoCaption: true } },
);
```

## Chapters

The reporter creates one chapter for every executed test and uppercase,
Markdown-style chapter markers for each enclosing `test.describe` group. MP4
chapters are flat, so group markers are offset by one millisecond per nesting
level before the first child; this avoids FFmpeg collapsing same-timestamp
parent markers into zero-duration chapters.
