# Publish and install Frame 6

## Vercel

The Vercel app hosts the editor, bundled Rust/WASM core, and streaming API routes. It does not need a macOS server to generate ordinary HTML/CSS/JavaScript films or to use API-based narration and media providers. Local subscription CLI connections are an optional feature supplied by the separately running companion.

1. Put this source folder at the root of a Git repository, or select it as the Vercel project's Root Directory.
2. Import that repository into Vercel. Use the included `vercel.json` configuration: **Vite**, `npm ci`, `npm run build`, output directory **dist**.
3. Keep `public/film_core.wasm` and `scripts/build-three-runtime.mjs` in Git. The web build bundles the portable Three.js and Anime.js/Lottie film runtimes from source. Vercel serves this compiled module; it does not compile Rust during the web build. The CI workflow recompiles and checks it.
4. Deploy a preview, verify the editor and API routes, then promote the intended deployment through Vercel.

The app's model connections accept the user's own provider credentials. Do not hard-code keys in frontend source, public files, GitHub workflows, the service worker, or deployment URLs. The supplied GitHub workflows do not deploy and contain no cloud credentials. If you connect Vercel's Git integration, its preview/production deployment behavior is controlled in the Vercel project settings.

Produce is a client-side durable queue: keep the app open while it coordinates generation and local rendering. Tasks, received drafts and completed media are stored in the browser; Vercel is not a background film-worker queue. Pausing or closing the app does not stop an already accepted remote video job, whose identifier is retained for later retrieval.

API functions are configured for a maximum of 300 seconds, subject to the account's supported function/runtime limits. Film duration is independent of an individual generation request: long films can be authored in scenes and resumed across requests. The client must keep its recovery journal; serverless execution is not a substitute for project storage.

The SPA rewrite excludes `/api`, `/assets`, `/references`, `/examples`, `/fonts`, `/icons`, and paths with file extensions. Missing static files remain missing instead of silently returning the editor. API responses are marked `no-store, private`. Service-worker responses are `no-cache, no-store, must-revalidate`, allowing the browser to discover new versions.

## Install the browser app

Open the deployed HTTPS app once while online. In a supporting desktop browser, choose **Install Frame** from the address bar or browser menu. On iPhone/iPad Safari, use **Share → Add to Home Screen**. The manifest supports standalone display and any orientation; small screens are easiest to edit in landscape.

The installed app can reopen its editor and previously stored local projects without the network. Generation, model catalogs, cloud voices, and remote media providers still require a connection. Browser storage can be cleared or evicted, so retain exported project backups for material you cannot replace. Installing the PWA does not create a cloud backup or synchronize devices.

### Local speech and music

PulseForge composition, procedural sound effects and Tone offline WAV rendering run in the browser. Vercel does not render their audio buffers. A single score render is capped at 120 seconds; long films loop or combine cues. The editable source stays in project storage.

Local Kokoro narration uses a module worker and WebAssembly. The first explicit generation downloads the pinned 92.4 MB quantized model plus voice and runtime resources. Preserve the shipped worker/WASM settings and the CSP entries for the model/runtime hosts when configuring a custom deployment. The exact model revision and download details are in `src/lib/local-speech-contract.ts` and `src/lib/local-speech.worker.ts`. It uses its own browser-managed model cache; the app service worker does not proxy or cache cross-origin model downloads. An installed PWA alone does not imply the voice model is downloaded or available offline. Test an actual sentence on the intended device after installation.

The resulting narration is an ordinary audio asset embedded in the film. Watching the exported HTML does not fetch Kokoro, require an API key, or run speech inference. Browser workers/memory and macOS webview networking still govern local generation. A blocked model download is reported; it does not fall back to a paid voice provider.

### What the service worker stores

The worker precaches the public HTML shell, discovered same-origin hashed JavaScript/CSS dependencies, bundled WASM, the offline 3D and Motion film runtimes, fonts, and icons. Shipped reference-film HTML/assets under `/examples/` (including `western-paper-film.html`) or `/references/` are cached when available. Additional allowed public files are cached when requested.

It never intercepts or caches:

- `/api` or `/api/*` requests;
- POST or other non-GET requests;
- any cross-origin request, including AI providers or a local companion;
- requests with authorization/API-key headers;
- URLs with query strings;
- uploaded/generated audio/video, project packages, or arbitrary downloads.

Project content and recovery data belong to the editor's explicit storage/export system, not its service-worker cache. The worker never reads the credential vault.

The worker does **not** call `skipWaiting()` or force a page reload. A newly installed worker can notify open windows with `{type:'FRAME_UPDATE_READY'}`, but waits for the current editor tabs to close before taking over. This avoids interrupting an active generation merely because a new app version was deployed. The cache namespace is the `CACHE` constant in `public/sw.js`. Bump it with a release that changes the cache layout or removes obsolete shell assets, and verify the built service worker rather than copying a prior release's cache label.

Frontend registration should run only in a production HTTP(S) browser. Development and the native Tauri app should skip service-worker registration. The root HTML should link `/manifest.webmanifest`, `/icon.svg`, and `/icons/apple-touch-icon.png`.

## Automated checks

`.github/workflows/checks.yml` runs on main-branch pushes, pull requests, or manual dispatch. It installs locked npm dependencies, builds WASM, runs the Rust core/storage/companion tests, runs the project tests, and builds the web app. It uploads the web build for review and has read-only repository permissions.

`.github/workflows/macos-build.yml` runs **only when manually dispatched**. It uses a macOS runner to build the Tauri app/DMG and local CLI companion, then uploads those downloadable artifacts. It does not create a release, publish a site, install hooks, or use signing credentials. The resulting build is unsigned by an Apple Developer identity; see [Desktop setup](./DESKTOP.md) for local builds and native integration.

GitHub Actions major versions were checked against the official repositories when these workflows were created. The workflows use `actions/checkout@v7`, `actions/setup-node@v7`, and `actions/upload-artifact@v7`; the current default Rust toolchain is installed by `dtolnay/rust-toolchain@stable`.

## Source archives and credentials

Source packages and uploads must exclude `node_modules`, every Rust `target` directory, `src-tauri/gen`, `.git`, `.vercel`, build reports, logs, `.env*`, private keys, signing certificates, auth/credential files, and personal `.frame.json` / `.frame.zip` backups. Keep `Cargo.lock`, `package-lock.json`, the compiled public WASM module, icons, application source, and setup documentation.

The included `.gitignore` and `.vercelignore` implement these exclusions for Git and Vercel. ZIP tools do not automatically honor them; use an explicit allowlist or exclusion list when making a source archive. Share app/DMG/video deliverables separately from the source archive rather than including build caches.

## Release verification

Use [VERIFICATION.md](VERIFICATION.md) for this release's exact PASS / FAIL / NOT RUN results. Previous-release PWA or installer checks are not proof of the current build. Before promoting a build, verify:

- The production build, full-app production/recovery tests, and dependency audit.
- Actual offline editor reopening and portable HTML playback.
- Worker loading and a local speech sentence, including a clear download failure state.
- The API routes, same-origin streaming, and local companion origin configuration where used.
- The installed desktop app and export paths separately from the web build.

GitHub-hosted workflows, physical iPhone installation, paid-provider inference and microphone hardware require their own runtime/account checks. Do not infer those results from mocks or a successful bundle build.

References: [Vercel project configuration](https://vercel.com/docs/project-configuration), [MDN service worker lifecycle and offline caching](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers), [Tauri native capabilities](https://v2.tauri.app/security/capabilities/).
