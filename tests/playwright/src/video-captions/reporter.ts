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

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import type { Reporter, TestCase, TestResult, TestStep } from '@playwright/test/reporter';

type SubtitleReporterOptions = {
  outputFile: string;
  chapterFile: string;
  /** Minimum amount of time a test title remains readable. */
  testTitleDurationMs?: number;
};

type Cue = {
  start: number;
  end: number;
  text: string;
  style: 'Assertion' | 'Caption' | 'Interaction';
};

type Chapter = {
  start: number;
  end: number;
  title: string;
  depth: number;
};

const DEFAULT_TEST_TITLE_DURATION_MS = 3_000;
const OUTCOME_STEP_PREFIX = '[video-caption] ';
const ACTION_STEP_PREFIX = '[video-action] ';
const GROUP_CHAPTER_SPACING_MS = 1;

/**
 * Creates an ASS subtitle track for an e2e screen recording.
 *
 * Marked test steps and explicit action/expectation steps become viewer-facing
 * captions. Each cue begins after the corresponding UI outcome is visible.
 */
export default class VideoSubtitlesReporter implements Reporter {
  private readonly outputFile: string;
  private readonly chapterFile: string;
  private readonly testTitleDurationMs: number;
  private readonly captionHoldDurationMs: number;
  private readonly cues: Cue[] = [];
  private readonly chapters: Chapter[] = [];
  private readonly groupChapters = new Map<string, Chapter>();
  private readonly testStarts = new Map<TestCase, number>();
  private recordingStartedAt = 0;

  constructor(options: SubtitleReporterOptions) {
    this.outputFile = resolve(options.outputFile);
    this.chapterFile = resolve(options.chapterFile);
    this.testTitleDurationMs = options.testTitleDurationMs ?? DEFAULT_TEST_TITLE_DURATION_MS;
    this.captionHoldDurationMs = Number(process.env.CAPTION_PACE_MS) || this.testTitleDurationMs;
  }

  onBegin(): void {
    // The shell records this immediately before starting ffmpeg. The fallback
    // keeps the reporter harmless when e2e tests are run without a video.
    this.recordingStartedAt = Number(process.env.VIDEO_RECORDING_STARTED_AT) || Date.now();
  }

  onTestBegin(test: TestCase, result: TestResult): void {
    this.testStarts.set(test, this.offset(result.startTime.valueOf()));
  }

  onStepEnd(test: TestCase, _result: TestResult, step: TestStep): void {
    const caption = this.captionForStep(step);
    if (!caption) {
      return;
    }

    // Recorded steps pause after their verified outcome. Begin captions at the
    // end of the step, while that outcome is already on screen.
    const start = this.offset(step.startTime.valueOf() + step.duration);
    const end = start + this.captionHoldDurationMs;
    this.addCue(start, end, test.title, 'Caption');
    this.addCue(start, end, caption.text, caption.style);
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const start = this.testStarts.get(test);
    this.testStarts.delete(test);
    if (start === undefined || result.status === 'skipped') {
      return;
    }

    const end = this.offset(result.startTime.valueOf() + result.duration);
    const chapterEnd = Math.max(start + 1, end);
    this.addGroupChapters(test, start, chapterEnd);
    this.chapters.push({ start, end: chapterEnd, title: test.title, depth: Number.MAX_SAFE_INTEGER });
  }

  onEnd(): void {
    mkdirSync(dirname(this.outputFile), { recursive: true });
    mkdirSync(dirname(this.chapterFile), { recursive: true });
    const sortedCues = [...this.cues];
    sortedCues.sort((left, right) => left.start - right.start);
    const events = sortedCues.map(
      cue =>
        `Dialogue: 0,${this.timestamp(cue.start)},${this.timestamp(cue.end)},${cue.style},,0,0,0,,${this.escape(cue.text)}`,
    );
    writeFileSync(this.outputFile, `${this.header()}${events.join('\n')}\n`);

    const sortedChapters = [...this.chapters];
    sortedChapters.sort(
      (left, right) => left.start - right.start || left.depth - right.depth || left.title.localeCompare(right.title),
    );
    const chapters = sortedChapters.map(
      chapter =>
        `[CHAPTER]\nTIMEBASE=1/1000\nSTART=${Math.round(chapter.start)}\nEND=${Math.round(chapter.end)}\ntitle=${this.escapeMetadata(chapter.title)}`,
    );
    writeFileSync(this.chapterFile, `;FFMETADATA1\n${chapters.join('\n')}\n`);
  }

  private addCue(start: number, end: number, text: string, style: Cue['style']): void {
    if (text.trim()) {
      this.cues.push({ start: Math.max(0, start), end: Math.max(0, end), text, style });
    }
  }

  private addGroupChapters(test: TestCase, start: number, end: number): void {
    const titles: string[] = [];
    for (let suite: TestCase['parent'] | undefined = test.parent; suite?.type === 'describe'; suite = suite.parent) {
      titles.unshift(suite.title);
    }

    for (let index = 0; index < titles.length; index++) {
      const key = titles.slice(0, index + 1).join('\u0000');
      const existing = this.groupChapters.get(key);
      if (existing) {
        existing.end = Math.max(existing.end, end);
        continue;
      }

      // MP4 chapters are flat and cannot overlap. Reserve one millisecond for
      // each parent immediately before the first test, so every group marker
      // survives muxing while remaining visually at the child's timestamp.
      const groupStart = Math.max(0, start - (titles.length - index) * GROUP_CHAPTER_SPACING_MS);
      const chapter = {
        start: groupStart,
        end,
        title: `${'#'.repeat(index + 1)} ${titles[index].toUpperCase()}`,
        depth: index,
      };
      this.groupChapters.set(key, chapter);
      this.chapters.push(chapter);
    }
  }

  private captionForStep(step: TestStep): Pick<Cue, 'text' | 'style'> | undefined {
    if (step.category !== 'test.step' || step.error) {
      return undefined;
    }
    if (step.title.startsWith(OUTCOME_STEP_PREFIX)) {
      return { text: step.title.slice(OUTCOME_STEP_PREFIX.length), style: 'Assertion' };
    }
    if (step.title.startsWith(ACTION_STEP_PREFIX)) {
      return { text: step.title.slice(ACTION_STEP_PREFIX.length), style: 'Interaction' };
    }
    if (step.params?.videoCaption === true && !this.hasNamedExpectationCaption(step)) {
      return { text: step.title, style: 'Assertion' };
    }
    return undefined;
  }

  private hasNamedExpectationCaption(step: TestStep): boolean {
    return step.steps.some(
      child =>
        (child.category === 'test.step' && child.title.startsWith(OUTCOME_STEP_PREFIX)) ||
        this.hasNamedExpectationCaption(child),
    );
  }

  private offset(time: number): number {
    return Math.max(0, time - this.recordingStartedAt);
  }

  private timestamp(milliseconds: number): string {
    const centiseconds = Math.round(milliseconds / 10);
    const hours = Math.floor(centiseconds / 360_000);
    const minutes = Math.floor((centiseconds % 360_000) / 6_000);
    const seconds = Math.floor((centiseconds % 6_000) / 100);
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centiseconds % 100).padStart(2, '0')}`;
  }

  private escape(text: string): string {
    return text.replaceAll('\\', '\\\\').replaceAll('{', '\\{').replaceAll('}', '\\}').replaceAll('\n', '\\N');
  }

  private escapeMetadata(text: string): string {
    return text
      .replaceAll('\\', '\\\\')
      .replaceAll('=', '\\=')
      .replaceAll(';', '\\;')
      .replaceAll('#', '\\#')
      .replaceAll('\n', ' ');
  }

  private header(): string {
    return `[Script Info]
ScriptType: v4.00+
PlayResX: 1280
PlayResY: 960
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding
Style: Caption,Arial,30,&H00FFFFFF,&H000000FF,&H00141414,&HAA101010,1,0,0,0,100,100,0,0,1,2,1,2,64,64,102,1
Style: Assertion,Arial,30,&H008CE679,&H000000FF,&H00141414,&HAA101010,1,0,0,0,100,100,0,0,1,2,1,2,64,64,48,1
Style: Interaction,Arial,30,&H00F6CF6C,&H000000FF,&H00141414,&HAA101010,1,0,0,0,100,100,0,0,1,2,1,2,64,64,48,1

[Events]
Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text
`;
  }
}
