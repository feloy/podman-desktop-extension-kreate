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

// Copyright 2022 Tomi Chen
//
// Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
// from https://github.com/tctree333/js-yaml-source-map
import { parseEvents, EVENT_DOCUMENT, EVENT_MAPPING, EVENT_SEQUENCE, EVENT_SCALAR, EVENT_POP } from 'js-yaml';
import type { MappingEvent, ScalarEvent } from 'js-yaml';

// maps path in object to position information
interface Path {
  line: number;
  position: number;
  lineStart: number;
}

interface SourceLocation {
  line: number;
  column: number;
  position: number;
}

interface StackEntry {
  type: 'doc' | 'mapping' | 'sequence';
  path: string;
  isKey: boolean;
  index: number;
}

export class SourceMap {
  private _map: Map<string, Path>;

  constructor() {
    this._map = new Map();
  }

  public get map(): Map<string, Path> {
    return this._map;
  }

  public buildMap(content: string): void {
    this._map.clear();
    // parseEvents emits a flat stream of events describing the YAML structure.
    // We walk it with an explicit stack to track our depth and current path,
    // recording each key's line number in the map so getAtPos() can later find
    // the deepest path that started at or before a given line.
    //
    // The event types we care about:
    //   EVENT_DOCUMENT – wraps the whole document; just pushed as a sentinel.
    //   EVENT_MAPPING  – start of a mapping (object); its `start` is the char
    //                    offset of the first key. For the root mapping we store
    //                    '.' here so there is always a root entry.
    //   EVENT_SEQUENCE – start of a sequence (array); we track a running index
    //                    so elements are addressed as path.0, path.1, …
    //   EVENT_SCALAR   – a scalar value. Inside a mapping, scalars alternate
    //                    between keys and values; we record the path only for
    //                    keys, using `isKey` to tell them apart.
    //   EVENT_POP      – closes the innermost open collection or document.

    // Build a char-offset → line-number lookup table so we can convert the
    // character offsets returned by parseEvents into 0-indexed line numbers.
    const lineStarts: number[] = [0];
    for (let i = 0; i < content.length; i++) {
      if (content[i] === '\n') lineStarts.push(i + 1);
    }
    const lineOf = (offset: number): number => {
      let lo = 0,
        hi = lineStarts.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (lineStarts[mid] <= offset) lo = mid;
        else hi = mid - 1;
      }
      return lo;
    };

    const events = parseEvents(content, {});
    const stack: StackEntry[] = [];
    // pendingKeyPath holds the map path of the most recently seen mapping key,
    // so that when the following value turns out to be a nested collection
    // (EVENT_MAPPING / EVENT_SEQUENCE) we know which path to assign it.
    let pendingKeyPath = '';
    let rootSet = false;

    for (const event of events) {
      const type = event.type;

      if (type === EVENT_DOCUMENT) {
        stack.push({ type: 'doc', path: '', isKey: false, index: 0 });
      } else if (type === EVENT_MAPPING) {
        const { start } = event as MappingEvent;
        const line = lineOf(start);
        const lineStart = lineStarts[line];

        if (!rootSet) {
          // The very first mapping is the root; store it under '.' so that
          // getAtPos() always has a root entry to fall back to.
          this._map.set('.', { line, position: start, lineStart });
          rootSet = true;
          stack.push({ type: 'mapping', path: '.', isKey: true, index: 0 });
        } else {
          const parent = stack[stack.length - 1];
          if (parent.type === 'mapping') {
            // The mapping is the value of the key we just recorded; the path
            // was already written to the map when we saw that key scalar.
            // Mark the parent as expecting a key again (after this nested
            // mapping is closed by EVENT_POP).
            parent.isKey = true;
            stack.push({ type: 'mapping', path: pendingKeyPath, isKey: true, index: 0 });
          } else if (parent.type === 'sequence') {
            // Each mapping element of a sequence gets a numeric path segment.
            const elemPath = `${parent.path}.${parent.index}`;
            parent.index++;
            stack.push({ type: 'mapping', path: elemPath, isKey: true, index: 0 });
          }
        }
      } else if (type === EVENT_SEQUENCE) {
        // Sequences don't contribute a map entry themselves; their elements
        // are addressed by the numeric index tracked in the stack entry.
        const parent = stack[stack.length - 1];
        if (parent.type === 'mapping') {
          parent.isKey = true;
          stack.push({ type: 'sequence', path: pendingKeyPath, isKey: false, index: 0 });
        } else if (parent.type === 'sequence') {
          // Nested sequence: each element gets its own numeric path segment.
          const elemPath = `${parent.path}.${parent.index}`;
          parent.index++;
          stack.push({ type: 'sequence', path: elemPath, isKey: false, index: 0 });
        }
      } else if (type === EVENT_SCALAR) {
        const { valueStart, valueEnd } = event as ScalarEvent;
        const value = content.slice(valueStart, valueEnd);
        const line = lineOf(valueStart);
        const lineStart = lineStarts[line];

        const parent = stack[stack.length - 1];
        if (parent.type === 'mapping') {
          if (parent.isKey) {
            // Key scalar: record its path and line so getAtPos() can find it,
            // then remember the path in case the next event is a nested
            // collection (EVENT_MAPPING / EVENT_SEQUENCE).
            const keyPath = parent.path === '.' ? `.${value}` : `${parent.path}.${value}`;
            this._map.set(keyPath, { line, position: valueStart, lineStart });
            pendingKeyPath = keyPath;
            parent.isKey = false;
          } else {
            // Value scalar: nothing to record; just toggle back to key mode.
            parent.isKey = true;
          }
        } else if (parent.type === 'sequence') {
          const elemPath = `${parent.path}.${parent.index}`;
          this._map.set(elemPath, { line, position: valueStart, lineStart });
          parent.index++;
        }
      } else if (type === EVENT_POP) {
        // EVENT_POP closes the innermost open collection or document.
        if (stack.length > 0 && stack[stack.length - 1].type !== 'doc') {
          stack.pop();
          // If we just closed a nested collection that was the value of a
          // mapping key, the parent mapping is now ready for its next key.
          const newTop = stack[stack.length - 1];
          if (newTop?.type === 'mapping' && !newTop.isKey) {
            newTop.isKey = true;
          }
        } else if (stack.length > 0) {
          stack.pop();
        }
      }
    }
  }

  public lookup(path: string | string[]): SourceLocation | undefined {
    let pathName = path instanceof Array ? path.map(f => `${f}`).join('.') : `${path}`;
    if (!pathName.startsWith('.')) {
      // add leading dot if not present
      pathName = '.' + pathName;
    }
    if (pathName.startsWith('..')) {
      // fix double leading dots if present
      pathName = pathName.slice(1);
    }
    // convert bracket notation to dot notation
    pathName = pathName.replace(/\[/g, '.').replace(/\]/g, '');

    const pathInfo = this._map.get(pathName);
    if (!pathInfo) {
      return;
    }

    return {
      line: pathInfo.line + 1,
      column: pathInfo.position - pathInfo.lineStart + 1,
      position: pathInfo.position,
    };
  }

  public getAtPos(searchedPosition: number): string | undefined {
    const sortedMap = Array.from(this._map.entries())
      .map(([path, positions]) => {
        return { path: path, line: positions.line };
      })
      .sort((a, b) => {
        return a.line > b.line ? -1 : 1;
      });
    return sortedMap.find(({ line }) => line <= searchedPosition)?.path;
  }
}
