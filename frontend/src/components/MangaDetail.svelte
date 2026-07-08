<script lang="ts">
  import { onMount } from "svelte";
  import ChapterModal from "./ChapterModal.svelte";

  let { baseUrl, slug, onback, onchapter }: {
    baseUrl: string;
    slug: string;
    onback: () => void;
    onchapter: (ch: string) => void;
  } = $props();

  let meta: Record<string, any> | null = $state(null);
  let chapters: string[] = $state([]);
  let ready = $state(false);
  let showModal = $state(false);

  onMount(async () => {
    const [metaRes, chRes] = await Promise.all([
      fetch(`${baseUrl}/api/metadata?judul=${encodeURIComponent(slug)}`).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`${baseUrl}/api/komik/${encodeURIComponent(slug)}`).then(r => r.json()),
    ]);
    meta = metaRes;
    chapters = chRes;
    ready = true;
  });
</script>

{#if !ready}
  <p class="text-neutral-400">Loading...</p>
{:else}
  <div class="mb-4 flex items-center gap-3">
    <button
      class="px-4 py-2 text-sm rounded-lg border border-neutral-700 bg-neutral-800 text-neutral-200 hover:bg-neutral-700 transition"
      onclick={onback}
    >
      ← Kembali
    </button>
    <button
      class="px-4 py-2 text-sm rounded-lg border border-violet-700 bg-violet-900/30 text-violet-300 hover:bg-violet-800 transition"
      onclick={() => (showModal = true)}
    >
      Kelola Chapter
    </button>
  </div>

  <div class="flex gap-6 mb-8">
    <div class="shrink-0 w-[200px]">
      <img
        src="{baseUrl}/api/cover?judul={slug}"
        alt={meta?.title ?? slug}
        class="w-full rounded-lg"
      />
    </div>

    <div class="flex-1 min-w-0">
      <h2 class="text-xl font-bold mb-3">{meta?.alternativeName || meta?.title || slug}</h2>

      {#if meta}
        {@const fields = [
          ['Judul Asli', meta.alternativeName ? meta.title : null],
          ['Author', meta.author?.join(', ')],
          ['Artist', meta.artist?.join(', ')],
          ['Status', meta.status],
          ['Tipe', meta.type],
          ['Tema', meta.theme?.join(', ')],
          ['Rating', meta.rating],
          ['Cara Baca', meta.readingDirection],
          ['Pembaca', meta.totalViews],
        ].filter(([, v]) => v) as [string, string][]}

        {#each fields as [label, value]}
          <div class="flex gap-2 mb-1.5 text-sm">
            <span class="text-neutral-500 min-w-[100px] shrink-0">{label}:</span>
            <span class="text-neutral-200">{value}</span>
          </div>
        {/each}

        {#if meta.genre?.length}
          <div class="flex gap-2 mb-1.5 text-sm">
            <span class="text-neutral-500 min-w-[100px] shrink-0">Genre:</span>
            <span class="flex flex-wrap gap-1.5">
              {#each meta.genre as g}
                <span class="px-2.5 py-0.5 text-xs border border-neutral-700 rounded-xl bg-neutral-800 text-violet-400">
                  {g}
                </span>
              {/each}
            </span>
          </div>
        {/if}

        {#if meta.summary}
          <div class="mt-4 text-sm text-neutral-400 leading-relaxed max-h-32 overflow-y-auto">
            {meta.summary}
          </div>
        {/if}
      {/if}
    </div>
  </div>

  <div>
    <h3 class="text-sm text-neutral-500 mb-3">{chapters.length} Chapter</h3>
    <div class="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2">
      {#each chapters as ch}
        <button
          class="px-3 py-2 text-sm border border-neutral-700 rounded-md bg-neutral-800 text-neutral-200 hover:bg-violet-600 hover:border-violet-600 text-center transition"
          onclick={() => onchapter(ch)}
        >
          {ch}
        </button>
      {/each}
    </div>
  </div>

  <ChapterModal {baseUrl} {slug} title={meta?.title || slug} open={showModal} onclose={() => (showModal = false)} />
{/if}
