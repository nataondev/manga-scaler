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

  let footerHidden = $state(false);

  function onTapZone(zone: "top" | "mid" | "bot") {
    if (zone === "top") window.scrollBy({ top: -500, behavior: "smooth" });
    if (zone === "bot") window.scrollBy({ top: 500, behavior: "smooth" });
    if (zone === "mid") footerHidden = !footerHidden;
  }
</script>

<svelte:window onkeydown={onKey} />

<div>
  <div class="text-center py-2 mb-2" class:opacity-0={footerHidden}>
    <h2 class="text-base truncate">{slug}</h2>
  </div>

  <div class="relative flex flex-col items-center">
    <div class="fixed inset-0 z-20 pointer-events-none">
      <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
      <div class="tap-zone tap-up absolute top-0 left-0 w-full h-[35%] pointer-events-auto opacity-0 hover:opacity-100 transition-opacity" onclick={() => onTapZone("top")}></div>
      <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
      <div class="absolute top-[35%] left-0 w-full h-[30%] pointer-events-auto cursor-pointer" onclick={() => onTapZone("mid")}></div>
      <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
      <div class="tap-zone tap-down absolute top-[65%] left-0 w-full h-[35%] pointer-events-auto opacity-0 hover:opacity-100 transition-opacity" onclick={() => onTapZone("bot")}></div>
    </div>

    {#each images as url}
      <img
        src="{baseUrl}{url}"
        alt="page"
        loading="lazy"
        class="block w-full md:w-[90%] xl:w-[65%] m-0 p-0 border-0 outline-0 leading-none select-none"
        draggable="false"
      />
    {/each}
  </div>

  <div class="sticky bottom-0 flex items-center justify-center gap-3 py-2.5 bg-neutral-950 border-t border-neutral-800 z-30 transition-transform duration-200" class:translate-y-full={footerHidden}>
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

  .tap-up {
    cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 24 24' fill='none' stroke='%23a5b4fc' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='10' opacity='.3'/%3E%3Cpath d='m8 14 4-4 4 4'/%3E%3C/svg%3E") 16 16, auto;
  }

  .tap-down {
    cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 24 24' fill='none' stroke='%23a5b4fc' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='10' opacity='.3'/%3E%3Cpath d='m16 10-4 4-4-4'/%3E%3C/svg%3E") 16 16, auto;
  }
</style>
