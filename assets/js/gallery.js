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
const DESKTOP_COLUMN_WIDTH = 220;
const MOBILE_COLUMN_WIDTH = 160;
const DESKTOP_GRID_GAP = 24;
const MOBILE_GRID_GAP = 14;
const MOBILE_BREAKPOINT = 760;
const VIDEO_FALLBACK_ASPECT = 1.78;

let galleryItems = [];
let currentIndex = -1;
let resizeTimer = 0;

async function loadGallery() {
  try {
    const response = await fetch("assets/data/gallery-manifest.json");

    if (!response.ok) {
      throw new Error(`Gallery manifest request failed: ${response.status}`);
    }

    const manifest = await response.json();
    galleryItems = Array.isArray(manifest.items) ? manifest.items : [];
    renderGallery(galleryItems);
  } catch (error) {
    state.textContent = "Gallery failed to load.";
    console.error(error);
  }
}

function renderGallery(items) {
  grid.textContent = "";

  if (items.length === 0) {
    const emptyState = document.createElement("p");
    emptyState.className = "gallery-state";
    emptyState.textContent = "No gallery items yet.";
    grid.append(emptyState);
    return;
  }

  const columnCount = calculateColumnCount(grid.clientWidth);
  const columns = createMasonryColumns(columnCount);
  const columnWidth = getColumnWidth(columnCount);

  items.forEach((item, index) => {
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

    const column = getShortestColumn(columns);
    column.element.append(card);
    column.height += getEstimatedCardHeight(item, columnWidth) + getGridGap();
  });

  grid.style.setProperty("--gallery-columns", columnCount);
  grid.append(...columns.map((column) => column.element));
}

function calculateColumnCount(containerWidth) {
  const minColumnWidth = isMobileViewport() ? MOBILE_COLUMN_WIDTH : DESKTOP_COLUMN_WIDTH;
  const gap = getGridGap();
  return Math.max(1, Math.floor((containerWidth + gap) / (minColumnWidth + gap)));
}

function createMasonryColumns(columnCount) {
  return Array.from({ length: columnCount }, () => {
    const element = document.createElement("div");
    element.className = "gallery-column";
    return { element, height: 0 };
  });
}

function getShortestColumn(columns) {
  return columns.reduce((shortest, column) => (column.height < shortest.height ? column : shortest), columns[0]);
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

function createPreview(item, index) {
  if (item.type === "video") {
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
  image.src = item.thumb || item.src;
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
  if (!event.target.closest(".lightbox-panel, .lightbox-nav, .lightbox-close")) {
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
      renderGallery(galleryItems);
    }
  }, 120);
});

loadGallery();
