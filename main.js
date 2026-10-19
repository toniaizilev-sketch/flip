"use strict";

const { app, BrowserWindow, ipcMain } = require("electron");
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const os = require("os");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

const wordCache = new Map();

const VERSION = require("./package.json").version;

const IMAGE_EXTS = new Set([
  ".jpg", ".jpeg", ".jfif", ".png", ".gif",
  ".webp", ".bmp", ".svg", ".avif",
]);

// ---- CLI args ----
function parseArgs(argv, defaultRoot) {
  let root = defaultRoot;
  let single = false;
  let read = false;
  let slideshow = false;
  // Only parse args after the "--" separator: everything before it (electron
  // binary, injected Chromium flags, app path) is not ours.
  const sep = argv.indexOf("--");
  if (sep !== -1) argv = argv.slice(sep + 1);
  for (const a of argv) {
    if (a === "-s" || a === "--single") single = true;
    else if (a === "-r" || a === "--read") { single = true; read = true; }
    else if (a === "--slideshow") { single = true; slideshow = true; }
    else if (a === "--version" || a === "-V") return { version: true };
    else if (a === "-h" || a === "--help") return { help: true };
    else if (a.startsWith("-")) continue; // ignore unknown flags
    else root = a;
  }
  return { root, single, read, slideshow };
}

function expandTilde(p) {
  if (p === "~") return os.homedir();
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

function readConfig() {
  const cfg = { root: "", windowSize: "", titleFlash: "" };
  const file = process.env.FLIP_CONFIG || path.join(os.homedir(), ".config", "flip", "config");
  let text = "";
  try { text = fs.readFileSync(file, "utf8"); } catch { return cfg; }
  for (const line of text.split("\n")) {
    const idx = line.indexOf("=");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim();
    if (key === "root") cfg.root = val;
    else if (key === "window_size") cfg.windowSize = val;
    else if (key === "title_flash") cfg.titleFlash = val;
  }
  return cfg;
}

function stateFile() {
  return process.env.FLIP_STATE || path.join(os.homedir(), ".config", "flip", "state.json");
}

function readState() {
  try {
    const data = JSON.parse(fs.readFileSync(stateFile(), "utf8"));
    return data && typeof data === "object" && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

function parseWindowSize(s) {
  const m = String(s || "").match(/(\d+)\s*[x,]\s*(\d+)/);
  if (m) return { width: parseInt(m[1], 10), height: parseInt(m[2], 10) };
  return { width: 1280, height: 840 };
}

function parseTitleFlash(s) {
  const n = parseInt(String(s || "").trim(), 10);
  return isNaN(n) ? 1500 : Math.max(0, n);
}

// ---- natural sort (approximates `sort -V -f`) ----
function naturalKey(s) {
  return s.toLowerCase().split(/(\d+)/).map((p) =>
    /^\d+$/.test(p) ? String(Number(p)).padStart(20, "0") : p
  );
}
function sortNatural(list) {
  return list.sort((a, b) => {
    const ka = naturalKey(a), kb = naturalKey(b);
    for (let i = 0; i < Math.max(ka.length, kb.length); i++) {
      const x = ka[i] || "", y = kb[i] || "";
      if (x < y) return -1;
      if (x > y) return 1;
    }
    return 0;
  });
}

// ---- xattr ----
async function getXattr(dir, name) {
  try {
    const { stdout } = await execFileAsync("getfattr", ["--only-values", "-n", name, dir]);
    return stdout;
  } catch {
    return "";
  }
}

async function getAllXattrs(dir) {
  try {
    const { stdout } = await execFileAsync("getfattr", ["-d", "--absolute-names", dir]);
    const attrs = {};
    for (const line of stdout.split("\n")) {
      const m = line.match(/^user\.([^=]+)="(.*)"\s*$/);
      if (m) attrs["user." + m[1]] = m[2];
    }
    return attrs;
  } catch {
    return {};
  }
}

async function setXattr(dir, name, value) {
  if (value) {
    await execFileAsync("setfattr", ["-n", name, "-v", value, dir]);
  } else {
    try { await execFileAsync("setfattr", ["-x", name, dir]); } catch { /* already absent */ }
  }
}

async function getWordCount(imagePath) {
  if (wordCache.has(imagePath)) return wordCache.get(imagePath);
  let words = 0;
  try {
    const { stdout } = await execFileAsync("tesseract", [imagePath, "stdout"], { timeout: 15000 });
    words = stdout.trim().split(/\s+/).filter(Boolean).length;
  } catch { /* tesseract missing or failed */ }
  wordCache.set(imagePath, words);
  return words;
}

// ---- discovery ----
async function findImages(dir) {
  const out = [];
  async function walk(d) {
    const entries = await fsp.readdir(d, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        if (IMAGE_EXTS.has(path.extname(entry.name).toLowerCase())) out.push(full);
      } else if (entry.isSymbolicLink()) {
        try {
          const st = await fsp.stat(full); // follow, like -xtype f
          if (st.isFile() && IMAGE_EXTS.has(path.extname(entry.name).toLowerCase())) out.push(full);
        } catch { /* broken symlink */ }
      }
    }
  }
  await walk(dir);
  return out;
}

async function listSubdirs(dir) {
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  return entries
    .filter((e) => !e.name.startsWith(".") && e.isDirectory())
    .map((e) => path.join(dir, e.name));
}

async function discoverComic(dir, id) {
  const attrs = await getAllXattrs(dir);
  const title = attrs["user.zine.title"] || path.basename(dir);
  const author = attrs["user.zine.author"] || "";
  const tags = (attrs["user.xdg.tags"] || "").split(",").map((t) => t.trim()).filter(Boolean);
  const url = attrs["user.zine.url"] || "";
  const starred = !!attrs["user.zine.starred"];
  const imgs = sortNatural(await findImages(dir)).map((img) => path.relative(dir, img));
  let date = 0;
  try { date = (await fsp.stat(dir)).mtimeMs; } catch { /* ignore */ }
  return { id, dir, title, author, tags, url, date, starred, imgs };
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = [];
  const n = Math.min(limit, items.length);
  for (let w = 0; w < n; w++) {
    workers.push((async () => {
      while (true) {
        const idx = i++;
        if (idx >= items.length) break;
        out[idx] = await fn(items[idx], idx);
      }
    })());
  }
  await Promise.all(workers);
  return out;
}

// ---- app ----
let win = null;

app.whenReady().then(() => {
  const cfg = readConfig();
  const winSize = parseWindowSize(process.env.FLIP_WINDOW_SIZE || cfg.windowSize);
  const titleFlash = parseTitleFlash(cfg.titleFlash);
  const args = parseArgs(process.argv.slice(2), process.env.FLIP_ROOT || cfg.root);

  if (args.version) {
    console.log("flip " + VERSION);
    app.quit();
    return;
  }
  if (args.help) {
    console.log("usage: flip [--single|--read|--slideshow|--version] DIR");
    app.quit();
    return;
  }
  if (!args.root) {
    console.error("no root configured — edit ~/.config/flip/config and set root to your comics directory");
    app.quit();
    return;
  }
  args.root = expandTilde(args.root);
  let st = null;
  try { st = fs.statSync(args.root); } catch { /* missing */ }
  if (!st || !st.isDirectory()) {
    console.error("not a directory: " + args.root + "\nSet a valid root in ~/.config/flip/config");
    app.quit();
    return;
  }
  args.root = path.resolve(args.root);

  win = new BrowserWindow({
    width: winSize.width,
    height: winSize.height,
    autoHideMenuBar: true,
    backgroundColor: "#111111",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      webSecurity: false, // allow the file:// page to load file:// images
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, "renderer", "viewer.html"));

  ipcMain.on("flip:ready", async () => {
    try {
      const dirs = args.single ? [args.root] : sortNatural(await listSubdirs(args.root));
      const comics = await mapLimit(dirs, 8, (d, id) => discoverComic(d, id));
      for (const c of comics) {
        if (!win || win.isDestroyed()) return;
        win.webContents.send("flip:comic", c);
      }
      if (win && !win.isDestroyed()) {
        win.webContents.send("flip:done", { autoRead: args.read, state: readState(), titleFlash: titleFlash, slideshow: args.slideshow });
      }
    } catch (e) {
      if (win && !win.isDestroyed()) {
        win.webContents.send("flip:done", { error: (e && e.message) || String(e) });
      }
    }
  });

  ipcMain.on("flip:saveState", (_e, state) => {
    try {
      fs.mkdirSync(path.dirname(stateFile()), { recursive: true });
      fs.writeFileSync(stateFile(), JSON.stringify(state));
    } catch { /* ignore */ }
  });

  ipcMain.on("flip:saveMeta", async (_e, meta) => {
    try {
      await setXattr(meta.dir, "user.zine.title", meta.title);
      await setXattr(meta.dir, "user.zine.author", meta.author);
      await setXattr(meta.dir, "user.xdg.tags", (meta.tags || []).join(","));
      await setXattr(meta.dir, "user.zine.url", meta.url);
      await setXattr(meta.dir, "user.zine.status", "manual");
    } catch (e) {
      console.error("flip:saveMeta:", e && e.message);
    }
  });

  ipcMain.on("flip:star", async (_e, { dir, starred }) => {
    try {
      await setXattr(dir, "user.zine.starred", starred ? "1" : "");
    } catch (e) {
      console.error("flip:star:", e && e.message);
    }
  });

  ipcMain.handle("flip:wordCount", async (_e, imagePath) => {
    return await getWordCount(imagePath);
  });
});

app.on("window-all-closed", () => app.quit());
