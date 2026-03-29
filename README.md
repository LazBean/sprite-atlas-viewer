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

- PNG and PSD atlas loading
- live file watching via File System Access API in supported browsers
- frame width / height / count / row / column controls
- FPS control
- minimap for quick row and column picking
- saved last-used settings
- GitHub Pages friendly deployment

## Browser Note

For full live-watch behavior, use a Chromium-based browser such as Chrome or Edge.

GitHub Pages works fine for hosting the app, but local file watching still depends on browser support and permissions.

## Local Dev

```bash
npm install
npm run dev
```
