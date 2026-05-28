import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
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

await assertDirectory(SOURCE_DIR);
await rm(GALLERY_DIR, { force: true, recursive: true });
await mkdir(FULL_DIR, { recursive: true });
await mkdir(THUMB_DIR, { recursive: true });
await mkdir(path.dirname(MANIFEST_PATH), { recursive: true });
await copyResumePdf();

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
    videoPosterFormat: VIDEO_POSTER_FORMAT,
    videoPosterCaptureTime: VIDEO_POSTER_CAPTURE_TIME,
    videoOutputExtension: VIDEO_OUTPUT_EXTENSION,
    videoFullMaxDimension: VIDEO_FULL_MAX_DIMENSION,
    videoOutputFps: VIDEO_OUTPUT_FPS,
    videoCrf: VIDEO_CRF,
    videoPreset: VIDEO_PRESET,
  },
  items,
};

await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Generated ${items.length} gallery items from ${SOURCE_DIR}`);
console.log(`Copied resume PDF from ${RESUME_PDF_SOURCE}`);

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
  const outputFileName = `${path.basename(fileName, path.extname(fileName))}${VIDEO_OUTPUT_EXTENSION}`;
  const outputPath = path.join(FULL_DIR, ...segments, outputFileName);
  const posterFileName = `${path.basename(fileName, path.extname(fileName))}.${VIDEO_POSTER_FORMAT}`;
  const posterPath = path.join(THUMB_DIR, ...segments, posterFileName);

  await mkdir(path.dirname(outputPath), { recursive: true });
  await mkdir(path.dirname(posterPath), { recursive: true });
  await compressVideo(sourcePath, outputPath);

  const outputStat = await stat(outputPath);
  const posterInfo = await createVideoPoster(outputPath, posterPath);

  items.push({
    ...createBaseItem(segments, fileName, "video", bytes),
    src: toSitePath(outputPath),
    thumb: toSitePath(posterPath),
    poster: toSitePath(posterPath),
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
