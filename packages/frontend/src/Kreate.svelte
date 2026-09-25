<script lang="ts">
import { kreateApiClient } from './api/client';
import { Button, NavPage } from '@podman-desktop/ui-svelte';
import YamlEditor from './components/YamlEditor.svelte';
import SpecSimple from './components/spec/SpecSimple.svelte';
import type { SimplifiedSpec } from '/@shared/src/models/SimplifiedSpec';
import { onDestroy, onMount, tick } from 'svelte';
import { router } from 'tinro';
import { yamlContent } from './stores/yamlContent';
import type { Unsubscriber } from 'svelte/store';
import { NO_CONTEXT_EXCEPTION } from '/@shared/src/KreateApi';

let yamlEditor: YamlEditor;

let yamlResult = $state<string>('');
let spec = $state<SimplifiedSpec>();
let specError = $state<string>();
let pathInSpec = $state<string[]>([]);

let cursorLine = $state<number>(0);
let cursorLineIsEmpty = $state<boolean>(false);
let emptyLineIndentation = $state<number>(0);

function isNumeric(value: string) {
  return /^\d+$/.test(value);
}

async function scrollTo(to: string | undefined): Promise<void> {
  if (to === undefined) {
    return;
  }
  await tick();
  document.getElementById(to)?.scrollIntoView();
}

async function updateSpec(
  yamlResult: string,
  cursorLine: number,
  cursorLineIsEmpty: boolean,
  emptyLineIndentation: number,
) {
  try {
    specError = undefined;
    let path = await kreateApiClient.getPathAtPosition(yamlResult, cursorLine);
    if (cursorLineIsEmpty) {
      path = path.filter(p => !isNumeric(p)).slice(0, emptyLineIndentation);
    }
    if (path.length === 1 && path[0] === '') {
      path = [];
    }
    pathInSpec = path;
    spec = await kreateApiClient.getSpecFromYamlManifest(yamlResult, pathInSpec.slice(0, -1));
    scrollTo(pathInSpec[pathInSpec.length - 1]);
  } catch (err: unknown) {
    if (err === NO_CONTEXT_EXCEPTION) {
      specError = 'There is no current context. Help cannot be displayed';
    } else {
      console.error(err);
    }
  }
}

function onCursorUpdated(
  updatedCursorLine: number,
  updatedCursorLineIsEmpty: boolean,
  updatedEmptyLineIndentation: number,
) {
  cursorLine = updatedCursorLine;
  cursorLineIsEmpty = updatedCursorLineIsEmpty;
  emptyLineIndentation = updatedEmptyLineIndentation;
}

$effect(() => {
  updateSpec(yamlResult, cursorLine, cursorLineIsEmpty, emptyLineIndentation);
});

let createdYaml = $state<string>('');
let createError = $state<string>('');
let createInfo = $state<string>('');

async function create() {
  createInfo = '';
  createError = '';
  try {
    await kreateApiClient.create(yamlResult);
    createdYaml = yamlResult;
    createInfo = 'The resource has been successfully applied to the cluster';
  } catch (err: unknown) {
    createError = String(err);
  } finally {
    createdYaml = yamlResult;
  }
}

function useTemplate(): void {
  router.goto('/template');
}

let yamlContentUnsubscribe: Unsubscriber;

onMount(async () => {
  const state = await kreateApiClient.getState();
  yamlResult = state.content;

  yamlContentUnsubscribe = yamlContent.subscribe((newContent: string) => {
    if (newContent) {
      yamlResult = newContent;
    }
  });
});

onDestroy(() => {
  yamlContentUnsubscribe?.();
});
</script>

<NavPage title="Create Kubernetes resources" searchEnabled={false}>
  {#snippet additionalActions()}
    <div>
      <Button on:click={useTemplate}>Use template</Button>
    </div>
  {/snippet}
  {#snippet content()}
    <div class="flex space-x-2 min-w-full h-full p-1 overflow-y-hidden">
      <div class="basis-1/2">
        <YamlEditor bind:this={yamlEditor} bind:value={yamlResult} onCursorUpdated={onCursorUpdated} />
      </div>
      <div class="flex flex-col basis-1/2 space-y-2">
        <div
          role="region"
          aria-label="Resource specification"
          class="p-2 w-full h-full overflow-y-auto overflow-x-hidden bg-[var(--pd-invert-content-bg)]">
          {#if spec}
            <SpecSimple spec={spec} complete={pathInSpec.length < 2} highlight={pathInSpec[pathInSpec.length - 1]} />
          {:else if specError}
            <div class="text-red-600">{specError}</div>
          {:else}
            &nbsp;
          {/if}
        </div>
        {#if createError}
          <div class="text-red-600">{createError}</div>
        {/if}
        {#if createInfo}
          <div>{createInfo}</div>
        {/if}
        <Button on:click={create} disabled={!yamlResult || yamlResult === createdYaml}>Apply to cluster</Button>
      </div>
    </div>
  {/snippet}
</NavPage>
