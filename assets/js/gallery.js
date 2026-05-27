const grid = document.querySelector("[data-gallery-grid]");
const state = document.querySelector("[data-gallery-state]");
const lightbox = document.querySelector("[data-lightbox]");
const lightboxMedia = document.querySelector("[data-lightbox-media]");
const lightboxFolder = document.querySelector("[data-lightbox-folder]");
const lightboxTitle = document.querySelector("[data-lightbox-title]");
const closeButton = document.querySelector("[data-lightbox-close]");
const previousButton = document.querySelector("[data-lightbox-prev]");
const nextButton = document.querySelector("[data-lightbox-next]");
const EAGER_CARD_COUNT = 4;
const INITIAL_BATCH_SIZE = 15;
const SCROLL_BATCH_SIZE = 8;
const LOAD_MORE_AHEAD_PX = 360;
const LOAD_MORE_ROOT_MARGIN = "360px 0px";
const COLUMN_HEIGHT_TOLERANCE = 1;
const MAX_COLUMN_COUNT = 7;
const DESKTOP_GRID_GAP = 18;
const MOBILE_GRID_GAP = 14;
const MOBILE_BREAKPOINT = 760;
const PORTRAIT_PHONE_COLUMN_COUNT = 2;
const COLUMN_BREAKPOINTS = [
  { minWidth: 1920, columns: MAX_COLUMN_COUNT },
  { minWidth: 1600, columns: 6 },
  { minWidth: 1280, columns: 5 },
  { minWidth: 960, columns: 4 },
  { minWidth: 720, columns: 3 },
];
const VIDEO_FALLBACK_ASPECT = 1.78;

let galleryItems = [];
let currentIndex = -1;
let resizeTimer = 0;
let renderedItemCount = 0;
let currentColumnCount = 0;
let columns = [];
let loadMoreObserver = null;
let loadMoreSentinel = null;

async function loadGallery() {
  try {
    const response = await fetch("assets/data/gallery-manifest.json");

    if (!response.ok) {
      throw new Error(`Gallery manifest request failed: ${response.status}`);
    }

    const manifest = await response.json();
    galleryItems = Array.isArray(manifest.items) ? manifest.items : [];
    initializeGallery();
  } catch (error) {
    state.textContent = "Gallery failed to load.";
    console.error(error);
  }
}

function initializeGallery(targetRenderCount = INITIAL_BATCH_SIZE) {
  disconnectLoadMoreObserver();
  grid.textContent = "";
  renderedItemCount = 0;
  columns = [];

  if (galleryItems.length === 0) {
    const emptyState = document.createElement("p");
    emptyState.className = "gallery-state";
    emptyState.textContent = "No gallery items yet.";
    grid.append(emptyState);
    return;
  }

  currentColumnCount = calculateColumnCount();
  columns = createMasonryColumns(currentColumnCount);
  loadMoreSentinel = createLoadMoreSentinel();

  grid.style.setProperty("--gallery-columns", currentColumnCount);
  grid.append(...columns.map((column) => column.element));
  renderNextBatch(targetRenderCount);
  observeLoadMoreSentinel();
}

function renderNextBatch(batchSize = SCROLL_BATCH_SIZE) {
  if (columns.length === 0 || renderedItemCount >= galleryItems.length) {
    return;
  }

  loadMoreSentinel.remove();
  syncColumnHeightsFromLayout();

  const nextItems = galleryItems.slice(renderedItemCount, renderedItemCount + batchSize);
  const columnWidth = getColumnWidth(currentColumnCount);

  nextItems.forEach((item, offset) => {
    const index = renderedItemCount + offset;
    const card = createCard(item, index);
    const column = getShortestColumn(columns);
    column.element.append(card);
    column.height += getEstimatedCardHeight(item, columnWidth) + getGridGap();
  });

  renderedItemCount += nextItems.length;
  updateLoadMoreSentinel();
}

function createCard(item, index) {
  const card = document.createElement("article");
  card.className = `gallery-card gallery-card-${item.type}`;
  card.tabIndex = 0;
  card.role = "button";
  card.setAttribute("aria-label", `Open ${item.title}`);

  card.append(createPreview(item, index), createFolderTag(item.folder));
  if (item.type === "video") {
    card.append(createPlayIndicator());
  }

  card.addEventListener("click", () => openLightbox(index));
  card.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openLightbox(index);
    }
  });

  return card;
}

function createLoadMoreSentinel() {
  const sentinel = document.createElement("div");
  sentinel.className = "gallery-sentinel";
  sentinel.setAttribute("data-gallery-sentinel", "");
  sentinel.setAttribute("aria-hidden", "true");
  return sentinel;
}

function observeLoadMoreSentinel() {
  if (!loadMoreSentinel || renderedItemCount >= galleryItems.length) {
    return;
  }

  if ("IntersectionObserver" in window) {
    loadMoreObserver = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        renderNextBatch();
      }
    }, { rootMargin: LOAD_MORE_ROOT_MARGIN });

    loadMoreObserver.observe(loadMoreSentinel);
    return;
  }

  window.addEventListener("scroll", loadMoreOnScroll, { passive: true });
  loadMoreOnScroll();
}

function loadMoreOnScroll() {
  if (!loadMoreSentinel || renderedItemCount >= galleryItems.length) {
    window.removeEventListener("scroll", loadMoreOnScroll);
    return;
  }

  if (loadMoreSentinel.getBoundingClientRect().top < window.innerHeight + LOAD_MORE_AHEAD_PX) {
    renderNextBatch();
  }
}

function updateLoadMoreSentinel() {
  if (!loadMoreSentinel) {
    return;
  }

  if (renderedItemCount >= galleryItems.length) {
    disconnectLoadMoreObserver();
    loadMoreSentinel.remove();
    loadMoreSentinel = null;
    return;
  }

  moveLoadMoreSentinelToShortestColumn();
}

function moveLoadMoreSentinelToShortestColumn() {
  if (!loadMoreSentinel || columns.length === 0) {
    return;
  }

  const column = getShortestColumn(columns);
  column.element.append(loadMoreSentinel);
}

function disconnectLoadMoreObserver() {
  if (loadMoreObserver) {
    loadMoreObserver.disconnect();
    loadMoreObserver = null;
  }

  window.removeEventListener("scroll", loadMoreOnScroll);
}

function calculateColumnCount() {
  if (isPortraitPhoneViewport()) {
    return PORTRAIT_PHONE_COLUMN_COUNT;
  }

  const breakpoint = COLUMN_BREAKPOINTS.find(({ minWidth }) => window.innerWidth >= minWidth);
  return breakpoint ? breakpoint.columns : PORTRAIT_PHONE_COLUMN_COUNT;
}

function createMasonryColumns(columnCount) {
  return Array.from({ length: columnCount }, () => {
    const element = document.createElement("div");
    element.className = "gallery-column";
    return { element, height: 0 };
  });
}

function syncColumnHeightsFromLayout() {
  columns.forEach((column) => {
    column.height = column.element.getBoundingClientRect().height;
  });
}

function getShortestColumn(columns) {
  return columns.reduce(
    (shortest, column) => (column.height < shortest.height - COLUMN_HEIGHT_TOLERANCE ? column : shortest),
    columns[0]
  );
}

function getColumnWidth(columnCount) {
  const gap = getGridGap();
  return (grid.clientWidth - gap * (columnCount - 1)) / columnCount;
}

function getEstimatedCardHeight(item, columnWidth) {
  const width = item.thumbWidth || item.width;
  const height = item.thumbHeight || item.height;

  if (width && height) {
    return (columnWidth * height) / width;
  }

  return item.type === "video" ? columnWidth * VIDEO_FALLBACK_ASPECT : columnWidth;
}

function getGridGap() {
  return isMobileViewport() ? MOBILE_GRID_GAP : DESKTOP_GRID_GAP;
}

function isMobileViewport() {
  return window.innerWidth <= MOBILE_BREAKPOINT;
}

function isPortraitPhoneViewport() {
  return isMobileViewport() && window.innerHeight >= window.innerWidth;
}

function createPreview(item, index) {
  if (item.type === "video" && !item.thumb && !item.poster) {
    const video = document.createElement("video");
    video.preload = item.poster ? "none" : "metadata";
    video.muted = true;
    video.playsInline = true;
    video.src = `${item.src}#t=0.1`;
    if (item.poster) {
      video.poster = item.poster;
    }
    return video;
  }

  const image = document.createElement("img");
  image.src = item.thumb || item.poster || item.src;
  image.alt = item.title;
  image.width = item.thumbWidth;
  image.height = item.thumbHeight;
  image.loading = index < EAGER_CARD_COUNT ? "eager" : "lazy";
  image.decoding = "async";
  image.fetchPriority = index < EAGER_CARD_COUNT ? "high" : "low";
  return image;
}

function createFolderTag(folder) {
  const tag = document.createElement("span");
  tag.className = "gallery-tag";
  tag.textContent = folder;
  return tag;
}

function createPlayIndicator() {
  const play = document.createElement("span");
  play.className = "gallery-play";
  play.setAttribute("aria-hidden", "true");
  return play;
}

function openLightbox(index) {
  const normalizedIndex = normalizeIndex(index);
  const item = galleryItems[normalizedIndex];
  if (!item) {
    return;
  }

  currentIndex = normalizedIndex;
  lightboxMedia.textContent = "";
  lightboxFolder.textContent = item.folder;
  lightboxTitle.textContent = item.title;
  lightboxMedia.append(createLightboxMedia(item));
  lightbox.hidden = false;
  document.body.classList.add("is-lightbox-open");
  closeButton.focus();
}

function createLightboxMedia(item) {
  if (item.type === "video") {
    const video = document.createElement("video");
    video.src = item.src;
    video.controls = true;
    video.autoplay = true;
    video.playsInline = true;
    if (item.poster) {
      video.poster = item.poster;
    }
    return video;
  }

  const image = document.createElement("img");
  image.src = item.src;
  image.alt = item.title;
  image.width = item.width;
  image.height = item.height;
  image.decoding = "async";
  return image;
}

function normalizeIndex(index) {
  if (galleryItems.length === 0) {
    return -1;
  }

  return (index + galleryItems.length) % galleryItems.length;
}

function closeLightbox() {
  if (lightbox.hidden) {
    return;
  }

  lightbox.hidden = true;
  currentIndex = -1;
  document.body.classList.remove("is-lightbox-open");
  lightboxMedia.textContent = "";
}

closeButton.addEventListener("click", closeLightbox);
previousButton.addEventListener("click", () => openLightbox(currentIndex - 1));
nextButton.addEventListener("click", () => openLightbox(currentIndex + 1));
lightbox.addEventListener("click", (event) => {
  if (!event.target.closest(".lightbox-media img, .lightbox-media video, .lightbox-meta, .lightbox-nav, .lightbox-close")) {
    closeLightbox();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeLightbox();
  }

  if (!lightbox.hidden && event.key === "ArrowLeft") {
    openLightbox(currentIndex - 1);
  }

  if (!lightbox.hidden && event.key === "ArrowRight") {
    openLightbox(currentIndex + 1);
  }
});

window.addEventListener("resize", () => {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    if (galleryItems.length > 0 && lightbox.hidden) {
      initializeGallery(Math.max(renderedItemCount, INITIAL_BATCH_SIZE));
    }
  }, 120);
});

loadGallery();
