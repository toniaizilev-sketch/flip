# flip-electron (experimental)

Renders the `flip` viewer in Electron instead of Brave `--app` mode.
The bash driver, viewer HTML/CSS/JS, and discovery logic are all unchanged —
this only swaps the rendering engine.

## Setup

    cd ~/flip-electron
    npm install --save-dev electron

## Run

    ./test.sh /path/to/images

`test.sh` builds flip's HTML for the directory (single-album, reader mode) and
opens it in an Electron window, reusing the real viewer files from
`~/.config/flip/`.

The key bit is in `main.js`: `webSecurity: false` lets the `file://` page load
`file://` images (the Electron equivalent of Brave's
`--allow-file-access-from-files`), and `FLIP_PROFILE` gives an isolated profile
(the `--user-data-dir` equivalent).
