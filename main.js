"use strict";

const { app, BrowserWindow } = require("electron");

// Optional isolated profile dir (mirrors the old --user-data-dir).
if (process.env.FLIP_PROFILE) {
  app.setPath("userData", process.env.FLIP_PROFILE);
}

// The HTML file to render is the first argv entry ending in .html.
const htmlPath = process.argv.find((a) => a.endsWith(".html"));

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    autoHideMenuBar: true,
    backgroundColor: "#111111",
    webPreferences: {
      webSecurity: false, // allow the file:// page to load file:// images
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(htmlPath);
}

if (!htmlPath) {
  console.error("usage: electron main.js <path/to/viewer.html>");
  app.quit();
} else {
  app.whenReady().then(createWindow);
}

app.on("window-all-closed", () => app.quit());
