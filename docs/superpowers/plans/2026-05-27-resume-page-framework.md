# Resume Page Framework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first static-site framework and the `resume.html` page for the GitHub Pages repository.

**Architecture:** Use plain HTML, CSS, and a tiny Node built-in test suite. `resume.html` is the public resume document, `gallery.html` is a lightweight placeholder target for the contextual link, and `assets/css/site.css` owns the shared page styling.

**Tech Stack:** Static HTML5, CSS3, Node.js built-in test runner.

---

### Task 1: Static Page Contract Tests

**Files:**
- Create: `package.json`
- Create: `tests/site.test.mjs`

- [ ] **Step 1: Write the failing tests**

```js
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
  assert.match(html, /张亨/);
  assert.match(html, /U3D开发工程师/);
  assert.match(html, /南京江尚数字科技有限公司/);
  assert.match(html, /Beaver Blade/);
  assert.match(html, /AI Coding/);
  assert.doesNotMatch(html, /<nav\b/i);
});

test("resume page keeps the minimal resume section model", async () => {
  const html = await readText("resume.html");
  const sections = ["基本信息", "工作经历", "作品展示", "教育经历"];

  for (const section of sections) {
    assert.match(html, new RegExp(`<h2>${section}</h2>`));
  }

  assert.match(html, /class="resume-sheet"/);
  assert.match(html, /class="section-rule"/);
});

test("gallery placeholder keeps only contextual navigation", async () => {
  const html = await readText("gallery.html");

  assert.match(html, /GAME DEV GALLERY/);
  assert.match(html, /href="resume\.html"/);
  assert.doesNotMatch(html, /<nav\b/i);
});

test("site stylesheet defines paper and print behavior", async () => {
  const css = await readText("assets/css/site.css");

  assert.match(css, /\.resume-sheet/);
  assert.match(css, /\.context-link/);
  assert.match(css, /@media print/);
  assert.match(css, /font-family: Georgia/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`

Expected: `ERR_MODULE_NOT_FOUND` or `ENOENT` for `resume.html`, because production files do not exist yet.

### Task 2: Resume Static Framework

**Files:**
- Create: `resume.html`
- Create: `gallery.html`
- Create: `assets/css/site.css`

- [ ] **Step 1: Create the minimal HTML/CSS implementation**

Implement:

- `resume.html` with a paper-like resume layout, contextual `View Gallery` link, PDF download link, and content rebuilt from the current resume document.
- `gallery.html` placeholder with `GAME DEV GALLERY` and contextual `Back to Resume` link.
- `assets/css/site.css` with shared background, typography, resume sheet, section rules, compact experience rows, responsive behavior, and print rules.

- [ ] **Step 2: Run tests to verify they pass**

Run: `npm test`

Expected: all 4 tests pass.

### Task 3: Browser Verification

**Files:**
- No new files.

- [ ] **Step 1: Start a static server**

Run: `python -m http.server 8000`

Expected: local static server starts from the repository root.

- [ ] **Step 2: Open `resume.html` in the browser**

Open: `http://localhost:8000/resume.html`

Expected:

- The page uses a minimal white paper resume style.
- The page title and main name are `张亨`.
- The top contextual link points to `gallery.html`.
- There is no global navigation bar.

- [ ] **Step 3: Verify responsive layout**

Check desktop and mobile viewport behavior.

Expected:

- Text remains readable.
- Resume sheet does not overflow the viewport.
- Context links do not overlap the resume content.

### Task 4: Git Review

**Files:**
- Review all changed files.

- [ ] **Step 1: Run status and diff**

Run:

```bash
git status -sb
git diff --stat
```

Expected: only the planned static-site and test files are changed.

