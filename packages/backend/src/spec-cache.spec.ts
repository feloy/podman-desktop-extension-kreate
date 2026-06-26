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

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { SpecCache } from './spec-cache';
import type { Cluster, KubeConfig } from '@kubernetes/client-node';
import fetch from 'node-fetch';
import { NO_CONTEXT_EXCEPTION } from '/@shared/src/KreateApi';
import index from '../tests/openapi-dump/index.json';
import appsv1 from '../tests/openapi-dump/openapi/v3/apis/apps/v1.json';

vi.mock('node-fetch');

let cache: SpecCache;

vi.mock('@kubernetes/client-node');

const jsonMock = vi.fn();
const kubeconfig = {
  getCurrentCluster: vi.fn(),
  applyToFetchOptions: vi.fn(),
} as unknown as KubeConfig;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(fetch).mockResolvedValue({
    ok: true,
    json: jsonMock,
  } as unknown as fetch.Response);

  vi.mocked(kubeconfig.getCurrentCluster).mockReturnValue({
    server: 'http://localhost:4000',
  } as Cluster);
  vi.mocked(kubeconfig.applyToFetchOptions).mockResolvedValue({
    method: 'GET',
  });

  cache = new SpecCache();
});

describe('getIdnex', () => {
  beforeEach(() => {
    jsonMock.mockReturnValue({
      paths: {
        '/v1': { serverRelativeURL: '/v1' },
      },
    });
  });

  test('getIndex calls fetch the first time only', async () => {
    await cache.getIndex(kubeconfig);
    expect(fetch).toHaveBeenCalledOnce();
    vi.mocked(fetch).mockClear();
    await cache.getIndex(kubeconfig);
    expect(fetch).not.toHaveBeenCalled();
  });

  test('getIndex raises exception if no cluster', async () => {
    // eslint-disable-next-line no-null/no-null
    vi.mocked(kubeconfig.getCurrentCluster).mockReturnValue(null);
    await expect(() => cache.getIndex(kubeconfig)).rejects.toThrow(NO_CONTEXT_EXCEPTION);
  });

  test('getIndex raises exception if cluster is not accessible', async () => {
    const err: Error & { code?: string } = new Error('an error message');
    err.code = 'ECONNREFUSED';
    vi.mocked(fetch).mockClear().mockRejectedValue(err);
    await expect(() => cache.getIndex(kubeconfig)).rejects.toThrow(NO_CONTEXT_EXCEPTION);
  });
});

describe('getGroupVersionSpec', () => {
  beforeEach(() => {
    vi.spyOn(cache, 'getIndex').mockResolvedValue(index);
  });

  test('getGroupVersionSpec calls fetch the first time only', async () => {
    jsonMock.mockReturnValue(appsv1);
    await cache.getGroupVersionSpec(kubeconfig, 'apps/v1', 'Deployment');
    expect(fetch).toHaveBeenCalledOnce();
    vi.mocked(fetch).mockClear();
    await cache.getGroupVersionSpec(kubeconfig, 'apps/v1', 'Deployment');
    expect(fetch).not.toHaveBeenCalled();
  });

  test('getGroupVersionSpec raises exception if no cluster', async () => {
    // eslint-disable-next-line no-null/no-null
    vi.mocked(kubeconfig.getCurrentCluster).mockReturnValue(null);
    await expect(() => cache.getGroupVersionSpec(kubeconfig, 'v1', 'Pod')).rejects.toThrow(NO_CONTEXT_EXCEPTION);
  });

  test('getGroupVersionSpec raises exception if cluster is not accessible', async () => {
    const err: Error & { code?: string } = new Error('an error message');
    err.code = 'ECONNREFUSED';
    vi.mocked(fetch).mockClear().mockRejectedValue(err);
    await expect(() => cache.getGroupVersionSpec(kubeconfig, 'v1', 'Pod')).rejects.toThrow(NO_CONTEXT_EXCEPTION);
  });
});
