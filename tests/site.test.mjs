import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readText(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("resume page exposes the expected static-site contract", async () => {
  const html = await readText("resume.html");

  assert.match(html, /<title>张亨 - U3D开发工程师<\/title>/);
  assert.match(html, /<link rel="stylesheet" href="assets\/css\/site.css">/);
  assert.match(html, /href="gallery\.html"/);
  assert.match(html, /href="简历-张亨-U3D\.pdf"/);
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
  const expectedOrder = [...folderOrder].sort();
  assert.deepEqual(folderOrder, expectedOrder);
  assert.equal(folderOrder[0], "BeaverBlade");

  const firstDifferentFolder = items.findIndex((item) => item.folderPath.split("/")[0] !== folderOrder[0]);
  assert.ok(firstDifferentFolder > 0);
  assert.ok(items.slice(firstDifferentFolder).every((item) => item.folderPath.split("/")[0] !== folderOrder[0]));
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

test("gallery initializer documents source and generated output paths", async () => {
  const script = await readText("scripts/init-gallery.mjs");
  const packageJson = JSON.parse(await readText("package.json"));

  assert.match(script, /SOURCE_DEFAULT/);
  assert.match(script, /from "sharp"/);
  assert.match(script, /THUMBNAIL_WIDTH = 480/);
  assert.match(script, /FULL_IMAGE_MAX_WIDTH = 1600/);
  assert.match(script, /assets\/gallery\/thumbs/);
  assert.match(script, /assets\/gallery\/full/);
  assert.match(script, /assets\/data\/gallery-manifest\.json/);
  assert.match(script, /depth-first/i);
  assert.ok(packageJson.devDependencies.sharp);
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
  assert.match(script, /closest\("\.lightbox-panel, \.lightbox-nav, \.lightbox-close"\)/);
  assert.doesNotMatch(script, /\.sort\(/);
  assert.match(script, /document\.addEventListener\("keydown"/);
});

test("site stylesheet defines paper and print behavior", async () => {
  const css = await readText("assets/css/site.css");

  assert.match(css, /\.resume-sheet/);
  assert.match(css, /\.brand-glyph/);
  assert.match(css, /\.brand-chevron/);
  assert.match(css, /width: 22px/);
  assert.match(css, /border-radius: 999px/);
  assert.match(css, /\.context-link/);
  assert.match(css, /\.gallery-grid/);
  assert.match(css, /grid-template-columns: repeat\(var\(--gallery-columns, 1\), minmax\(0, 1fr\)\)/);
  assert.match(css, /\.gallery-column/);
  assert.doesNotMatch(css, /column-width/);
  assert.match(css, /0 20px 46px rgba\(15, 23, 42, 0\.22\)/);
  assert.match(css, /\.gallery-card:hover/);
  assert.match(css, /\.lightbox/);
  assert.match(css, /\.lightbox-nav/);
  assert.match(css, /object-fit: contain/);
  assert.match(css, /font-family: "Nunito Sans"/);
  assert.match(css, /font-size: 12px/);
  assert.match(css, /@media print/);
  assert.match(css, /font-family: "Noto Serif SC"/);
  assert.match(css, /overflow-wrap: anywhere/);
});
