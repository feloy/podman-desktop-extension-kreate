/**********************************************************************
 * Copyright (C) 2025 Red Hat, Inc.
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

import '@testing-library/jest-dom/vitest';
import { expect, test, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import MultipleFileOption from './MultipleFileOption.svelte';

vi.mock('/@/api/client', () => ({
  openDialog: vi.fn(),
}));

test('single value typed in the input is sent back to caller', async () => {
  const onChangeMock = vi.fn();
  render(MultipleFileOption, {
    props: {
      option: {
        flag: 'aflag',
        label: 'a label',
        description: 'a description',
        type: 'string',
        multiple: true,
      },
      selectors: ['openFile'],
      onChange: onChangeMock,
    },
  });

  const user = userEvent.setup();

  await vi.waitFor(async () => {
    const input = screen.getByRole('textbox');
    user.type(input, 'a-value');
  });
  await vi.waitFor(async () => {
    expect(onChangeMock).toHaveBeenCalledWith(['aflag', 'a-value']);
  });
});

test('multiple values typed in the input are sent back to caller', async () => {
  const onChangeMock = vi.fn();
  render(MultipleFileOption, {
    props: {
      option: {
        flag: 'aflag',
        label: 'a label',
        description: 'a description',
        type: 'string',
        multiple: true,
      },
      selectors: ['openFile'],
      onChange: onChangeMock,
    },
  });

  await vi.waitFor(async () => {
    const addBtn = screen.getByRole('button', { name: 'add-btn' });
    await fireEvent.click(addBtn);
  });

  const user = userEvent.setup();

  await vi.waitFor(async () => {
    const inputs = screen.getAllByRole('textbox');
    expect(inputs).toHaveLength(2);
    await user.type(inputs[0], 'value1');
    await user.type(inputs[1], 'value2');
  });
  await vi.waitFor(async () => {
    expect(onChangeMock).toHaveBeenCalledWith(['aflag', 'value1', 'value2']);
  });
});
