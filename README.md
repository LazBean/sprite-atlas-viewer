# Sprite Atlas Viewer

![Sprite Atlas Viewer preview](docs/preview.png)

Live: [lazbean.github.io/sprite-atlas-viewer](https://lazbean.github.io/sprite-atlas-viewer/)

Minimal web viewer for sprite sheet animation preview.

It is made for a simple pixel-art workflow:

- draw in Photoshop
- save atlas with `Ctrl+S`
- keep the viewer open on a second screen
- see the animation update almost instantly

## Features

- browser image formats, PSD, and Aseprite loading
- live file watching via File System Access API in supported browsers
- frame width / height / count / row / column controls
- FPS control
- minimap for quick row and column picking
- saved last-used settings
- GitHub Pages friendly deployment

Aseprite files are flattened into a horizontal frame strip automatically, and the viewer sets frame width, frame height, and frame count from the file.

## Browser Note

For full live-watch behavior, use a Chromium-based browser such as Chrome or Edge.

Firefox and Safari can still open and preview files, but they do not get the same auto-reload-after-save workflow. In those browsers, after saving the file in your editor, you need to pick the file again.

GitHub Pages works fine for hosting the app, but local file watching still depends on browser support and permissions.

## Local Dev

```bash
npm install
npm run dev
```
