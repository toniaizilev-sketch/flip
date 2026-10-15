# flip-electron (experiment)

Full Electron port of `flip`: the Node main process does discovery in-process and
streams comics to the renderer over IPC, instead of a bash driver generating a
JSON-injected HTML file.

## Setup

    cd ~/flip-electron
    npm install

## Run

    ./test.sh [-s|-r] <directory>

- no flag → browse comics under `DIR` (gallery)
- `-s` / `--single` → treat `DIR` as one comic (gallery)
- `-r` / `--read` → treat `DIR` as one comic and open the reader directly

## Layout

    main.js       Node main: CLI args, fs discovery, xattrs, window, IPC
    preload.js    contextBridge → window.flip API
    renderer/     viewer.html / viewer.css / viewer.js (the UI)

## Differences vs. the Brave version

- Discovery runs in Node (`fs.readdir`) instead of `find`/`sort`/`jq`, and streams
  comics to the renderer as they're found (the window opens instantly).
- Images still load via `file://` URLs; `webSecurity: false` replaces Brave's
  `--allow-file-access-from-files`.
