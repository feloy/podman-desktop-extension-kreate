/**********************************************************************
 * Copyright (C) 2026 Red Hat, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * SPDX-License-Identifier: Apache-2.0
 ***********************************************************************/

import { AsyncLocalStorage } from 'node:async_hooks';

import type { Locator, Page, TestInfo, TestStepInfo } from '@playwright/test';

import { expect as playwrightExpect, test as playwrightTest } from '@podman-desktop/tests-playwright';

import { enableSlowTyping } from './slow-typing';

const CAPTION_PACE_MS = Number(process.env.CAPTION_PACE_MS) || 0;
const CAPTION_TYPING_DURATION_MS = Number(process.env.CAPTION_TYPING_DURATION_MS) || 0;
const CAPTION_TIMEOUT_BUFFER_MS = 120_000;
const OUTCOME_STEP_PREFIX = '[video-caption] ';
const ACTION_STEP_PREFIX = '[video-action] ';

type LocatorPrototype = Pick<Locator, 'check' | 'click' | 'fill' | 'uncheck'>;
type VideoCaptionScope = { hasNamedExpectationCaption: boolean };

let automaticActionCaptionsInstalled = false;
const videoCaptionScope = new AsyncLocalStorage<VideoCaptionScope>();

/**
 * Keep Playwright's test API while recognizing steps explicitly marked for the
 * recording. The marked callback needs an async scope so actions and named
 * expectations can add their own captions and pacing.
 */
const captionedStep = new Proxy(playwrightTest.step, {
  apply(target, thisArgument, argumentsList: unknown[]): unknown {
    const [title, body, options] = argumentsList as Parameters<typeof playwrightTest.step>;
    if (options?.params?.videoCaption !== true) {
      return Reflect.apply(target, thisArgument, argumentsList);
    }
    return runVideoCaptionStep(title, body, options);
  },
});

export const test: typeof playwrightTest = new Proxy(playwrightTest, {
  get(target, property, receiver): unknown {
    return property === 'step' ? captionedStep : Reflect.get(target, property, receiver);
  },
});

async function runVideoCaptionStep<T>(
  title: string,
  body: (step: TestStepInfo) => T | Promise<T>,
  options: Parameters<typeof playwrightTest.step>[2],
): Promise<T> {
  const scope: VideoCaptionScope = { hasNamedExpectationCaption: false };
  const result = await playwrightTest.step(title, step => videoCaptionScope.run(scope, () => body(step)), options);
  if (!scope.hasNamedExpectationCaption) {
    await pauseForCaption();
  }
  return result;
}

/**
 * Playwright's `expect`, with an opt-in viewer-facing caption for a custom
 * expectation message inside a marked step. The assertion keeps Playwright's
 * native failure message and pauses only after it has succeeded.
 */
export const expect = new Proxy(playwrightExpect, {
  apply(target, thisArgument, argumentsList: unknown[]): unknown {
    const expectation = Reflect.apply(target, thisArgument, argumentsList);
    const [, message] = argumentsList;
    if (typeof message !== 'string' || !videoCaptionScope.getStore()) {
      return expectation;
    }
    return captionedExpectation(expectation as object, message);
  },
}) as typeof playwrightExpect;

/** Configures transparent caption pacing and fixed-duration typing for an e2e test. */
export function configureVideoCaptions(page: Page, testInfo: TestInfo): void {
  enableSlowTyping(page, CAPTION_TYPING_DURATION_MS, isInsideVideoCaptionStep);
  if (CAPTION_PACE_MS > 0) {
    enableAutomaticActionCaptions(page);
    testInfo.setTimeout(testInfo.timeout + CAPTION_TIMEOUT_BUFFER_MS);
  }
}

/** Center an outcome in the recording before its viewer-facing expectation. */
export async function frameForCaption(locator: Locator): Promise<void> {
  if (CAPTION_PACE_MS <= 0 || !isInsideVideoCaptionStep()) return;
  await locator.scrollIntoViewIfNeeded();
  await locator.evaluate(element =>
    element.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'nearest' }),
  );
  await playwrightExpect(locator).toBeInViewport();
}

/**
 * Captions common UI interactions without requiring annotations in each test.
 * This remains recording-only: normal e2e runs do not change their timing or
 * emit the extra Playwright steps.
 */
function enableAutomaticActionCaptions(page: Page): void {
  if (automaticActionCaptionsInstalled) {
    return;
  }

  const prototype = Object.getPrototypeOf(page.locator('body')) as LocatorPrototype;
  const originalClick = prototype.click;
  const originalCheck = prototype.check;
  const originalUncheck = prototype.uncheck;
  const originalFill = prototype.fill;

  prototype.click = async function (this: Locator, options): Promise<void> {
    if (!isInsideVideoCaptionStep()) {
      return originalClick.call(this, options);
    }
    await recordedAction(`Click ${await controlLabel(this)}`, () => originalClick.call(this, options));
  };
  prototype.check = async function (this: Locator, options): Promise<void> {
    if (!isInsideVideoCaptionStep()) {
      return originalCheck.call(this, options);
    }
    await recordedAction(`Select ${await controlLabel(this)}`, () => originalCheck.call(this, options));
  };
  prototype.uncheck = async function (this: Locator, options): Promise<void> {
    if (!isInsideVideoCaptionStep()) {
      return originalUncheck.call(this, options);
    }
    await recordedAction(`Clear ${await controlLabel(this)}`, () => originalUncheck.call(this, options));
  };
  prototype.fill = async function (this: Locator, value: string, options): Promise<void> {
    if (!isInsideVideoCaptionStep()) {
      return originalFill.call(this, value, options);
    }
    await recordedAction(`Enter text in ${await controlLabel(this)}`, () => originalFill.call(this, value, options));
  };
  automaticActionCaptionsInstalled = true;
}

function isInsideVideoCaptionStep(): boolean {
  return videoCaptionScope.getStore() !== undefined;
}

function captionedExpectation(expectation: object, message: string): object {
  return new Proxy(expectation, {
    get(target, property, receiver): unknown {
      const value = Reflect.get(target, property, receiver);
      if (typeof value === 'function') {
        return (...argumentsList: unknown[]): Promise<unknown> =>
          captionedMatcher(target, value as (...parameters: unknown[]) => unknown, argumentsList, message);
      }
      return typeof value === 'object' && value ? captionedExpectation(value, message) : value;
    },
  });
}

async function captionedMatcher(
  target: object,
  matcher: (...argumentsList: unknown[]) => unknown,
  argumentsList: unknown[],
  message: string,
): Promise<unknown> {
  const scope = videoCaptionScope.getStore();
  if (scope) {
    scope.hasNamedExpectationCaption = true;
  }
  const result = await playwrightTest.step(`${OUTCOME_STEP_PREFIX}${message}`, () =>
    matcher.apply(target, argumentsList),
  );
  await pauseForCaption();
  return result;
}

async function recordedAction<T>(caption: string, action: () => Promise<T>): Promise<T> {
  const result = await playwrightTest.step(`${ACTION_STEP_PREFIX}${caption}`, action);
  await pauseForCaption();
  return result;
}

async function controlLabel(locator: Locator): Promise<string> {
  try {
    const label = await locator.evaluate(element => {
      const labelledBy = element.getAttribute('aria-labelledby');
      const labelledByText = labelledBy
        ?.split(/\s+/)
        .map(id => document.getElementById(id)?.textContent)
        .filter(Boolean)
        .join(' ');
      const associatedLabel =
        element.closest('label') ?? (element.id ? document.querySelector(`label[for="${element.id}"]`) : undefined);
      // Dropdown options live inside a label, whose full text includes every option.
      const labelText = Array.from(associatedLabel?.childNodes ?? [])
        .filter(node => node.nodeType === Node.TEXT_NODE)
        .map(node => node.textContent)
        .join(' ');
      const isButton = element.matches('button, [role="button"]');
      return [
        element.getAttribute('aria-label'),
        labelledByText,
        element.getAttribute('title'),
        element.id && associatedLabel?.getAttribute('for') === element.id ? labelText : undefined,
        isButton ? element.textContent : undefined,
        labelText,
        isButton ? undefined : associatedLabel?.textContent,
        element.getAttribute('placeholder'),
        element.getAttribute('name'),
        element.textContent,
      ].find(value => value?.trim());
    });
    const normalized = label?.replaceAll(/\s+/g, ' ').trim();
    if (normalized) {
      return normalized.slice(0, 80);
    }
  } catch {
    // A locator can disappear immediately after an action; use a safe fallback.
  }
  return 'control';
}

async function pauseForCaption(): Promise<void> {
  if (CAPTION_PACE_MS > 0) {
    await new Promise(resolve => setTimeout(resolve, CAPTION_PACE_MS));
  }
}
