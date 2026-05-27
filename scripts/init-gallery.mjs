import { createHash } from "node:crypto";
import { copyFile, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_DEFAULT = path.resolve(ROOT, "..", "gallery");
const SOURCE_DIR = path.resolve(process.argv[2] ?? SOURCE_DEFAULT);
const GENERATED_GALLERY_ROOT = "assets/gallery";
const GENERATED_FULL_ROOT = "assets/gallery/full";
const GENERATED_THUMB_ROOT = "assets/gallery/thumbs";
const GENERATED_MANIFEST = "assets/data/gallery-manifest.json";
const GALLERY_DIR = path.join(ROOT, ...GENERATED_GALLERY_ROOT.split("/"));
const FULL_DIR = path.join(ROOT, ...GENERATED_FULL_ROOT.split("/"));
const THUMB_DIR = path.join(ROOT, ...GENERATED_THUMB_ROOT.split("/"));
const MANIFEST_PATH = path.join(ROOT, ...GENERATED_MANIFEST.split("/"));
const IMAGE_EXTENSIONS = new Set([".avif", ".gif", ".jpeg", ".jpg", ".png", ".webp"]);
const VIDEO_EXTENSIONS = new Set([".m4v", ".mov", ".mp4", ".webm"]);
const THUMBNAIL_WIDTH = 480;
const THUMBNAIL_QUALITY = 72;
const FULL_IMAGE_MAX_WIDTH = 1600;
const FULL_IMAGE_QUALITY = 84;

await assertDirectory(SOURCE_DIR);
await rm(GALLERY_DIR, { force: true, recursive: true });
await mkdir(FULL_DIR, { recursive: true });
await mkdir(THUMB_DIR, { recursive: true });
await mkdir(path.dirname(MANIFEST_PATH), { recursive: true });

const items = [];

await walkDepthFirst(SOURCE_DIR, []);

const manifest = {
  generatedAt: new Date().toISOString(),
  source: path.relative(ROOT, SOURCE_DIR).split(path.sep).join("/"),
  config: {
    imageFormat: "webp",
    thumbnailWidth: THUMBNAIL_WIDTH,
    thumbnailQuality: THUMBNAIL_QUALITY,
    fullImageMaxWidth: FULL_IMAGE_MAX_WIDTH,
    fullImageQuality: FULL_IMAGE_QUALITY,
  },
  items,
};

await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Generated ${items.length} gallery items from ${SOURCE_DIR}`);

async function assertDirectory(directory) {
  const directoryStat = await stat(directory);
  if (!directoryStat.isDirectory()) {
    throw new Error(`Gallery source is not a directory: ${directory}`);
  }
}

// Depth-first traversal: each directory is completed before moving to its sorted siblings.
async function walkDepthFirst(directory, segments) {
  const entries = await readdir(directory, { withFileTypes: true });
  const directories = entries.filter((entry) => entry.isDirectory()).sort(compareEntries);
  const files = entries.filter((entry) => entry.isFile() && getMediaType(entry.name)).sort(compareEntries);

  for (const file of files) {
    await addMediaFile(directory, segments, file.name);
  }

  for (const childDirectory of directories) {
    await walkDepthFirst(path.join(directory, childDirectory.name), [...segments, childDirectory.name]);
  }
}

async function addMediaFile(directory, segments, fileName) {
  const type = getMediaType(fileName);
  const sourcePath = path.join(directory, fileName);
  const sourceStat = await stat(sourcePath);

  if (type === "image") {
    await addImageFile(sourcePath, segments, fileName, sourceStat.size);
    return;
  }

  await addVideoFile(sourcePath, segments, fileName, sourceStat.size);
}

async function addImageFile(sourcePath, segments, fileName, bytes) {
  const outputFileName = `${path.basename(fileName, path.extname(fileName))}.webp`;
  const fullPath = path.join(FULL_DIR, ...segments, outputFileName);
  const thumbPath = path.join(THUMB_DIR, ...segments, outputFileName);

  await mkdir(path.dirname(fullPath), { recursive: true });
  await mkdir(path.dirname(thumbPath), { recursive: true });

  const fullInfo = await sharp(sourcePath)
    .rotate()
    .resize({
      width: FULL_IMAGE_MAX_WIDTH,
      height: FULL_IMAGE_MAX_WIDTH,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: FULL_IMAGE_QUALITY, effort: 4 })
    .toFile(fullPath);

  const thumbInfo = await sharp(sourcePath)
    .rotate()
    .resize({
      width: THUMBNAIL_WIDTH,
      height: THUMBNAIL_WIDTH,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: THUMBNAIL_QUALITY, effort: 4 })
    .toFile(thumbPath);

  items.push({
    ...createBaseItem(segments, fileName, "image", bytes),
    src: toSitePath(fullPath),
    thumb: toSitePath(thumbPath),
    poster: null,
    width: fullInfo.width,
    height: fullInfo.height,
    thumbWidth: thumbInfo.width,
    thumbHeight: thumbInfo.height,
    fullBytes: fullInfo.size,
    thumbBytes: thumbInfo.size,
  });
}

async function addVideoFile(sourcePath, segments, fileName, bytes) {
  const outputPath = path.join(FULL_DIR, ...segments, fileName);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await copyFile(sourcePath, outputPath);

  items.push({
    ...createBaseItem(segments, fileName, "video", bytes),
    src: toSitePath(outputPath),
    thumb: null,
    poster: null,
    width: null,
    height: null,
    thumbWidth: null,
    thumbHeight: null,
    fullBytes: bytes,
    thumbBytes: null,
  });
}

function createBaseItem(segments, fileName, type, bytes) {
  return {
    id: createId([...segments, fileName].join("/")),
    type,
    folder: segments.at(-1) ?? "Gallery",
    folderPath: segments.join("/"),
    title: path.basename(fileName, path.extname(fileName)).replaceAll("_", " "),
    bytes,
  };
}

function toSitePath(absolutePath) {
  return path.relative(ROOT, absolutePath).split(path.sep).join("/");
}

function getMediaType(fileName) {
  const extension = path.extname(fileName).toLowerCase();

  if (IMAGE_EXTENSIONS.has(extension)) {
    return "image";
  }

  if (VIDEO_EXTENSIONS.has(extension)) {
    return "video";
  }

  return null;
}

function createId(relativePath) {
  const hash = createHash("sha1").update(relativePath).digest("hex").slice(0, 8);
  const slug = path
    .basename(relativePath, path.extname(relativePath))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return `${slug || "gallery-item"}-${hash}`;
}

function compareEntries(a, b) {
  return a.name === b.name ? 0 : a.name < b.name ? -1 : 1;
}
