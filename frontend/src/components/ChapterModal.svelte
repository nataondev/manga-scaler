<script lang="ts">
  import { api } from "../lib/api";
  import { jobStore } from "../lib/jobs.svelte";

  let { baseUrl, slug, title, open = false, onclose }: {
    baseUrl: string;
    slug: string;
    title: string;
    open: boolean;
    onclose: () => void;
  } = $props();

  interface RemoteChapter {
    label: string;
    url: string;
    chapter_num: string;
    downloaded: boolean;
  }

  interface CheckResult {
    url?: string;
    total: number;
    downloaded: number;
    newChapters?: { label: string; url: string }[];
    allChapters?: RemoteChapter[];
    error?: string;
  }

  let result = $state<CheckResult | null>(null);
  let loading = $state(false);
  let activeJobId = $state<string | null>(null);
  let mangaUrl = $state("");

  let currentJob = $derived(
    activeJobId ? jobStore.jobs.find((j) => j.id === activeJobId) : null,
  );

  let progressPct = $derived(
    (() => {
      const j = currentJob;
      if (!j || j.totalChapters === 0) return 0;
      const imgInCh = j.totalImagesInChapter > 0 ? j.currentImageIndex / j.totalImagesInChapter : 0;
      return Math.round(((j.currentChapterIndex + imgInCh) / j.totalChapters) * 100);
    })(),
  );

  $effect(() => {
    if (open && !result) load();
  });

  async function load() {
    loading = true;
    const res = await fetch(`${baseUrl}/api/comic/${encodeURIComponent(slug)}/meta`);
    const data = await res.json().catch(() => null);
    if (data?.url) {
      mangaUrl = data.url;
      result = await api.checkUpdate(data.url);
    } else {
      result = { total: 0, downloaded: 0, error: "URL tidak ditemukan" };
    }
    loading = false;
  }

  async function startScrape(chapterNum?: string) {
    if (!mangaUrl || activeJobId) return;
    const chaps = result?.allChapters ?? [];
    const idx = chapterNum ? chaps.findIndex((c) => c.chapter_num === chapterNum) : 0;
    const res = await api.startScrape(mangaUrl, idx >= 0 ? idx : 0, chapterNum ? 1 : 99999);
    activeJobId = res.jobId;
  }

  async function cancelJob() {
    if (!activeJobId) return;
    await api.cancelJob(activeJobId);
  }

  $effect(() => {
    if (!activeJobId) return;
    void currentJob;
    const j = currentJob;
    if (j && (j.status === "done" || j.status === "failed")) {
      activeJobId = null;
      if (mangaUrl) {
        api.checkUpdate(mangaUrl).then((r) => (result = r));
      }
    }
  });

  async function deleteChapter(chapterNum: string) {
    await fetch(
      `${baseUrl}/api/comic/${encodeURIComponent(slug)}/chapter?chapter=${encodeURIComponent(chapterNum)}`,
      { method: "DELETE" },
    );
    if (result?.allChapters) {
      const updated = result.allChapters.map((c) =>
        c.chapter_num === chapterNum ? { ...c, downloaded: false } : c,
      );
      result = { ...result, allChapters: updated, downloaded: result.downloaded - 1 };
    }
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions a11y_interactive_supports_focus -->
  <div class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onclick={onclose} role="dialog">
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions a11y_no_noninteractive_element_interactions -->
    <div class="bg-neutral-900 border border-neutral-700 rounded-xl w-full max-w-lg max-h-[80vh] flex flex-col" onclick={(e) => e.stopPropagation()}>
      <div class="flex items-center justify-between p-4 border-b border-neutral-700">
        <h3 class="font-semibold">{title}</h3>
        <button class="text-neutral-400 hover:text-white text-lg leading-none" onclick={onclose}>✕</button>
      </div>

      <div class="p-4 overflow-y-auto flex-1">
        {#if loading}
          <p class="text-neutral-500 text-sm text-center py-4">Loading...</p>
        {:else if result?.error}
          <p class="text-red-400 text-sm">{result.error}</p>
        {:else if result?.allChapters?.length}
          <div class="mb-3 flex items-center justify-between">
            <span class="text-sm text-neutral-400">{result.downloaded}/{result.total} terdownload</span>
            <button
              disabled={!!activeJobId}
              class="px-3 py-1 text-xs rounded bg-violet-600 text-white hover:bg-violet-500 transition disabled:opacity-40"
              onclick={() => startScrape()}
            >
              Download semua baru
            </button>
          </div>

          {#if activeJobId}
            <div class="mb-3 p-3 rounded-lg bg-neutral-800/80 border border-violet-800/50">
              <div class="flex items-center justify-between mb-1.5">
                <span class="text-xs text-violet-300">{currentJob?.message || "Scraping..."}</span>
                <button
                  class="px-2 py-0.5 text-xs rounded border border-red-800 text-red-400 hover:bg-red-900 transition"
                  onclick={cancelJob}
                >
                  Cancel
                </button>
              </div>
              <div class="w-full h-1.5 rounded-full bg-neutral-700 overflow-hidden">
                <div class="h-full bg-violet-500 transition-all duration-300" style="width: {progressPct}%"></div>
              </div>
            </div>
          {/if}

          <div class="space-y-1.5">
            {#each result.allChapters as ch}
              <div class="flex items-center justify-between py-2 px-3 rounded-lg bg-neutral-800/50 text-sm">
                <span class={ch.downloaded ? "text-green-400" : "text-neutral-400"}>
                  {ch.label}
                  {#if ch.downloaded}<span class="ml-1 text-xs">✓</span>{/if}
                </span>
                <div class="flex gap-2">
                  {#if !ch.downloaded}
                    <button
                      disabled={!!activeJobId}
                      class="px-2 py-0.5 text-xs rounded bg-violet-600 text-white hover:bg-violet-500 transition disabled:opacity-40"
                      onclick={() => startScrape(ch.chapter_num)}
                    >
                      Download
                    </button>
                  {/if}
                  {#if ch.downloaded}
                    <button
                      class="px-2 py-0.5 text-xs rounded border border-red-800 text-red-400 hover:bg-red-900 transition"
                      onclick={() => deleteChapter(ch.chapter_num)}
                    >
                      Hapus
                    </button>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        {:else}
          <p class="text-neutral-500 text-sm text-center py-4">Belum ada chapter.</p>
        {/if}
      </div>
    </div>
  </div>
{/if}
