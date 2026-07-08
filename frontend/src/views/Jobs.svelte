<script lang="ts">
  import { api } from "../lib/api";
  import { jobStore } from "../lib/jobs.svelte";

  let { baseUrl }: { baseUrl: string } = $props();
  let scrapUrl = $state("");
  let submitting = $state(false);

  async function startScrape() {
    if (!scrapUrl || submitting) return;
    submitting = true;
    try {
      await api.startScrape(scrapUrl);
      scrapUrl = "";
    } finally {
      submitting = false;
    }
  }

  async function cancelJob(jobId: string) {
    await api.cancelJob(jobId);
  }

  function statusColor(s: string) {
    if (s === "running") return "text-blue-400";
    if (s === "done") return "text-green-400";
    if (s === "failed") return "text-red-400";
    return "text-neutral-500";
  }

  function progressPercent(j: typeof jobStore.jobs[0]) {
    if (!j || j.totalChapters === 0) return 0;
    const chDone = j.currentChapterIndex;
    const imgInCh = j.totalImagesInChapter > 0 ? j.currentImageIndex / j.totalImagesInChapter : 0;
    return ((chDone + imgInCh) / j.totalChapters) * 100;
  }
</script>

<div>
  <!-- Scrap form -->
  <div class="mb-6 flex gap-2">
    <input
      type="text"
      bind:value={scrapUrl}
      placeholder="Paste URL komik..."
      class="flex-1 px-4 py-2.5 text-sm rounded-lg border border-neutral-700 bg-neutral-800 text-neutral-200 placeholder-neutral-500 outline-none focus:border-violet-500 transition"
      onkeydown={(e) => { if (e.key === "Enter") startScrape(); }}
    />
    <button
      disabled={!scrapUrl || submitting}
      class="px-5 py-2.5 text-sm font-medium rounded-lg bg-violet-600 text-white hover:bg-violet-500 transition disabled:opacity-40 disabled:cursor-not-allowed"
      onclick={startScrape}
    >
      {submitting ? "..." : "Scrape"}
    </button>
  </div>

  <!-- Job list -->
  {#if jobStore.jobs.length === 0}
    <p class="text-neutral-500 text-center py-8">Belum ada job.</p>
  {:else}
    <div class="space-y-3">
      {#each jobStore.jobs as job (job.id)}
        <div class="rounded-lg bg-neutral-800 border border-neutral-700 p-4">
          <div class="flex items-center justify-between mb-2">
            <div>
              <span class="font-medium">{job.title || job.url}</span>
              <span class="ml-2 text-xs text-neutral-500">[{job.source}]</span>
            </div>
            <span class="text-xs font-medium {statusColor(job.status)}">
              {job.status.toUpperCase()}
            </span>
          </div>

          {#if job.status === "running" || job.status === "done"}
            <div class="w-full h-1.5 rounded-full bg-neutral-700 overflow-hidden mb-2">
              <div
                class="h-full bg-violet-500 transition-all duration-300"
                style="width: {progressPercent(job).toFixed(1)}%"
              ></div>
            </div>
          {/if}

          <div class="text-xs text-neutral-400">
            {#if job.status === "running"}
              Ch {job.currentChapterIndex + 1}/{job.totalChapters} · {job.message}
            {:else if job.status === "done"}
              {job.okImages} gambar selesai
            {:else if job.status === "failed"}
              {job.error}
            {/if}
          </div>

          {#if job.status === "running"}
            <button
              class="mt-2 text-xs text-red-400 hover:text-red-300 transition"
              onclick={() => cancelJob(job.id)}
            >
              Cancel
            </button>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>
