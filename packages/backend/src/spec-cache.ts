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

import type { KubeConfig } from '@kubernetes/client-node';
import { validate } from '@scalar/openapi-parser';
import type { OpenAPIV3 } from 'openapi-types';
import { NO_CONTEXT_EXCEPTION, NO_OPENAPI_EXCEPTION } from '/@shared/src/KreateApi';
import fetch from 'node-fetch';
import { z } from 'zod/v4';

export interface Index {
  paths: Record<string, IndexApi>;
}

export interface IndexApi {
  serverRelativeURL: string;
}

export class SpecCache {
  #index: Index | undefined;
  #gvSpecs: Map<string, OpenAPIV3.ReferenceObject | OpenAPIV3.SchemaObject> = new Map();

  constructor() {
    this.clear();
  }

  clear(): void {
    this.#index = undefined;
    this.#gvSpecs = new Map();
  }

  public async getIndex(kubeconfig: KubeConfig): Promise<Index> {
    if (this.#index) {
      return this.#index;
    }

    const indexParser = z.object({
      paths: z.record(
        z.string(),
        z.object({
          serverRelativeURL: z.string(),
        }),
      ),
    });

    const path = '/openapi/v3';
    const cluster = kubeconfig.getCurrentCluster();
    if (!cluster) {
      throw new Error(NO_CONTEXT_EXCEPTION);
    }
    const requestURL = new URL(cluster.server + path);
    const requestInit = await kubeconfig.applyToFetchOptions({});
    requestInit.method = 'GET';
    let response: fetch.Response;
    try {
      response = await fetch(requestURL.toString(), requestInit);
    } catch (err: unknown) {
      if (this.isConnectionRefusedException(err)) {
        throw new Error(NO_CONTEXT_EXCEPTION);
      } else {
        throw new Error(`fetch ${requestURL}: ${this.fetchErrorMessage(err)}`);
      }
    }
    if (!response.ok) {
      throw new Error(`fetch ${requestURL}: HTTP ${response.status} ${response.statusText}`);
    }
    const index = indexParser.parse(await response.json());
    if (!index) {
      throw new Error(NO_OPENAPI_EXCEPTION);
    }
    this.#index = index;
    return this.#index;
  }

  public async getGroupVersionSpec(
    kubeconfig: KubeConfig,
    apiVersion: string,
    kind: string,
  ): Promise<OpenAPIV3.ReferenceObject | OpenAPIV3.SchemaObject> {
    const mapKey = `${apiVersion}/${kind}`;
    const cached = this.#gvSpecs.get(mapKey);
    if (cached) {
      return cached;
    }

    const groupVersion = this.getGroupVersionFromApiVersion(apiVersion);
    const index = await this.getIndex(kubeconfig);
    const indexEntry = index.paths[groupVersion];
    if (!indexEntry) {
      throw new Error(`no index entry found for group version ${groupVersion}`);
    }
    const path = indexEntry.serverRelativeURL;
    const cluster = kubeconfig.getCurrentCluster();
    if (!cluster) {
      throw new Error(NO_CONTEXT_EXCEPTION);
    }
    const requestURL = new URL(cluster.server + path);
    const requestInit = await kubeconfig.applyToFetchOptions({});
    requestInit.method = 'GET';
    let response: fetch.Response;
    try {
      response = await fetch(requestURL.toString(), requestInit);
    } catch (err: unknown) {
      if (this.isConnectionRefusedException(err)) {
        throw new Error(NO_CONTEXT_EXCEPTION);
      } else {
        throw new Error(`fetch ${requestURL}: ${this.fetchErrorMessage(err)}`);
      }
    }
    if (!response.ok) {
      throw new Error(`fetch ${requestURL}: HTTP ${response.status} ${response.statusText}`);
    }
    const spec = await response.json();
    const result = await validate(spec);
    if (!result.valid || !isOpenAPIV3Document(result.schema)) {
      throw new Error(NO_OPENAPI_EXCEPTION);
    }
    const document = result.schema;
    if (!document.components?.schemas) {
      throw new Error(NO_OPENAPI_EXCEPTION);
    }
    const resource = this.getSchemedResource(document.components.schemas, apiVersion, kind);
    const value = document.components.schemas[resource];
    this.#gvSpecs.set(mapKey, value);
    return value;
  }

  protected getGroupVersionFromApiVersion(apiVersion: string): string {
    switch (apiVersion) {
      case 'v1':
        return 'api/v1';
      default:
        return `apis/${apiVersion}`;
    }
  }

  protected getSchemedResource(
    schemas: {
      [key: string]: OpenAPIV3.ReferenceObject | OpenAPIV3.SchemaObject;
    },
    apiVersion: string,
    kind: string,
  ): string {
    const [group, version] = this.getGroupAndVersion(apiVersion);
    for (const [k, v] of Object.entries(schemas)) {
      if (
        'x-kubernetes-group-version-kind' in v &&
        Array.isArray(v['x-kubernetes-group-version-kind']) &&
        v['x-kubernetes-group-version-kind'].length > 0
      ) {
        const gvk = v['x-kubernetes-group-version-kind'][0];
        if (this.isGroupVersionKind(gvk) && gvk.group === group && gvk.version === version && gvk.kind === kind) {
          return k;
        }
      }
    }
    throw new Error(`no resource found for apiVersion ${apiVersion} and kind ${kind}`);
  }

  protected getGroupAndVersion(apiVersion: string): string[] {
    if (apiVersion.includes('/')) {
      return apiVersion.split('/');
    }
    return ['', apiVersion];
  }

  protected isGroupVersionKind(v: unknown): v is { group: string; version: string; kind: string } {
    return !!v && typeof v === 'object' && 'group' in v && 'version' in v && 'kind' in v;
  }

  private isConnectionRefusedException(err: unknown): boolean {
    return err instanceof Error && 'code' in err && err.code === 'ECONNREFUSED';
  }

  private fetchErrorMessage(err: unknown): string {
    if (!(err instanceof Error)) return String(err);
    const cause = (err as Error & { cause?: unknown }).cause;
    if (!(cause instanceof Error)) return err.message;
    const codeStr = 'code' in cause ? ` code=${cause.code}` : '';
    return `${err.message} (cause: ${cause.message}${codeStr})`;
  }
}

function isOpenAPIV3Document(doc: unknown): doc is OpenAPIV3.Document {
  return typeof doc === 'object' && !!doc && 'openapi' in doc;
}
