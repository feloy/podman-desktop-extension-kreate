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

import { KubeConfig, type KubernetesObject } from '@kubernetes/client-node';
import type { OpenAPIV3 } from 'openapi-types';
import { parseAllDocuments } from 'yaml';
import { SourceMap } from './yaml-mapper';
import * as podmanDesktopApi from '@podman-desktop/api';
import { NO_CONTEXT_EXCEPTION } from '/@shared/src/KreateApi';
import { SpecCache } from './spec-cache';
import { existsSync } from 'node:fs';

interface State {
  content: string;
  position: number;
}

export class SpecReader implements podmanDesktopApi.Disposable {
  #kubeconfigWatcher: podmanDesktopApi.FileSystemWatcher | undefined;
  #kubeconfig: KubeConfig | undefined;
  #currentServer: string | undefined;
  #gvSpecs: Map<string, OpenAPIV3.ReferenceObject | OpenAPIV3.SchemaObject>;
  #state: State;

  #cache: SpecCache;

  constructor() {
    this.#cache = new SpecCache();
    this.#state = { content: '', position: 0 };
    this.#gvSpecs = new Map();
  }

  init(): void {
    podmanDesktopApi.kubernetes.onDidUpdateKubeconfig(this.onKubeconfigUpdate.bind(this));
    // initial state is not sent by watcher, let's get it explicitely
    const kubeconfig = podmanDesktopApi.kubernetes.getKubeconfig();
    if (existsSync(kubeconfig.path)) {
      this.onKubeconfigUpdate({
        location: kubeconfig,
        type: 'CREATE',
      });
    }
  }

  public async getSpecFromYamlManifest(content: string): Promise<{
    kind: string;
    spec: OpenAPIV3.ReferenceObject | OpenAPIV3.SchemaObject;
  }> {
    if (!this.#kubeconfig) {
      throw new Error(NO_CONTEXT_EXCEPTION);
    }
    const manifests = parseAllDocuments(content, { customTags: this.getTags })
      .map(manifest => manifest.toJSON())
      .filter(manifest => !!manifest);
    if (manifests.length < 1) {
      throw new Error('no manifest found');
    }
    const manifest = manifests[0] as KubernetesObject;
    if (!manifest.apiVersion) {
      throw new Error('apiVersion not defined in the manifest');
    }
    if (!manifest.kind) {
      throw new Error('kind not defined in the manifest');
    }
    return {
      kind: manifest.kind,
      spec: await this.#cache.getGroupVersionSpec(this.#kubeconfig, manifest.apiVersion, manifest.kind),
    };
  }

  public async getPathAtPosition(content: string, position: number): Promise<string[]> {
    if (!content) {
      return [];
    }
    this.#state = { content, position };
    const map = new SourceMap();
    map.buildMap(content);
    const path = map.getAtPos(position);
    if (path) {
      return path.split('.').slice(1);
    }
    return [];
  }

  public async getState(): Promise<{ content: string; position: number }> {
    return this.#state;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected getTags(tags: any[]): any[] {
    for (const tag of tags) {
      if (tag.tag === 'tag:yaml.org,2002:int') {
        const newTag = { ...tag };
        newTag.test = /^(0[0-7][0-7][0-7])$/;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        newTag.resolve = (str: any): number => parseInt(str, 8);
        tags.unshift(newTag);
        break;
      }
    }
    return tags;
  }

  private onKubeconfigUpdate(event: podmanDesktopApi.KubeconfigUpdateEvent): void {
    if (event.type === 'DELETE') {
      this.#kubeconfig = undefined;
      this.#currentServer = undefined;
      this.#cache.clear();
      return;
    }
    const kubeConfig = new KubeConfig();
    kubeConfig.loadFromFile(event.location.path);
    const cluster = kubeConfig.getCurrentCluster();
    if (!cluster) {
      return;
    }
    if (cluster.server !== this.#currentServer) {
      this.#cache.clear();
    }
    this.#currentServer = cluster.server;
    this.#kubeconfig = kubeConfig;
  }

  dispose(): void {
    this.#kubeconfigWatcher?.dispose();
  }
}
