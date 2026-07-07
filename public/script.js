const baseUrl = new URL(window.location.href).origin;

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

const api = {
  komik: () => fetch(`${baseUrl}/api/komik`).then(r => r.json()),
  cover: (j) => `${baseUrl}/api/cover?judul=${encodeURIComponent(j)}`,
  metadata: (j) => fetch(`${baseUrl}/api/metadata?judul=${encodeURIComponent(j)}`).then(r => r.ok ? r.json() : null).catch(() => null),
  chapters: (j) => fetch(`${baseUrl}/api/komik/${encodeURIComponent(j)}`).then(r => r.json()),
  images: (j, c) => fetch(`${baseUrl}/api/komik/${encodeURIComponent(j)}/${encodeURIComponent(c)}`).then(r => r.json()),
};

const store = {
  get(k) { return localStorage.getItem(k); },
  set(k, v) { localStorage.setItem(k, v); },
  del(k) { localStorage.removeItem(k); },
};

let currentJudul = store.get('currentJudul');
let currentChapter = store.get('currentChapter');
let chapters = [];

// === Grid manga ===
async function loadJudul() {
  const data = await api.komik();
  const grid = $('#manga-grid');
  grid.innerHTML = data.map(({ slug, title }) => {
    const last = store.get(`currentChapter_${slug}`);
    return `
    <div class="manga-card" data-judul="${slug}">
      <img src="${api.cover(slug)}" alt="${title}" loading="lazy" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 160 240%22><rect fill=%22%23333%22 width=%22160%22 height=%22240%22/><text fill=%22%23666%22 x=%2280%22 y=%22120%22 text-anchor=%22middle%22 font-size=%2214%22>No Cover</text></svg>'">
      <div class="manga-title">${title}</div>
      ${last ? `<div class="manga-last">${last}</div>` : ''}
    </div>
  `;
  }).join('');
}

$('#search-input').addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase();
  $$('.manga-card').forEach(card => {
    card.style.display = card.dataset.judul.toLowerCase().includes(q) ? '' : 'none';
  });
});

function showSection(id) {
  ['judul-section', 'detail-section', 'reader-section'].forEach(s => {
    $(`#${s}`).classList.toggle('d-none', s !== id);
  });
}

// Grid → Detail
$('#manga-grid').addEventListener('click', (e) => {
  const card = e.target.closest('.manga-card');
  if (!card) return;
  openDetail(card.dataset.judul);
});

// Detail → Grid
$('#detail-back').addEventListener('click', () => {
  showSection('judul-section');
  loadJudul();
});

// === Detail Page ===
async function openDetail(judul) {
  currentJudul = judul;
  showSection('detail-section');

  const [meta, chaps] = await Promise.all([
    api.metadata(judul),
    api.chapters(judul),
  ]);
  chapters = chaps;

  const lastChapter = store.get(`currentChapter_${judul}`);
  const displayTitle = meta?.alternativeName || meta?.title || judul;

  let html = `
    <div class="detail-cover">
      <img src="${api.cover(judul)}" alt="${displayTitle}">
    </div>
    <div class="detail-info">
      <h2>${displayTitle}</h2>`;

  if (meta) {
    const fields = [
      ['Judul Asli', meta.alternativeName ? meta.title : null],
      ['Author', meta.author?.join(', ')],
      ['Artist', meta.artist?.join(', ')],
      ['Status', meta.status],
      ['Tipe', meta.type],
      ['Tema', meta.theme?.join(', ')],
      ['Rating', meta.rating],
      ['Cara Baca', meta.readingDirection],
      ['Pembaca', meta.totalViews],
    ].filter(([, v]) => v);

    fields.forEach(([label, value]) => {
      const isTags = ['Genre', 'Tema'].includes(label) && meta[label.toLowerCase()];
      if (isTags) {
        const tags = meta[label.toLowerCase()].map(t => `<span class="meta-tag">${t}</span>`).join('');
        html += `<div class="meta-row"><span class="meta-label">${label}:</span><span class="meta-value meta-tags">${tags}</span></div>`;
      } else {
        html += `<div class="meta-row"><span class="meta-label">${label}:</span><span class="meta-value">${value}</span></div>`;
      }
    });

    if (meta.genre?.length) {
      const tags = meta.genre.map(g => `<span class="meta-tag">${g}</span>`).join('');
      html += `<div class="meta-row"><span class="meta-label">Genre:</span><span class="meta-value meta-tags">${tags}</span></div>`;
    }

    if (meta.summary) {
      html += `<div class="summary">${meta.summary}</div>`;
    }
  }

  html += `</div>`;
  $('#detail-content').innerHTML = html;

  // Chapter grid
  const chapterHtml = chapters.map(ch => `
    <div class="ch-item${ch === lastChapter ? ' current' : ''}" data-chapter="${ch}">${ch}</div>
  `).join('');

  $('#detail-chapters').innerHTML = `
    <h3>${chapters.length} Chapter</h3>
    <div class="ch-grid">${chapterHtml}</div>
  `;

  window.scrollTo(0, 0);
}

// Detail → Reader (click chapter)
$('#detail-chapters').addEventListener('click', (e) => {
  const item = e.target.closest('.ch-item');
  if (!item) return;
  const ch = item.dataset.chapter;
  currentChapter = ch;
  store.set('currentChapter', ch);
  openReader(currentJudul);
});

// === Reader ===
async function openReader(judul) {
  const chapter = currentChapter || chapters[0];
  currentChapter = chapter;
  store.set('currentChapter', chapter);

  $('#reader-title').textContent = judul;
  populateChapterSelect(chapter);
  await loadImages(judul, chapter);
  updateNav();

  showSection('reader-section');
}

$('#back-to-list').addEventListener('click', () => {
  showSection('judul-section');
  loadJudul();
});

function populateChapterSelect(selected) {
  const html = chapters.map(c => `<option value="${c}" ${c === selected ? 'selected' : ''}>${c}</option>`).join('');
  $('#chapter-select').innerHTML = html;
}

$('#chapter-select').addEventListener('change', async (e) => {
  currentChapter = e.target.value;
  store.set('currentChapter', currentChapter);
  await loadImages(currentJudul, currentChapter);
  updateNav();
  window.scrollTo(0, 0);
});

async function loadImages(judul, chapter) {
  const data = await api.images(judul, chapter);
  $('#image-list').innerHTML = data.map(url =>
    `<img src="${baseUrl}${url}" alt="page" loading="lazy" data-page>`
  ).join('');

  const savedScroll = store.get(`scroll_${judul}_${chapter}`);
  window.scrollTo(0, savedScroll ? parseInt(savedScroll) : 0);

  store.set('currentJudul', judul);
  store.set('currentChapter', chapter);
  store.set(`currentChapter_${judul}`, chapter);
  updatePageIndicator();
}

function updatePageIndicator() {
  $('#page-indicator').textContent = `${$$('#image-list img').length} halaman`;
}

function updateNav() {
  const idx = chapters.indexOf(currentChapter);
  $('#prev-chapter').disabled = idx <= 0;
  $('#next-chapter').disabled = idx >= chapters.length - 1;
}

function navigate(direction) {
  const idx = chapters.indexOf(currentChapter);
  const newIdx = idx + direction;
  if (newIdx < 0 || newIdx >= chapters.length) return;
  currentChapter = chapters[newIdx];
  store.set('currentChapter', currentChapter);
  $('#chapter-select').value = currentChapter;
  loadImages(currentJudul, currentChapter);
  updateNav();
  window.scrollTo(0, 0);
}

$('#prev-chapter').addEventListener('click', () => navigate(-1));
$('#next-chapter').addEventListener('click', () => navigate(1));

document.addEventListener('keydown', (e) => {
  if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'SELECT') return;
  if (e.key === 'ArrowRight') { e.preventDefault(); navigate(1); }
  if (e.key === 'ArrowLeft') { e.preventDefault(); navigate(-1); }
});

let scrollTimer;
const scrollTopBtn = $('#scroll-top');
window.addEventListener('scroll', () => {
  clearTimeout(scrollTimer);
  scrollTimer = setTimeout(() => {
    if (currentJudul && currentChapter) {
      store.set(`scroll_${currentJudul}_${currentChapter}`, window.scrollY);
    }
  }, 300);
  scrollTopBtn.classList.toggle('d-none', window.scrollY <= 600);
});

scrollTopBtn.addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

loadJudul();
