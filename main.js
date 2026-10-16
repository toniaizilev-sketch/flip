"use strict";

const { app, BrowserWindow, ipcMain } = require("electron");
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const os = require("os");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

const IMAGE_EXTS = new Set([
  ".jpg", ".jpeg", ".jfif", ".png", ".gif",
  ".webp", ".bmp", ".svg", ".avif",
]);

// ---- CLI args ----
function parseArgs(argv, defaultRoot) {
  let root = defaultRoot;
  let single = false;
  let read = false;
  // Only parse args after the "--" separator: everything before it (electron
  // binary, injected Chromium flags, app path) is not ours.
  const sep = argv.indexOf("--");
  if (sep !== -1) argv = argv.slice(sep + 1);
  for (const a of argv) {
    if (a === "-s" || a === "--single") single = true;
    else if (a === "-r" || a === "--read") { single = true; read = true; }
    else if (a === "-h" || a === "--help") return { help: true };
    else if (a.startsWith("-")) continue; // ignore unknown flags
    else root = a;
  }
  return { root, single, read };
}

function expandTilde(p) {
  if (p === "~") return os.homedir();
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

function readConfig() {
  const cfg = { root: "", windowSize: "" };
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

async function setXattr(dir, name, value) {
  if (value) {
    await execFileAsync("setfattr", ["-n", name, "-v", value, dir]);
  } else {
    try { await execFileAsync("setfattr", ["-x", name, dir]); } catch { /* already absent */ }
  }
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
  const title = (await getXattr(dir, "user.zine.title")) || path.basename(dir);
  const author = await getXattr(dir, "user.zine.author");
  const tagsRaw = await getXattr(dir, "user.xdg.tags");
  const tags = tagsRaw.split(",").map((t) => t.trim()).filter(Boolean);
  const imgs = sortNatural(await findImages(dir)).map((img) => path.relative(dir, img));
  let date = 0;
  try { date = (await fsp.stat(dir)).mtimeMs; } catch { /* ignore */ }
  return { id, dir, title, author, tags, date, imgs };
}

// ---- app ----
let win = null;

app.whenReady().then(() => {
  const cfg = readConfig();
  const winSize = parseWindowSize(process.env.FLIP_WINDOW_SIZE || cfg.windowSize);
  const args = parseArgs(process.argv.slice(2), process.env.FLIP_ROOT || cfg.root);

  if (args.help) {
    console.log("usage: flip [--single|--read] DIR");
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
      let id = 0;
      for (const d of dirs) {
        if (!win || win.isDestroyed()) return;
        win.webContents.send("flip:comic", await discoverComic(d, id++));
      }
      if (win && !win.isDestroyed()) {
        win.webContents.send("flip:done", { autoRead: args.read, state: readState() });
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
    } catch (e) {
      console.error("flip:saveMeta:", e && e.message);
    }
  });
});

app.on("window-all-closed", () => app.quit());
