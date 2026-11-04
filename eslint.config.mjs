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

import podmanDesktop from '@podman-desktop/eslint-config';
import globals from 'globals';
import js from '@eslint/js';
import typescriptLint from 'typescript-eslint';
import importPlugin from 'eslint-plugin-import';
import { fixupConfigRules, fixupPluginRules } from '@eslint/compat';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { FlatCompat } from '@eslint/eslintrc';
import noNull from 'eslint-plugin-no-null';
import sonarjs from 'eslint-plugin-sonarjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

const TYPESCRIPT_PROJECTS = ['packages/*/tsconfig.json'];

export default [
  ...podmanDesktop,
  {
    ignores: [
      '*.config.*js',
      '**/*.config.*js',
      '**/build/**/*',
      '**/dist/**/*',
      '**/__mocks__/',
      '**/coverage/',
      'packages/backend/media/**',
      'tests/**',
    ],
  },
  js.configs.recommended,
  ...typescriptLint.configs.recommended,
  sonarjs.configs.recommended,
  ...fixupConfigRules(compat.extends('plugin:import/recommended', 'plugin:import/typescript')),
  {
    plugins: {
      // non-compliant v10 plug-ins
      import: fixupPluginRules(importPlugin),
      'no-null': fixupPluginRules(noNull),
    },
    settings: {
      'import/resolver': {
        typescript: true,
        node: true,

        'eslint-import-resolver-custom-alias': {
          alias: {
            '/@': './src',
            '/@gen': './src-generated',
          },

          extensions: ['.ts'],
          packages: ['packages/*'],
        },
      },
    },
  },
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
      sourceType: 'module',
      parserOptions: {
        warnOnUnsupportedTypeScriptVersion: false,
        projectService: {
          allowDefaultProject: ['types/*.d.ts']
        },
        tsconfigRootDir: __dirname,
      },
    },
  },
  {
    rules: {
      eqeqeq: 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-var-requires': 'off',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      'prefer-promise-reject-errors': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/prefer-optional-chain': 'error',
      '@typescript-eslint/prefer-nullish-coalescing': 'error',
      'no-null/no-null': 'error',

      /**
       * Having a semicolon helps the optimizer interpret your code correctly.
       * This avoids rare errors in optimized code.
       * @see https://twitter.com/alex_kozack/status/1364210394328408066
       */
      semi: ['error', 'always'],
      /**
       * This will make the history of changes in the hit a little cleaner
       */
      'comma-dangle': ['warn', 'always-multiline'],
      /**
       * Just for beauty
       */
      quotes: ['error', 'single', { allowTemplateLiterals: true }],

      // disabled import/namespace rule as the plug-in is not fully compatible using the compat mode
      'import/namespace': 'off',
      'import/no-duplicates': 'error',
      'import/no-unresolved': 'off',
      'import/default': 'off',
      'import/no-named-as-default-member': 'off',
      'import/no-named-as-default': 'off',
      'import/no-extraneous-dependencies': 'error',

      'sonarjs/cognitive-complexity': 'off',
      'sonarjs/no-duplicate-string': 'off',
      'sonarjs/no-empty-collection': 'off',
      'sonarjs/no-small-switch': 'off',
      'sonarjs/no-commented-code': 'error',
    },
  },
  {
    files: ['packages/frontend/**'],
    languageOptions: {
      globals: {
        ...Object.fromEntries(Object.entries(globals.node).map(([key]) => [key, 'off'])),
        ...globals.browser,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      'no-undef': 'off',
    },
  },
];
