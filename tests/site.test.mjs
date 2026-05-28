import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readText(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("home page is a standalone playful landing without personal details", async () => {
  const html = await readText("index.html");

  assert.match(html, /<canvas\b/);
  assert.match(html, /data-reroll/);
  assert.doesNotMatch(html, /http-equiv="refresh"/i);
  assert.doesNotMatch(html, /window\.location/i);
  assert.doesNotMatch(html, /resume\.html/i);
  assert.doesNotMatch(html, /gallery\.html/i);
  assert.doesNotMatch(html, /张亨|简历|U3D|南京|Beaver Blade|AI Coding/i);
}
);

test("resume page exposes the expected static-site contract", async () => {
  const html = await readText("resume.html");

  assert.match(html, /<title>张亨 - U3D开发工程师<\/title>/);
  assert.match(html, /<link rel="stylesheet" href="assets\/css\/site.css">/);
  assert.match(html, /href="gallery\.html"/);
  assert.match(html, /href="assets\/data\/resume\.pdf"/);
  assert.match(html, /class="brand-glyph"/);
  assert.match(html, /<span>RESUME<\/span>/);
  assert.match(html, /张亨/);
  assert.match(html, /U3D开发工程师/);
  assert.match(html, /南京江尚数字科技有限公司/);
  assert.match(html, /Beaver Blade/);
  assert.match(html, /AI Coding/);
  assert.doesNotMatch(html, /<nav\b/i);
});

test("resume page keeps the minimal resume section model", async () => {
  const html = await readText("resume.html");
  const sections = ["基本信息", "工作经历", "作品展示"];

  for (const section of sections) {
    assert.match(html, new RegExp(`<h2>${section}</h2>`));
  }

  assert.doesNotMatch(html, /<h2>教育经历<\/h2>/);
  assert.match(html, /class="resume-sheet"/);
  assert.match(html, /class="section-rule"/);
});

test("portfolio section follows the source PDF wording", async () => {
  const html = await readText("resume.html");

  assert.match(html, /AI Coding 项目/);
  assert.match(html, /Codex 重度用户，200 美金档订阅/);
  assert.match(html, /基于 hermes \+ llm-wiki 搭建个人知识库/);
  assert.match(html, /flexlayout：<a href="https:\/\/github\.com\/zh3rd\/com\.ugui\.flexlayout"/);
  assert.match(html, /gtkbridge：<a href="https:\/\/github\.com\/zh3rd\/com\.graphtoolkit\.bridge"/);
  assert.match(html, /部分项目视频和图片展示/);
});

test("gallery placeholder keeps only contextual navigation", async () => {
  const html = await readText("gallery.html");

  assert.match(html, /<span>GALLERY<\/span>/);
  assert.match(html, /href="resume\.html"/);
  assert.match(html, /data-gallery-grid/);
  assert.match(html, /data-lightbox/);
  assert.match(html, /assets\/js\/gallery\.js/);
  assert.doesNotMatch(html, /Gallery framework is reserved/);
  assert.doesNotMatch(html, /<nav\b/i);
});

test("gallery manifest keeps generated media in depth-first folder order", async () => {
  const manifest = JSON.parse(await readText("assets/data/gallery-manifest.json"));
  const items = manifest.items;

  assert.ok(items.length > 0);
  assert.ok(items.some((item) => item.type === "image"));
  assert.ok(items.some((item) => item.type === "video"));
  assert.equal(manifest.config.thumbnailWidth, 480);
  assert.equal(manifest.config.fullImageMaxWidth, 1600);
  assert.equal(manifest.config.imageFormat, "webp");
  assert.ok(items.every((item) => item.src.startsWith("assets/gallery/full/")));

  const folderOrder = [...new Set(items.map((item) => item.folderPath.split("/")[0]))];
  assert.deepEqual(folderOrder, ["BeaverBlade", "别再出兵了", "凡人炼丹", "古宅迷踪", "星界弈盘", "旧档"]);

  const firstDifferentFolder = items.findIndex((item) => item.folderPath.split("/")[0] !== folderOrder[0]);
  assert.ok(firstDifferentFolder > 0);
  assert.ok(items.slice(firstDifferentFolder).every((item) => item.folderPath.split("/")[0] !== folderOrder[0]));
});

test("gallery initializer uses numeric directory prefixes only for sorting", async () => {
  const script = await readText("scripts/init-gallery.mjs");
  const manifest = JSON.parse(await readText("assets/data/gallery-manifest.json"));

  assert.match(script, /DIRECTORY_SORT_PREFIX_PATTERN/);
  assert.match(script, /createDirectoryEntry/);
  assert.match(script, /sortName/);
  assert.match(script, /displayName/);

  for (const item of manifest.items) {
    assert.doesNotMatch(item.folderPath, /(?:^|\/)\d{2}_/);
    assert.doesNotMatch(item.folder, /^\d{2}_/);
    assert.doesNotMatch(item.sourceFile.path, /(?:^|\/)\d{2}_/);
    assert.doesNotMatch(item.src, /(?:^|\/)\d{2}_/);
    assert.doesNotMatch(item.thumb, /(?:^|\/)\d{2}_/);
  }
});

test("gallery manifest uses lightweight thumbnails and optimized full images", async () => {
  const manifest = JSON.parse(await readText("assets/data/gallery-manifest.json"));
  const imageItems = manifest.items.filter((item) => item.type === "image");
  const videoItems = manifest.items.filter((item) => item.type === "video");

  assert.ok(imageItems.length > 0);
  assert.ok(imageItems.every((item) => item.thumb.startsWith("assets/gallery/thumbs/")));
  assert.ok(imageItems.every((item) => item.thumb.endsWith(".webp")));
  assert.ok(imageItems.every((item) => item.src.endsWith(".webp")));
  assert.ok(imageItems.every((item) => item.width > 0 && item.height > 0));
  assert.ok(imageItems.every((item) => item.thumbWidth > 0 && item.thumbHeight > 0));
  assert.ok(imageItems.every((item) => item.thumbBytes < item.bytes));

  assert.ok(videoItems.length > 0);
  assert.ok(videoItems.every((item) => item.poster === null || item.poster.startsWith("assets/gallery/thumbs/")));
});

test("gallery manifest records source fingerprints for incremental reuse", async () => {
  const script = await readText("scripts/init-gallery.mjs");
  const manifest = JSON.parse(await readText("assets/data/gallery-manifest.json"));

  assert.equal(manifest.config.sourceHashAlgorithm, "md5");
  assert.match(script, /SOURCE_HASH_ALGORITHM = "md5"/);
  assert.match(script, /readPreviousManifest/);
  assert.match(script, /createPreviousManifestIndex/);
  assert.match(script, /tryReuseCachedMedia/);
  assert.match(script, /hashFile/);

  for (const item of manifest.items) {
    assert.ok(item.sourceFile);
    assert.equal(item.sourceFile.hashAlgorithm, "md5");
    assert.equal(item.sourceFile.bytes, item.bytes);
    assert.match(item.sourceFile.path, /\S/);
    assert.match(item.sourceFile.md5, /^[a-f0-9]{32}$/);
    assert.ok(item.sourceFile.mtimeMs > 0);
  }
});

test("gallery manifest gives videos generated WebP or JPG cover thumbnails", async () => {
  const manifest = JSON.parse(await readText("assets/data/gallery-manifest.json"));
  const videoItems = manifest.items.filter((item) => item.type === "video");

  assert.ok(videoItems.length > 0);
  assert.equal(manifest.config.videoPosterFormat, "webp");

  for (const item of videoItems) {
    assert.ok(item.poster);
    assert.ok(item.poster.startsWith("assets/gallery/thumbs/"));
    assert.ok(item.poster.endsWith(".webp") || item.poster.endsWith(".jpg"));
    assert.equal(item.thumb, item.poster);
    assert.ok(item.thumbWidth > 0);
    assert.ok(item.thumbHeight > 0);
    assert.ok(item.thumbBytes > 0);
  }
});

test("gallery initializer compresses videos into generated MP4 assets", async () => {
  const script = await readText("scripts/init-gallery.mjs");
  const manifest = JSON.parse(await readText("assets/data/gallery-manifest.json"));
  const videoItems = manifest.items.filter((item) => item.type === "video");

  assert.match(script, /VIDEO_FULL_MAX_DIMENSION = 1280/);
  assert.match(script, /VIDEO_OUTPUT_FPS = 30/);
  assert.match(script, /VIDEO_CRF = "30"/);
  assert.match(script, /compressVideo/);
  assert.match(script, /"-c:v",\s*"libx264"/);
  assert.match(script, /force_original_aspect_ratio=decrease/);
  assert.doesNotMatch(script, /await copyFile\(sourcePath, outputPath\)/);

  assert.ok(videoItems.length > 0);
  assert.ok(videoItems.every((item) => item.src.startsWith("assets/gallery/full/")));
  assert.ok(videoItems.every((item) => item.src.endsWith(".mp4")));
  assert.ok(videoItems.every((item) => item.fullBytes > 0 && item.fullBytes < item.bytes));
}
);

test("gallery initializer documents source and generated output paths", async () => {
  const script = await readText("scripts/init-gallery.mjs");
  const packageJson = JSON.parse(await readText("package.json"));

  assert.doesNotMatch(script, /SOURCE_DEFAULT/);
  assert.match(script, /--gallery-source/);
  assert.match(script, /--resume-pdf-source/);
  assert.match(script, /parseArguments/);
  assert.match(script, /Usage: npm run gallery:init -- --gallery-source <directory> --resume-pdf-source <pdf>/);
  assert.doesNotMatch(script, /path\.resolve\(ROOT,\s*"\.\."/);
  assert.doesNotMatch(script, /RESUME_PDF_FILE_NAME/);
  assert.match(script, /RESUME_PDF_SOURCE/);
  assert.match(script, /RESUME_PDF_OUTPUT/);
  assert.match(script, /from "sharp"/);
  assert.match(script, /THUMBNAIL_WIDTH = 480/);
  assert.match(script, /FULL_IMAGE_MAX_WIDTH = 1600/);
  assert.match(script, /assets\/gallery\/thumbs/);
  assert.match(script, /assets\/gallery\/full/);
  assert.match(script, /assets\/data\/gallery-manifest\.json/);
  assert.match(script, /assets\/data\/resume\.pdf/);
  assert.match(script, /VIDEO_POSTER_FORMAT = "webp"/);
  assert.match(script, /VIDEO_OUTPUT_EXTENSION = "\.mp4"/);
  assert.match(script, /ffmpeg-static/);
  assert.match(script, /await copyFile\(RESUME_PDF_SOURCE, RESUME_PDF_OUTPUT\)/);
  assert.match(script, /createGalleryBuildDirectory/);
  assert.match(script, /publishGalleryBuild/);
  assert.match(script, /cleanupGalleryBuild/);
  assert.match(script, /depth-first/i);
  assert.ok(packageJson.devDependencies.sharp);
  assert.ok(packageJson.devDependencies["ffmpeg-static"]);
});

test("site repository no longer keeps the external initializer batch", async () => {
  await assert.rejects(() => readText("init-gallery.bat"), { code: "ENOENT" });
});

test("resume PDF is published from assets data instead of the site root", async () => {
  const pdf = await readFile(new URL("../assets/data/resume.pdf", import.meta.url));

  assert.ok(pdf.length > 0);
  await assert.rejects(() => readText("简历-张亨-U3D.pdf"), { code: "ENOENT" });
});

test("gallery client renders cards and opens media in an overlay", async () => {
  const script = await readText("assets/js/gallery.js");

  assert.match(script, /fetch\("assets\/data\/gallery-manifest\.json"\)/);
  assert.match(script, /createMasonryColumns/);
  assert.match(script, /calculateColumnCount/);
  assert.match(script, /getShortestColumn/);
  assert.match(script, /data-lightbox-media/);
  assert.match(script, /data-lightbox-prev/);
  assert.match(script, /data-lightbox-next/);
  assert.match(script, /createElement\("video"\)/);
  assert.match(script, /video\.poster = item\.poster/);
  assert.match(script, /image\.width = item\.thumbWidth/);
  assert.match(script, /image\.height = item\.thumbHeight/);
  assert.match(script, /image\.loading = index < EAGER_CARD_COUNT \? "eager" : "lazy"/);
  assert.match(script, /image\.decoding = "async"/);
  assert.match(script, /openLightbox\(currentIndex - 1\)/);
  assert.match(script, /openLightbox\(currentIndex \+ 1\)/);
  assert.match(script, /closest\("\.lightbox-media img, \.lightbox-media video, \.lightbox-meta, \.lightbox-nav, \.lightbox-close"\)/);
  assert.doesNotMatch(script, /closest\("\.lightbox-panel, \.lightbox-nav, \.lightbox-close"\)/);
  assert.doesNotMatch(script, /\.sort\(/);
  assert.match(script, /document\.addEventListener\("keydown"/);
});

test("gallery client appends masonry cards in scroll-sized batches", async () => {
  const script = await readText("assets/js/gallery.js");

  assert.match(script, /MAX_COLUMN_COUNT = 7/);
  assert.match(script, /COLUMN_HEIGHT_TOLERANCE = 1/);
  assert.match(script, /INITIAL_BATCH_SIZE = 15/);
  assert.match(script, /SCROLL_BATCH_SIZE/);
  assert.match(script, /LOAD_MORE_ROOT_MARGIN = "360px 0px"/);
  assert.match(script, /IntersectionObserver/);
  assert.match(script, /rootMargin: LOAD_MORE_ROOT_MARGIN/);
  assert.match(script, /data-gallery-sentinel/);
  assert.match(script, /renderNextBatch/);
  assert.match(script, /renderedItemCount/);
  assert.match(script, /galleryItems\.slice\(renderedItemCount,/);
  assert.match(script, /syncColumnHeightsFromLayout/);
  assert.match(script, /getBoundingClientRect\(\)\.height/);
  assert.match(script, /moveLoadMoreSentinelToShortestColumn/);
  assert.match(script, /column\.height < shortest\.height - COLUMN_HEIGHT_TOLERANCE/);
  assert.match(script, /loadMoreSentinel\.remove\(\)/);
  assert.doesNotMatch(script, /grid\.append\(\.\.\.columns\.map\(\(column\) => column\.element\), loadMoreSentinel\)/);
  assert.doesNotMatch(script, /renderGallery\(galleryItems\)/);
});

test("gallery client uses predictable responsive column breakpoints", async () => {
  const script = await readText("assets/js/gallery.js");

  assert.match(script, /PORTRAIT_PHONE_COLUMN_COUNT = 2/);
  assert.match(script, /COLUMN_BREAKPOINTS = \[/);
  assert.match(script, /\{ minWidth: 1920, columns: MAX_COLUMN_COUNT \}/);
  assert.match(script, /\{ minWidth: 1600, columns: 6 \}/);
  assert.match(script, /\{ minWidth: 1280, columns: 5 \}/);
  assert.match(script, /\{ minWidth: 960, columns: 4 \}/);
  assert.match(script, /\{ minWidth: 720, columns: 3 \}/);
  assert.match(script, /function isPortraitPhoneViewport\(\)/);
  assert.match(script, /window\.innerHeight >= window\.innerWidth/);
  assert.match(script, /return PORTRAIT_PHONE_COLUMN_COUNT/);
  assert.match(script, /COLUMN_BREAKPOINTS\.find/);
  assert.doesNotMatch(script, /DESKTOP_COLUMN_WIDTH/);
}
);

test("site stylesheet defines paper and print behavior", async () => {
  const css = await readText("assets/css/site.css");

  assert.match(css, /\.resume-sheet/);
  assert.match(css, /\.brand-glyph/);
  assert.match(css, /\.brand-chevron/);
  assert.match(css, /width: 22px/);
  assert.match(css, /border-radius: 999px/);
  assert.match(css, /\.context-link/);
  assert.match(css, /\.gallery-grid/);
  assert.match(css, /--gallery-gap: 18px/);
  assert.match(css, /grid-template-columns: repeat\(var\(--gallery-columns, 1\), minmax\(0, 1fr\)\)/);
  assert.match(css, /\.gallery-column/);
  assert.doesNotMatch(css, /column-width/);
  assert.doesNotMatch(css, /\.gallery-sentinel\s*{[^}]*grid-column:/s);
  assert.match(css, /0 20px 46px rgba\(15, 23, 42, 0\.22\)/);
  assert.match(css, /\.gallery-card:hover/);
  assert.match(css, /\.lightbox/);
  assert.match(css, /\.lightbox-meta\s*{[^}]*position: fixed;[^}]*top: 22px;[^}]*left: 30px;[^}]*right: 86px;/s);
  assert.match(css, /\.lightbox-media\s*{[^}]*display: grid;[^}]*place-items: center;/s);
  assert.match(css, /\.lightbox-nav/);
  assert.match(css, /object-fit: contain/);
  assert.match(css, /font-family: "Nunito Sans"/);
  assert.match(css, /font-size: 12px/);
  assert.match(css, /@media print/);
  assert.match(css, /font-family: "Noto Serif SC"/);
  assert.match(css, /overflow-wrap: anywhere/);
});

test("site header keeps the brand glyph optically centered with its label", async () => {
  const css = await readText("assets/css/site.css");

  assert.match(css, /\.brand-mark\s*{[^}]*align-items: baseline;/s);
  assert.match(css, /\.brand-mark\s*{[^}]*line-height: 1;/s);
  assert.match(css, /\.brand-glyph\s*{[^}]*align-self: baseline;[^}]*height: 14px;[^}]*transform: scale\(0\.85\);/s);
  assert.match(css, /\.brand-glyph\s*{[^}]*transform-origin: center;/s);
});
