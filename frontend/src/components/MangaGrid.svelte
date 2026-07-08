<script lang="ts">
  import { onMount } from "svelte";

  let { baseUrl, onselect }: {
    baseUrl: string;
    onselect: (slug: string) => void;
  } = $props();

  let mangas: { slug: string; title: string; lastChapter?: string }[] = $state([]);
  let query = $state("");

  onMount(async () => {
    const res = await fetch(`${baseUrl}/api/komik`);
    mangas = await res.json();
  });

  const filtered = $derived(
    query
      ? mangas.filter(
          (m) =>
            m.title.toLowerCase().includes(query.toLowerCase()) ||
            m.slug.toLowerCase().includes(query.toLowerCase()),
        )
      : mangas,
  );
</script>

<div>
  <div class="mb-6 flex justify-center">
    <input
      type="text"
      bind:value={query}
      placeholder="Cari judul..."
      class="w-full max-w-md px-4 py-2.5 text-sm rounded-lg border border-neutral-700 bg-neutral-800 text-neutral-200 placeholder-neutral-500 outline-none focus:border-violet-500 transition"
    />
  </div>

  <div class="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-5">
    {#each filtered as manga (manga.slug)}
      <button
        class="rounded-lg overflow-hidden bg-neutral-800 hover:-translate-y-1 hover:shadow-lg hover:shadow-black/40 transition flex flex-col h-full"
        onclick={() => onselect(manga.slug)}
      >
        <img
          src="{baseUrl}/api/cover?judul={manga.slug}"
          alt={manga.title}
          loading="lazy"
          class="w-full aspect-[2/3] object-cover shrink-0"
        />
        <div class="px-2.5 pt-2 pb-1 text-center text-sm font-semibold leading-snug line-clamp-2 min-h-[2.75rem]">
          {manga.title}
        </div>
        {#if manga.lastChapter}
          <div class="px-2.5 pb-2 mt-auto text-xs text-violet-400 text-center">
            {manga.lastChapter}
          </div>
        {:else}
          <div class="pb-2"></div>
        {/if}
      </button>
    {:else}
      <p class="col-span-full text-neutral-500 text-center py-12">
        Tidak ada komik ditemukan.
      </p>
    {/each}
  </div>
</div>
