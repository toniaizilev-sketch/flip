"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("flip", {
  ready: () => ipcRenderer.send("flip:ready"),
  onComic: (cb) => ipcRenderer.on("flip:comic", (_e, comic) => cb(comic)),
  onDone: (cb) => ipcRenderer.on("flip:done", (_e, opts) => cb(opts)),
});
