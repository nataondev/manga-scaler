// Constants
const SELECTORS = {
  judulList: "#judul-list",
  chapterList: ".chapter-list",
  chapterListBottom: ".chapter-list-bottom",
  imageList: "#image-list",
  prevChapter: "#prev-chapter",
  nextChapter: "#next-chapter",
  prevChapterBottom: "#prev-chapter-bottom",
  nextChapterBottom: "#next-chapter-bottom",
  chapterSection: "#chapter-section",
  imageSection: "#image-section",
};

const STORAGE_KEYS = {
  currentJudul: "currentJudul",
  currentChapter: "currentChapter",
};

const KEYBOARD = {
  RIGHT_ARROW: 39,
  LEFT_ARROW: 37,
};

$(document).ready(function () {
  // Cache DOM elements
  const $judulList = $(SELECTORS.judulList);
  const $chapterList = $(SELECTORS.chapterList);
  const $chapterListBottom = $(SELECTORS.chapterListBottom);
  const $imageList = $(SELECTORS.imageList);
  const $chapterSection = $(SELECTORS.chapterSection);
  const $imageSection = $(SELECTORS.imageSection);

  // Get base URL
  const baseUrl = new URL(window.location.href).origin;

  // API endpoints
  const API = {
    getKomik: () => `${baseUrl}/api/komik`,
    getChapters: (judul) => `${baseUrl}/api/komik/${encodeURIComponent(judul)}`,
    getImages: (judul, chapter) => `${baseUrl}/api/komik/${encodeURIComponent(judul)}/${encodeURIComponent(chapter)}`,
  };

  async function loadJudul() {
    try {
      const data = await $.get(API.getKomik());
      const judulTableBody = $judulList.find("tbody");
      judulTableBody.empty();

      const rows = data
        .map(
          (judul, index) => `
        <tr data-judul="${judul}">
          <td>${index + 1}</td>
          <td>${judul}</td>
        </tr>
      `
        )
        .join("");

      judulTableBody.html(rows);

      const currentJudul = localStorage.getItem(STORAGE_KEYS.currentJudul);
      if (currentJudul) {
        loadChapter(currentJudul);
      }
    } catch (error) {
      console.error("Error loading judul:", error);
    }
  }

  async function loadChapter(judul) {
    try {
      const data = await $.get(API.getChapters(judul));

      const options = data
        .map(
          (chapter) =>
            `<option value="${chapter}" data-judul="${judul}">${chapter}</option>`
        )
        .join("");

      $chapterList.html(options);
      $chapterListBottom.html(options);

      const currentChapter = localStorage.getItem(STORAGE_KEYS.currentChapter);
      const initialChapter =
        currentChapter && data.includes(currentChapter)
          ? currentChapter
          : data[0];

      $chapterList.val(initialChapter);
      $chapterListBottom.val(initialChapter);

      updateNavigationButtons(data, initialChapter);
      loadImages(judul, initialChapter);

      $chapterSection.removeClass("d-none");
    } catch (error) {
      console.error("Error loading chapters:", error);
    }
  }

  async function loadImages(judul, chapter) {
    try {
      const data = await $.get(API.getImages(judul, chapter));

      const images = data
        .map(
          (imageUrl) =>
            `<img src="${baseUrl}${imageUrl}" alt="Manga Page" loading="lazy">`
        )
        .join("");

      $imageList.html(images);
      $imageSection.removeClass("d-none");

      localStorage.setItem(STORAGE_KEYS.currentJudul, judul);
      localStorage.setItem(STORAGE_KEYS.currentChapter, chapter);
    } catch (error) {
      console.error("Error loading images:", error);
    }
  }

  function updateNavigationButtons(chapters, currentChapter) {
    const currentIndex = chapters.indexOf(currentChapter);
    const isFirstChapter = currentIndex === 0;
    const isLastChapter = currentIndex === chapters.length - 1;

    $(SELECTORS.prevChapter).prop("disabled", isFirstChapter);
    $(SELECTORS.nextChapter).prop("disabled", isLastChapter);
    $(SELECTORS.prevChapterBottom).prop("disabled", isFirstChapter);
    $(SELECTORS.nextChapterBottom).prop("disabled", isLastChapter);
  }

  function navigateChapter(direction) {
    const chapters = $chapterList
      .find("option")
      .map((_, el) => $(el).val())
      .get();
    const currentChapter = $chapterList.val();
    const currentIndex = chapters.indexOf(currentChapter);
    const newIndex = currentIndex + direction;

    if (newIndex >= 0 && newIndex < chapters.length) {
      const newChapter = chapters[newIndex];
      $chapterList.val(newChapter).trigger("change");
      $chapterListBottom.val(newChapter);
      updateNavigationButtons(chapters, newChapter);
    }
  }

  // Event Handlers
  $judulList.on("click", "tr", function () {
    const judul = $(this).data("judul");
    const currentJudul = localStorage.getItem(STORAGE_KEYS.currentJudul);

    if (currentJudul !== judul) {
      localStorage.removeItem(STORAGE_KEYS.currentChapter);
    }

    loadChapter(judul);
  });

  $chapterList.add($chapterListBottom).on("change", function () {
    const chapter = $(this).val();
    const judul = localStorage.getItem(STORAGE_KEYS.currentJudul);
    const chapters = $chapterList
      .find("option")
      .map((_, el) => $(el).val())
      .get();

    $chapterList.val(chapter);
    $chapterListBottom.val(chapter);
    updateNavigationButtons(chapters, chapter);
    loadImages(judul, chapter);
  });

  // Navigation buttons
  $(SELECTORS.prevChapter)
    .add(SELECTORS.prevChapterBottom)
    .on("click", () => navigateChapter(-1));
  $(SELECTORS.nextChapter)
    .add(SELECTORS.nextChapterBottom)
    .on("click", () => navigateChapter(1));

  // Keyboard navigation
  $(document).on("keydown", function (e) {
    if (!e.shiftKey) return;

    if (e.keyCode === KEYBOARD.RIGHT_ARROW) {
      navigateChapter(1);
    } else if (e.keyCode === KEYBOARD.LEFT_ARROW) {
      navigateChapter(-1);
    }
  });

  // Initialize
  loadJudul();
});
