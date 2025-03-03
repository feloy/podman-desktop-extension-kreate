<script lang="ts">
import type { SimplifiedSpec } from "/@shared/src/models/SimplifiedSpec";

export let spec: SimplifiedSpec;
</script>

<div>{spec.name} {#if spec.type}({spec.type}){/if}</div>
<div>{spec.description}</div>
<ul class="ml-4">
  {#each spec.children as child}
    <li class="pt-2"><svelte:self spec={child} /></li>
  {/each}
</ul>