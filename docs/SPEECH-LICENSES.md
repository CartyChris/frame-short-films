# Local speech and music dependency notices

The browser's optional local voice engine uses Kokoro and ONNX Runtime. The model is fetched only after the user selects local generation; it is not bundled in the app. The application bundles the ONNX runtime and its own speech worker. The phonemizer (including eSpeak) is **not included in the distributed worker**: the user downloads it directly from its upstream npm CDN on first local generation, with an exact SHA-256 check before execution and browser caching for offline use. Full notice texts are also shipped under `public/licenses`, so they are present in Vercel assets and the macOS application resources.

| Component actually used | Version / revision | Publisher license and source |
|---|---|---|
| kokoro-js | 1.2.1 | Apache-2.0; [Kokoro source](https://github.com/hexgrad/kokoro/tree/main/kokoro.js); `public/licenses/kokoro-js-1.2.1.txt` |
| Kokoro ONNX model | `onnx-community/Kokoro-82M-v1.0-ONNX`, revision `1939ad2a8e416c0acfeecc08a694d14ef25f2231` | Apache-2.0 in the [model card](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/tree/1939ad2a8e416c0acfeecc08a694d14ef25f2231). q8 weights: 92,361,116 bytes. Downloaded on user action, with separate voice/runtime files. |
| Transformers.js | 3.8.1 | Apache-2.0; [source](https://github.com/huggingface/transformers.js); `public/licenses/transformers-js-3.8.1.txt` |
| ONNX Runtime Web | 1.22.0-dev.20250409-89f8206ba4 | MIT plus third-party notices; [matching runtime revision](https://github.com/microsoft/onnxruntime/tree/89f8206ba4); `public/licenses/onnxruntime-MIT.txt` and `onnxruntime-ThirdPartyNotices.txt` |
| ONNX Runtime common | 1.21.0 | MIT; [source](https://github.com/microsoft/onnxruntime/tree/v1.21.0) |
| Optional upstream phonemizer.js wrapper (not bundled) | 1.2.1 | Apache-2.0; [source](https://github.com/xenova/phonemizer.js); `public/licenses/phonemizer-1.2.1.txt` |
| eSpeak NG inside the optional upstream phonemizer download (not bundled) | Bundled inside phonemizer 1.2.1; its npm metadata does not identify an exact eSpeak source commit | eSpeak NG is GPL-3.0-or-later with component-specific notices. [Upstream source and licensing](https://github.com/espeak-ng/espeak-ng); full GPL, Apache, BSD2 and Unicode notices are included in `public/licenses/espeak-ng-*.txt`. The wrapper's Apache label does **not** replace these underlying licenses. |
| Tone.js | 15.0.4 | MIT; [source](https://github.com/Tonejs/Tone.js/tree/15.0.4); `public/licenses/tone-15.0.4.txt` |
| Zod | 4.6.7 | MIT; [source](https://github.com/colinhacks/zod); `public/licenses/zod-4.6.7.txt` |

The optional eSpeak dependency is not represented as an all-Apache or all-MIT component. Because the npm publisher does not identify a matching eSpeak source/build revision, Frame avoids redistributing that implementation. The complete upstream notices and source links are retained for users who choose the download. No claim is made that Frame has reconstructed the publisher's embedded eSpeak build.

The optional URL is `https://cdn.jsdelivr.net/npm/phonemizer@1.2.1/dist/phonemizer.js` (1,322,380 bytes). Its pinned SHA-256 is `193481f474f7c1ea81df3195d18b45df8ef7254dbdccb3f193d60215c4897bec`, verified against both the installed npm package and an independently fetched CDN response. Cached bytes are verified again before import; corrupt cache entries are discarded. Imports alone do not initiate downloads. The final production worker's Rollup module graph was checked: it includes the local download/integrity adapter and no module from `node_modules/phonemizer/`. The worker shrank from approximately 2.21 MB to 0.885 MB after removing the bundled implementation.

The Frame source package includes the local speech worker, WAV encoder, progress/cancellation and cache adapters, exact npm lockfile, and the notice texts. No model weights, generated prompts, paid provider credentials, or account sessions are included in these notices.

## Final packaging checks

- PASS: production worker Rollup module graph excludes all `node_modules/phonemizer/` modules and includes `local-phonemizer.ts`. Worker output is 884.75 kB; the separate ONNX WASM asset is 21,596.02 kB.
- PASS: installed npm bytes and independently fetched pinned CDN bytes are identical (1,322,380 bytes and the SHA-256 above).
- PASS: 14 targeted TypeScript tests across local speech, runtime integrity/tamper rejection and provider expansion.
- PASS: actual fresh-cache Chrome inference after the upstream download: WAV 124,844 bytes, 2.6 seconds, RMS 0.06796, peak 0.52881.
- PASS: disposing the worker, disabling network access, and creating a fresh worker produced identical WAV metrics using cached model, runtime, voice and phonemizer.
- PASS: cancellation retained a completed 94,844-byte WAV (1.975 seconds).
- NOT RUN in this targeted gate: native macOS speech inference, mobile device inference, subjective voice-quality comparison. These results are browser inference checks, not a claim of device-wide compatibility.

### Native resource cache correction

Native macOS testing exposed a Cache API restriction: `tauri://` requests cannot be used as cache keys. `local-speech-cache.ts` now uses a synthetic HTTPS key for storage while fetching the original bundled resource URL. The synthetic host is never fetched, and versioned asset paths remain distinct. The response is stored as fresh WASM bytes without a native response URL.

PASS: the original rejection was reproduced with the real Chrome Cache API; the helper then stored and reopened identical fixture bytes offline. Its only network target remained the original native resource. PASS: 12 targeted cache/speech/integrity tests and a production worker build. Actual packaged native voice inference is a separate release acceptance check.
