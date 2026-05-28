import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { copyFile, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegPath from "ffmpeg-static";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const USAGE = "Usage: npm run gallery:init -- --gallery-source <directory> --resume-pdf-source <pdf>";
const OPTIONS = parseArguments(process.argv.slice(2));
const SOURCE_DIR = path.resolve(OPTIONS.gallerySource);
const RESUME_PDF_SOURCE = path.resolve(OPTIONS.resumePdfSource);
const RESUME_PDF_OUTPUT_RELATIVE = "assets/data/resume.pdf";
const RESUME_PDF_OUTPUT = path.join(ROOT, ...RESUME_PDF_OUTPUT_RELATIVE.split("/"));
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
const VIDEO_POSTER_FORMAT = "webp";
const VIDEO_POSTER_CAPTURE_TIME = "00:00:00.200";
const VIDEO_OUTPUT_EXTENSION = ".mp4";
const VIDEO_FULL_MAX_DIMENSION = 1280;
const VIDEO_OUTPUT_FPS = 30;
const VIDEO_CRF = "30";
const VIDEO_PRESET = "medium";
const SOURCE_HASH_ALGORITHM = "md5";
const MANIFEST_CONFIG = {
  imageFormat: "webp",
  thumbnailWidth: THUMBNAIL_WIDTH,
  thumbnailQuality: THUMBNAIL_QUALITY,
  fullImageMaxWidth: FULL_IMAGE_MAX_WIDTH,
  fullImageQuality: FULL_IMAGE_QUALITY,
  videoPosterFormat: VIDEO_POSTER_FORMAT,
  videoPosterCaptureTime: VIDEO_POSTER_CAPTURE_TIME,
  videoOutputExtension: VIDEO_OUTPUT_EXTENSION,
  videoFullMaxDimension: VIDEO_FULL_MAX_DIMENSION,
  videoOutputFps: VIDEO_OUTPUT_FPS,
  videoCrf: VIDEO_CRF,
  videoPreset: VIDEO_PRESET,
  sourceHashAlgorithm: SOURCE_HASH_ALGORITHM,
};

await assertDirectory(SOURCE_DIR);
const previousManifest = await readPreviousManifest();
const previousManifestIndex = createPreviousManifestIndex(previousManifest);
const galleryBuildDir = await createGalleryBuildDirectory();
const outputFullDir = path.join(galleryBuildDir, "full");
const outputThumbDir = path.join(galleryBuildDir, "thumbs");
const items = [];
let reusedCount = 0;
let processedCount = 0;
let generationSucceeded = false;

try {
  await mkdir(outputFullDir, { recursive: true });
  await mkdir(outputThumbDir, { recursive: true });
  await mkdir(path.dirname(MANIFEST_PATH), { recursive: true });
  await copyResumePdf();

  await walkDepthFirst(SOURCE_DIR, []);

  const manifest = {
    generatedAt: new Date().toISOString(),
    source: path.relative(ROOT, SOURCE_DIR).split(path.sep).join("/"),
    config: MANIFEST_CONFIG,
    cache: {
      reusedItems: reusedCount,
      processedItems: processedCount,
    },
    items,
  };

  await publishGalleryBuild(galleryBuildDir);
  await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  generationSucceeded = true;

  console.log(`Generated ${items.length} gallery items from ${SOURCE_DIR}`);
  console.log(`Reused ${reusedCount} cached gallery items; processed ${processedCount}.`);
  console.log(`Copied resume PDF from ${RESUME_PDF_SOURCE}`);
} finally {
  await cleanupGalleryBuild(galleryBuildDir, generationSucceeded);
}

function parseArguments(args) {
  const options = {};

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];

    if (argument === "--gallery-source") {
      options.gallerySource = readOptionValue(args, index + 1, argument);
      index += 1;
      continue;
    }

    if (argument === "--resume-pdf-source") {
      options.resumePdfSource = readOptionValue(args, index + 1, argument);
      index += 1;
      continue;
    }

    throw new Error(`${USAGE}\nUnknown argument: ${argument}`);
  }

  if (!options.gallerySource || !options.resumePdfSource) {
    throw new Error(USAGE);
  }

  return options;
}

function readOptionValue(args, index, option) {
  const value = args[index];
  if (!value || value.startsWith("--")) {
    throw new Error(`${USAGE}\nMissing value for ${option}`);
  }

  return value;
}

async function assertDirectory(directory) {
  const directoryStat = await stat(directory);
  if (!directoryStat.isDirectory()) {
    throw new Error(`Gallery source is not a directory: ${directory}`);
  }
}

async function copyResumePdf() {
  const pdfStat = await stat(RESUME_PDF_SOURCE);
  if (!pdfStat.isFile()) {
    throw new Error(`Resume PDF source is not a file: ${RESUME_PDF_SOURCE}`);
  }

  await copyFile(RESUME_PDF_SOURCE, RESUME_PDF_OUTPUT);
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
  const sourceFile = await createSourceFileInfo(sourcePath, sourceStat);

  const cachedItem = await tryReuseCachedMedia(type, sourceFile, segments, fileName);
  if (cachedItem) {
    items.push(cachedItem);
    reusedCount += 1;
    return;
  }

  processedCount += 1;

  if (type === "image") {
    await addImageFile(sourcePath, segments, fileName, sourceStat.size, sourceFile);
    return;
  }

  await addVideoFile(sourcePath, segments, fileName, sourceStat.size, sourceFile);
}

async function addImageFile(sourcePath, segments, fileName, bytes, sourceFile) {
  const { fullPath, thumbPath, fullSitePath, thumbSitePath } = createImageOutputPaths(segments, fileName);

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
    ...createBaseItem(segments, fileName, "image", bytes, sourceFile),
    src: fullSitePath,
    thumb: thumbSitePath,
    poster: null,
    width: fullInfo.width,
    height: fullInfo.height,
    thumbWidth: thumbInfo.width,
    thumbHeight: thumbInfo.height,
    fullBytes: fullInfo.size,
    thumbBytes: thumbInfo.size,
  });
}

async function addVideoFile(sourcePath, segments, fileName, bytes, sourceFile) {
  const { outputPath, posterPath, outputSitePath, posterSitePath } = createVideoOutputPaths(segments, fileName);

  await mkdir(path.dirname(outputPath), { recursive: true });
  await mkdir(path.dirname(posterPath), { recursive: true });
  await compressVideo(sourcePath, outputPath);

  const outputStat = await stat(outputPath);
  const posterInfo = await createVideoPoster(outputPath, posterPath);

  items.push({
    ...createBaseItem(segments, fileName, "video", bytes, sourceFile),
    src: outputSitePath,
    thumb: posterSitePath,
    poster: posterSitePath,
    width: posterInfo.width,
    height: posterInfo.height,
    thumbWidth: posterInfo.thumbWidth,
    thumbHeight: posterInfo.thumbHeight,
    fullBytes: outputStat.size,
    thumbBytes: posterInfo.thumbBytes,
  });
}

async function compressVideo(sourcePath, outputPath) {
  if (!ffmpegPath) {
    throw new Error("ffmpeg-static did not provide an ffmpeg binary for this platform.");
  }

  await runFfmpeg([
    "-y",
    "-i",
    sourcePath,
    "-map",
    "0:v:0",
    "-an",
    "-vf",
    `fps=${VIDEO_OUTPUT_FPS},scale=w=min(${VIDEO_FULL_MAX_DIMENSION}\\,iw):h=min(${VIDEO_FULL_MAX_DIMENSION}\\,ih):force_original_aspect_ratio=decrease:force_divisible_by=2`,
    "-c:v",
    "libx264",
    "-preset",
    VIDEO_PRESET,
    "-crf",
    VIDEO_CRF,
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    outputPath,
  ]);
}

async function createVideoPoster(sourcePath, posterPath) {
  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "resume-gallery-"));
  const framePath = path.join(temporaryDirectory, "poster-source.jpg");

  try {
    await extractVideoFrame(sourcePath, framePath);

    const frameMetadata = await sharp(framePath).metadata();
    const thumbInfo = await sharp(framePath)
      .resize({
        width: THUMBNAIL_WIDTH,
        height: THUMBNAIL_WIDTH,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: THUMBNAIL_QUALITY, effort: 4 })
      .toFile(posterPath);

    return {
      width: frameMetadata.width ?? thumbInfo.width,
      height: frameMetadata.height ?? thumbInfo.height,
      thumbWidth: thumbInfo.width,
      thumbHeight: thumbInfo.height,
      thumbBytes: thumbInfo.size,
    };
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
}

async function extractVideoFrame(sourcePath, framePath) {
  if (!ffmpegPath) {
    throw new Error("ffmpeg-static did not provide an ffmpeg binary for this platform.");
  }

  await runFfmpeg([
    "-y",
    "-ss",
    VIDEO_POSTER_CAPTURE_TIME,
    "-i",
    sourcePath,
    "-frames:v",
    "1",
    "-q:v",
    "2",
    framePath,
  ]);
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`ffmpeg exited with code ${code}: ${stderr.trim()}`));
    });
  });
}

async function readPreviousManifest() {
  try {
    return JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT" || error instanceof SyntaxError) {
      return null;
    }

    throw error;
  }
}

function createPreviousManifestIndex(manifest) {
  const index = new Map();
  if (!manifestConfigMatches(manifest?.config) || !Array.isArray(manifest?.items)) {
    return index;
  }

  for (const item of manifest.items) {
    if (!item?.sourceFile || !item.type) {
      continue;
    }

    const cacheKey = createSourceCacheKey(item.type, item.sourceFile);
    if (cacheKey && !index.has(cacheKey)) {
      index.set(cacheKey, item);
    }
  }

  return index;
}

function manifestConfigMatches(config) {
  if (!config) {
    return false;
  }

  return Object.entries(MANIFEST_CONFIG).every(([key, value]) => config[key] === value);
}

async function createGalleryBuildDirectory() {
  await mkdir(path.dirname(GALLERY_DIR), { recursive: true });
  return mkdtemp(path.join(path.dirname(GALLERY_DIR), ".gallery-build-"));
}

async function publishGalleryBuild(buildDirectory) {
  await retryFileOperation(() => rm(GALLERY_DIR, { force: true, recursive: true }));
  await retryFileOperation(() => rename(buildDirectory, GALLERY_DIR));
}

async function cleanupGalleryBuild(buildDirectory, generationSucceeded) {
  if (!generationSucceeded) {
    await rm(buildDirectory, { force: true, recursive: true });
  }
}

async function retryFileOperation(operation) {
  let lastError;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!["EBUSY", "ENOTEMPTY", "EPERM"].includes(error.code)) {
        throw error;
      }

      await new Promise((resolve) => {
        setTimeout(resolve, 250 * (attempt + 1));
      });
    }
  }

  throw lastError;
}

async function createSourceFileInfo(sourcePath, sourceStat) {
  return {
    path: path.relative(SOURCE_DIR, sourcePath).split(path.sep).join("/"),
    bytes: sourceStat.size,
    mtimeMs: sourceStat.mtimeMs,
    hashAlgorithm: SOURCE_HASH_ALGORITHM,
    md5: await hashFile(sourcePath),
  };
}

function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash(SOURCE_HASH_ALGORITHM);
    const stream = createReadStream(filePath);

    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function tryReuseCachedMedia(type, sourceFile, segments, fileName) {
  const previousItem = previousManifestIndex.get(createSourceCacheKey(type, sourceFile));
  if (!previousItem) {
    return null;
  }

  if (type === "image") {
    return tryReuseCachedImage(previousItem, sourceFile, segments, fileName);
  }

  return tryReuseCachedVideo(previousItem, sourceFile, segments, fileName);
}

async function tryReuseCachedImage(previousItem, sourceFile, segments, fileName) {
  const { fullPath, thumbPath, fullSitePath, thumbSitePath } = createImageOutputPaths(segments, fileName);
  const fullStat = await copyCachedOutput(previousItem.src, fullPath);
  const thumbStat = await copyCachedOutput(previousItem.thumb, thumbPath);

  if (!fullStat || !thumbStat) {
    await rm(fullPath, { force: true });
    await rm(thumbPath, { force: true });
    return null;
  }

  return {
    ...createBaseItem(segments, fileName, "image", sourceFile.bytes, sourceFile),
    src: fullSitePath,
    thumb: thumbSitePath,
    poster: null,
    width: previousItem.width,
    height: previousItem.height,
    thumbWidth: previousItem.thumbWidth,
    thumbHeight: previousItem.thumbHeight,
    fullBytes: fullStat.size,
    thumbBytes: thumbStat.size,
  };
}

async function tryReuseCachedVideo(previousItem, sourceFile, segments, fileName) {
  const { outputPath, posterPath, outputSitePath, posterSitePath } = createVideoOutputPaths(segments, fileName);
  const fullStat = await copyCachedOutput(previousItem.src, outputPath);
  const thumbStat = await copyCachedOutput(previousItem.poster ?? previousItem.thumb, posterPath);

  if (!fullStat || !thumbStat) {
    await rm(outputPath, { force: true });
    await rm(posterPath, { force: true });
    return null;
  }

  return {
    ...createBaseItem(segments, fileName, "video", sourceFile.bytes, sourceFile),
    src: outputSitePath,
    thumb: posterSitePath,
    poster: posterSitePath,
    width: previousItem.width,
    height: previousItem.height,
    thumbWidth: previousItem.thumbWidth,
    thumbHeight: previousItem.thumbHeight,
    fullBytes: fullStat.size,
    thumbBytes: thumbStat.size,
  };
}

async function copyCachedOutput(sitePath, outputPath) {
  if (!sitePath?.startsWith(`${GENERATED_GALLERY_ROOT}/`)) {
    return null;
  }

  const relativePath = sitePath.slice(GENERATED_GALLERY_ROOT.length + 1);
  const cachedPath = path.join(GALLERY_DIR, ...relativePath.split("/"));

  try {
    const cachedStat = await stat(cachedPath);
    if (!cachedStat.isFile() || cachedStat.size <= 0) {
      return null;
    }

    await mkdir(path.dirname(outputPath), { recursive: true });
    await copyFile(cachedPath, outputPath);
    return stat(outputPath);
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

function createImageOutputPaths(segments, fileName) {
  const outputFileName = `${path.basename(fileName, path.extname(fileName))}.webp`;
  const fullSitePath = toSitePath(path.join(FULL_DIR, ...segments, outputFileName));
  const thumbSitePath = toSitePath(path.join(THUMB_DIR, ...segments, outputFileName));

  return {
    fullPath: path.join(outputFullDir, ...segments, outputFileName),
    thumbPath: path.join(outputThumbDir, ...segments, outputFileName),
    fullSitePath,
    thumbSitePath,
  };
}

function createVideoOutputPaths(segments, fileName) {
  const outputFileName = `${path.basename(fileName, path.extname(fileName))}${VIDEO_OUTPUT_EXTENSION}`;
  const posterFileName = `${path.basename(fileName, path.extname(fileName))}.${VIDEO_POSTER_FORMAT}`;
  const outputSitePath = toSitePath(path.join(FULL_DIR, ...segments, outputFileName));
  const posterSitePath = toSitePath(path.join(THUMB_DIR, ...segments, posterFileName));

  return {
    outputPath: path.join(outputFullDir, ...segments, outputFileName),
    posterPath: path.join(outputThumbDir, ...segments, posterFileName),
    outputSitePath,
    posterSitePath,
  };
}

function createSourceCacheKey(type, sourceFile) {
  if (
    sourceFile?.hashAlgorithm !== SOURCE_HASH_ALGORITHM ||
    !sourceFile.md5 ||
    typeof sourceFile.bytes !== "number"
  ) {
    return null;
  }

  return `${type}:${sourceFile.bytes}:${sourceFile.md5}`;
}

function createBaseItem(segments, fileName, type, bytes, sourceFile) {
  return {
    id: createId([...segments, fileName].join("/")),
    type,
    folder: segments.at(-1) ?? "Gallery",
    folderPath: segments.join("/"),
    title: path.basename(fileName, path.extname(fileName)).replaceAll("_", " "),
    bytes,
    sourceFile,
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
