<script lang="ts">
  import { onMount } from "svelte";
  import { jobStore } from "./lib/jobs.svelte";
  import Reader from "./views/Reader.svelte";
  import Jobs from "./views/Jobs.svelte";

  const baseUrl = window.location.origin;
  let activeTab = $state("reader");

  onMount(() => {
    jobStore.load(baseUrl);
    jobStore.connect(baseUrl);
  });

  const tabs = [
    { id: "reader", label: "Reader" },
    { id: "jobs", label: "Job" },
  ] as const;
</script>

<div class="max-w-7xl mx-auto px-4 py-4">
  <nav class="flex gap-2 mb-6">
    {#each tabs as tab}
      <button
        class="px-4 py-2 rounded-lg text-sm font-medium transition
          {activeTab === tab.id
            ? 'bg-violet-600 text-white'
            : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'}"
        onclick={() => (activeTab = tab.id)}
      >
        {tab.label}
      </button>
    {/each}
  </nav>

  {#if activeTab === "reader"}
    <Reader {baseUrl} />
  {:else if activeTab === "jobs"}
    <Jobs {baseUrl} />
  {/if}
</div>
