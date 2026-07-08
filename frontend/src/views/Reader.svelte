<script lang="ts">
  import MangaGrid from "../components/MangaGrid.svelte";
  import MangaDetail from "../components/MangaDetail.svelte";
  import MangaReader from "../components/MangaReader.svelte";

  let { baseUrl }: { baseUrl: string } = $props();

  let view = $state<"grid" | "detail" | "reader">("grid");
  let selectedSlug = $state("");
  let currentChapter = $state("");
  let chapters: string[] = $state([]);
  let meta: Record<string, any> | null = $state(null);

  function openDetail(slug: string) {
    selectedSlug = slug;
    view = "detail";
  }

  function openReader(slug: string, chapter: string) {
    selectedSlug = slug;
    currentChapter = chapter;
    view = "reader";
  }

  function backToGrid() {
    view = "grid";
    selectedSlug = "";
    currentChapter = "";
  }

  function backToDetail() {
    view = "detail";
  }
</script>

{#if view === "grid"}
  <MangaGrid {baseUrl} onselect={openDetail} />
{:else if view === "detail"}
  <MangaDetail
    {baseUrl}
    slug={selectedSlug}
    onback={backToGrid}
    onchapter={(ch: string) => openReader(selectedSlug, ch)}
  />
{:else if view === "reader"}
  <MangaReader
    {baseUrl}
    slug={selectedSlug}
    chapter={currentChapter}
    onbacklist={backToGrid}
    onbackdetail={backToDetail}
  />
{/if}
