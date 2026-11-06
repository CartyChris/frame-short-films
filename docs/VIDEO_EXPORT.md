# Full-composition MP4 export

The included renderer turns a complete `.frame.json` project archive into an H.264/AAC MP4. It captures the complete browser composition: Canvas, Three.js/WebGL, DOM text, CSS effects, uploaded images, video overlays, and transitions. This avoids the common mistake of recording only a WebGL canvas and losing its titles and captions.

## Run

Install the project dependencies, then export a project archive from Frame:

```sh
npm install
npm run render -- my-film.frame.json my-film.mp4
```

The tool uses installed Google Chrome on macOS, common Chromium paths on Linux, or a Playwright-managed browser. To install a managed browser when needed:

```sh
npx playwright install chromium
```

Use `--chrome /path/to/browser` or the `CHROME_PATH` environment variable for another executable. FFmpeg is provided by `ffmpeg-static`; its download requires network access during dependency installation. No model or media generation API is called during rendering.

```sh
npm run render -- my-film.frame.json my-film.mp4 --width 1920 --height 1080 --fps 30
npm run render -- my-film.frame.json excerpt.mp4 --start 60 --duration 15
npm run render -- my-film.frame.json my-film.mp4 --overwrite
```

Output dimensions must be even numbers. Resolution and frame rate otherwise default to project settings. The renderer covers the requested time range with `ceil(seconds × fps)` frames; a duration not aligned to a frame boundary is limited by the chosen frame interval.

## Accurate timing

Every scene should provide `window.film.renderAt(seconds)` or `window.film.seek(seconds)`. The renderer sends a frame request and waits for an acknowledgement after the scene has rendered, image decoding has settled, and video layers have sought to the right frame. Scene functions may return promises for asynchronous work. Each frame is painted in Chromium before capture. The clock is explicit, so a slow export does not make the film run slowly.

The renderer stops with a useful error when a scene lacks a controllable Film API. `--allow-uncontrolled` explicitly permits such scenes, but their private animation clocks may not match the timeline. The result is reported as a limitation, not as deterministic rendering.

## Audio

The native mix includes project audio tracks, scene audio layers, and audio from video layers. It honors source trim, timeline offset, layer duration, looping, fade-in/fade-out, layer volume, opacity envelopes, mute, and project master volume. Silent video assets are skipped gracefully. Overlapping tracks are mixed with a final limiter to avoid digital clipping. Films without audio layers receive a silent stereo track.

Procedural sound and AI narration created as Frame media assets work offline. Audio generated privately inside arbitrary imported HTML—such as an internal Web Audio synthesizer—is not automatically extractable into the native FFmpeg mix. Save it as an audio asset first, or use browser tab recording with tab audio. This is an explicit distinction between timeline audio and private scene code.

## Offline operation and isolation

Network requests are blocked by default. If a scene needs an external font, script, or texture, export stops rather than silently delivering a broken offline film. Embed that resource into the HTML, or use `--allow-network` to permit public HTTPS resources. Local/private destinations, WebSockets, downloads, and local-file URLs remain unavailable to scene code.

The renderer serves only two in-memory HTML documents on a temporary loopback HTTP server. It does not serve a filesystem directory. Project HTML executes only inside nested opaque-origin Chromium iframes; it is never evaluated as Node.js code. The renderer uses its own browser context rather than your signed-in browser profile. The project archive contains no provider credentials.

## Long films and interrupted renders

Frames are streamed directly into FFmpeg, so the tool does not keep the entire film's frames in memory. Only one scene and its outgoing dissolve are live at a time. Embedded media and the project JSON still occupy memory; very large source archives require enough memory and disk space.

The in-progress file is named `my-film.partial.mp4`. It contains silent video using fragmented MP4 so already-encoded frames can survive interruption. On success the soundtrack is mixed into a normal fast-start `my-film.mp4`, and the partial is removed. Keeping AAC encoding out of the recovery stream avoids audio encoder-delay shifts in the finished frame clock. If rendering fails or you press Control-C, the partial stays in place. Rename it before retrying; the renderer will not silently overwrite a previous recovery movie.

A partial render is not automatically resumed mid-encoder. Render the remaining range using `--start` and `--duration`, or restart the full export. The original `.frame.json` archive is never modified. `--keep-temp` keeps extracted audio and the temporary trusted renderer module for troubleshooting; otherwise temporary files are removed.

Run `npm run render -- --help` for every available flag.
