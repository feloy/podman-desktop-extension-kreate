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

import type { Locator, Page } from '@playwright/test';

type LocatorPrototype = {
  fill: Locator['fill'];
};

let installed = false;

/**
 * Replaces Locator.fill with sequential typing over a fixed duration for the
 * current e2e worker.
 * This is installed from a fixture hook, so test authors continue using the
 * regular Locator.fill API.
 */
export function enableSlowTyping(page: Page, duration: number, shouldTypeSlowly: () => boolean): void {
  if (installed || duration <= 0) {
    return;
  }

  const prototype = Object.getPrototypeOf(page.locator('body')) as LocatorPrototype;
  const originalFill = prototype.fill;
  prototype.fill = async function (this: Locator, value: string, options): Promise<void> {
    if (value.length === 0 || !shouldTypeSlowly()) {
      await originalFill.call(this, value, options);
      return;
    }

    await originalFill.call(this, '', options);
    await this.pressSequentially(value, { delay: duration / value.length });
  };
  installed = true;
}
