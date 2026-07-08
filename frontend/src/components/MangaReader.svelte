<script lang="ts">
  import { onMount } from "svelte";

  let { baseUrl, slug, chapter: initialChapter, onbacklist, onbackdetail }: {
    baseUrl: string;
    slug: string;
    chapter: string;
    onbacklist: () => void;
    onbackdetail: () => void;
  } = $props();

  let chapters: string[] = $state([]);
  let images: string[] = $state([]);
  let pageCount = $state(0);
  let selectedChapter = $state("");

  onMount(() => {
    selectedChapter = initialChapter;
    loadData(slug, initialChapter);
  });

  async function loadData(judul: string, ch: string) {
    const [chRes, imgRes] = await Promise.all([
      fetch(`${baseUrl}/api/komik/${encodeURIComponent(judul)}`).then(r => r.json()),
      fetch(`${baseUrl}/api/komik/${encodeURIComponent(judul)}/${encodeURIComponent(ch)}`).then(r => r.json()),
    ]);
    chapters = chRes;
    images = imgRes;
    pageCount = imgRes.length;
    selectedChapter = ch;
    window.scrollTo(0, 0);
  }

  async function switchChapter(ch: string) {
    selectedChapter = ch;
    const res = await fetch(
      `${baseUrl}/api/komik/${encodeURIComponent(slug)}/${encodeURIComponent(ch)}`,
    ).then(r => r.json());
    images = res;
    pageCount = res.length;
    window.scrollTo(0, 0);
  }

  const currentIdx = $derived(chapters.indexOf(selectedChapter));
  const hasPrev = $derived(currentIdx > 0);
  const hasNext = $derived(currentIdx < chapters.length - 1);

  function navigate(dir: number) {
    const idx = chapters.indexOf(selectedChapter) + dir;
    if (idx < 0 || idx >= chapters.length) return;
    switchChapter(chapters[idx]);
  }

  function onKey(e: KeyboardEvent) {
    if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "SELECT") return;
    if (e.key === "ArrowRight") { e.preventDefault(); navigate(1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); navigate(-1); }
  }
</script>

<svelte:window onkeydown={onKey} />

<div>
  <div class="text-center py-2 mb-2">
    <h2 class="text-base truncate">{slug}</h2>
  </div>

  <div class="flex flex-col items-center">
    {#each images as url}
      <img
        src="{baseUrl}{url}"
        alt="page"
        loading="lazy"
        class="block w-full md:w-[90%] xl:w-[65%] m-0 p-0 border-0 outline-0 leading-none"
      />
    {/each}
  </div>

  <div class="sticky bottom-0 flex items-center justify-center gap-3 py-2.5 bg-neutral-950 border-t border-neutral-800 z-10">
    <button
      class="px-4 py-2 text-sm rounded-lg border border-neutral-700 bg-neutral-800 text-neutral-200 hover:bg-neutral-700 transition"
      onclick={onbacklist}
    >
      ← Kembali
    </button>
    <select
      class="px-3 py-2 text-sm rounded-lg border border-neutral-700 bg-neutral-800 text-neutral-200 cursor-pointer"
      value={selectedChapter}
      onchange={(e) => switchChapter((e.target as HTMLSelectElement).value)}
    >
      {#each chapters as ch}
        <option value={ch}>{ch}</option>
      {/each}
    </select>
    <button disabled={!hasPrev} class="nav-btn" onclick={() => navigate(-1)}>Prev</button>
    <span class="text-xs text-neutral-500 whitespace-nowrap">{pageCount} halaman</span>
    <button disabled={!hasNext} class="nav-btn" onclick={() => navigate(1)}>Next</button>
  </div>
</div>

<style>
  .nav-btn {
    @apply px-4 py-2 text-sm rounded-lg border border-neutral-700 bg-neutral-800 text-neutral-200 hover:bg-violet-600 hover:border-violet-600 transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-neutral-800 disabled:hover:border-neutral-700;
  }
</style>
