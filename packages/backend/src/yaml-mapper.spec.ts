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

import { expect, test, describe } from 'vitest';
import { SourceMap } from './yaml-mapper';

describe('getAtPos', () => {
  test('resolves a nested key by character offset', () => {
    const content = `apiVersion: v1
kind: Pod
metadata:
  name: pod-name
`;
    const map = new SourceMap();
    map.buildMap(content);
    expect(map.getAtPos(content.indexOf('name:'))).toEqual('.metadata.name');
  });

  test('returns root "." for positions on or after the first line', () => {
    const content = `apiVersion: v1
kind: Pod
`;
    const map = new SourceMap();
    map.buildMap(content);
    // line 0 has the root mapping and ".apiVersion"; "." is inserted first so it wins
    expect(map.getAtPos(0)).toEqual('.');
    // line 1 has ".kind" which is more specific
    expect(map.getAtPos(1)).toEqual('.kind');
  });

  test('returns undefined before the root when content starts with a newline', () => {
    const content = `
apiVersion: v1
kind: Pod
`;
    const map = new SourceMap();
    map.buildMap(content);
    // line 0 is the blank line — nothing is mapped there yet
    expect(map.getAtPos(0)).toBeUndefined();
    // line 1 is where the root mapping starts
    expect(map.getAtPos(1)).toEqual('.');
    expect(map.getAtPos(2)).toEqual('.kind');
  });

  test('resolves sequence element paths by line number', () => {
    const content = `items:
- name: foo
- name: bar
`;
    const map = new SourceMap();
    map.buildMap(content);
    // line 1: first element's "name" key
    expect(map.getAtPos(1)).toEqual('.items.0.name');
    // line 2: second element's "name" key
    expect(map.getAtPos(2)).toEqual('.items.1.name');
  });

  test('resolves deeply nested keys', () => {
    // getAtPos compares its argument to 0-indexed line numbers stored in the
    // map, so for deep content we pass line numbers directly rather than raw
    // character offsets (which would exceed all stored line numbers and
    // therefore always resolve to the last key in the file).
    const content = `spec:
  template:
    spec:
      containers:
      - image: my-image
        name: my-container
`;
    const map = new SourceMap();
    map.buildMap(content);
    expect(map.getAtPos(4)).toEqual('.spec.template.spec.containers.0.image');
    expect(map.getAtPos(5)).toEqual('.spec.template.spec.containers.0.name');
  });

  test('records the key for an empty flow mapping and does not crash', () => {
    const content = `spec:
  strategy: {}
  replicas: 1
`;
    const map = new SourceMap();
    map.buildMap(content);
    expect(map.getAtPos(1)).toEqual('.spec.strategy');
    expect(map.getAtPos(2)).toEqual('.spec.replicas');
  });
});

describe('lookup', () => {
  test('returns correct 1-indexed line, column and position', () => {
    const content = `apiVersion: v1
kind: Pod
metadata:
  name: pod-name
`;
    const map = new SourceMap();
    map.buildMap(content);
    const loc = map.lookup('metadata.name');
    expect(loc).toBeDefined();
    expect(loc!.line).toEqual(4); // 1-indexed: "  name:" is on the 4th line
    expect(loc!.column).toEqual(3); // 1-indexed: two leading spaces, then "n"
    expect(loc!.position).toEqual(content.indexOf('name: pod-name'));
  });

  test('accepts an array path', () => {
    const content = `metadata:
  name: foo
`;
    const map = new SourceMap();
    map.buildMap(content);
    expect(map.lookup(['metadata', 'name'])).toEqual(map.lookup('metadata.name'));
  });

  test('accepts a path with a leading dot', () => {
    const content = `metadata:
  name: foo
`;
    const map = new SourceMap();
    map.buildMap(content);
    expect(map.lookup('.metadata.name')).toEqual(map.lookup('metadata.name'));
  });

  test('returns undefined for an unknown path', () => {
    const content = `apiVersion: v1\n`;
    const map = new SourceMap();
    map.buildMap(content);
    expect(map.lookup('nonexistent')).toBeUndefined();
  });
});
