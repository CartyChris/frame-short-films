# Provider adapters

The hosted application is a bring-your-own-key client. Its API routes use the key supplied for that request; they do not read a shared paid-provider key from the server environment, save keys, or log request bodies. Existing Codex/Claude Code OAuth sessions are handled by the optional local companion, not these HTTP adapters.

## Routes

Provider requests require POST with a JSON body. Errors use `{ "error": "human-readable message" }` and an appropriate HTTP status. After a streaming response starts, errors are NDJSON events.

The desktop app may call these routes from exactly `tauri://localhost`, `http://tauri.localhost`, or `https://tauri.localhost`. OPTIONS preflights allow only POST and Content-Type. For another hosted mirror, set server environment variable `FRAME_ALLOWED_ORIGINS` to comma-separated exact HTTP(S) origins, such as `https://studio.example,https://preview.example`. Wildcards, opaque origins, paths, and arbitrary origin reflection are not supported. Responses remain `Cache-Control: no-store`; allowed clients can read Content-Type, Content-Length, and Cache-Control. Same-origin hosted clients keep their existing POST behavior. CORS is a browser access boundary, not user authentication.

### `/api/generate`

Request follows `GenerateRequest` in `src/lib/types.ts`: `provider`, `apiKey`, `baseUrl?`, `model`, `messages`, `temperature?`, `maxTokens?`.

The response is `application/x-ndjson`, one object per line:

```json
{"type":"delta","text":"<canvas>"}
{"type":"done","finishReason":"stop"}
```

A cutoff instead produces an error event; received deltas remain available to the client. A provider token ceiling returns `finishReason: "length"` (including Anthropic's `max_tokens` stop reason). The client must treat that as incomplete and offer continuation. Heartbeat blank lines may occur. SSE comments, multiline data, split JSON events, UTF-8 split across network chunks, and midstream provider errors are handled. Anthropic thinking and tool input blocks are not treated as generated code. A connection ending without a provider terminal marker never produces a successful `done` event.

Supported text presets: OpenRouter, Venice, Anthropic, OpenAI, xAI, Z.AI regular API, DeepSeek, Groq, Mistral, Together, Fireworks, Gemini's OpenAI-compatible API, and custom OpenAI-compatible HTTPS providers. The xAI preset uses its complete language-model catalog and chat streaming endpoint; direct xAI image/video adapters are not included. Model-specific parameters remain subject to each provider's capabilities. OpenAI requests use `max_completion_tokens`; other compatible endpoints use `max_tokens`. Sampling controls are omitted for direct OpenAI/Anthropic to avoid unsupported controls on reasoning models.

### `/api/models`

Body: `{provider, apiKey, baseUrl?, kind?: "text" | "image" | "video" | "audio"}`. Returns `{models:[...]}` using live catalogs, with no fixed shortlist. OpenRouter's unfiltered catalog, dedicated image/video catalogs, and speech filter are supported. Anthropic pagination is followed. Model records include identifiers, display names, modalities, context capacity where supplied, voices where supplied, and extra `capabilities` metadata for model-specific sizes/durations. Some providers expose an inference-compatible chat API without a compatible catalog; manual model IDs remain useful when their catalog call fails.

### `/api/media`

Image body: `{provider:"openrouter"|"venice",apiKey,model,action:"image",prompt,aspectRatio?,resolution?,width?,height?,direct?}`. The hosted response normalizes smaller image outputs into `{images:[{data:"data:image/png;base64,...",mime:"image/png"}]}`.

Set `direct:true` for image generation that should transfer directly between the browser and provider, without the hosted response size limit. The response is `{directKind:"image",provider,download:{url,method:"POST",auth:"bearer",body,mime:"application/json"}}`. The client supplies its existing key as Bearer authorization; no key is included in the descriptor. Decode OpenRouter `data[].b64_json` with `media_type`, or Venice `images[]` with PNG format.

Video actions:

- `video-start`: `{provider,apiKey,model,prompt,duration?,aspectRatio?,resolution?}` returns `{job:{id,model,status,downloadUrl?}}`.
- `video-poll`: supply `jobId`, `model`, and any saved `downloadUrl`. Returns `{job:{id,model,status,...}}`; sometimes also `download` when Venice's retrieve route already returns video bytes.
- `video-content`: returns a **direct transfer descriptor**, `{download:{url,method,auth,body?,mime}}`. Fetch it in the browser and durably save the resulting file before marking the job complete. This avoids routing large videos through Vercel's function response limit.

Always persist a job's ID and download URL immediately on queue acceptance. Venice's optional `download_url` is returned only once and its API cannot list old jobs. Polling/resuming uses the saved identifiers. The hosted routes do not delete provider output. Signed media URLs are delivery mechanisms, not permanent project assets.

Direct media fetch depends on provider/browser CORS support. If a transfer is blocked, show the actual failure and retain the job for a companion or manual download/import. Do not mark a job saved merely because the provider says it is completed. Image responses larger than the hosted cap return a transfer-limit error; direct mode should be chosen before generating large images because an image request is not a recoverable video queue job.

### `/api/voice`

Body: `{provider:"openrouter"|"venice"|"elevenlabs"|"openai",apiKey,model,voice,text,speed?}`. Returns audio bytes, normally MP3; inspect Content-Type. Voice IDs are model-specific. Split long narration into sentence/scene chunks. OpenRouter/Venice/OpenAI route text is limited to 4096 characters per call. ElevenLabs is limited here to 40,000, but individual models may allow less. The hosted audio transfer cap is 4 MB. No deprecated OpenAI model is forced as a default.

## Endpoint boundaries

Preset domains cannot be overridden through `baseUrl`. Custom endpoints require public HTTPS on port 443, with no embedded credentials, query, or fragment. DNS results must all be globally routable, and the chosen validated address is pinned into the actual TLS lookup; this closes the validation/fetch DNS-rebinding gap. Redirects are rejected. The media routes construct only fixed provider URLs; private Venice download links must use its specific private-share host and path. The service is not an arbitrary-URL download proxy.

Generated code is still untrusted content and belongs in the isolated preview implemented by the editor. Endpoint validation does not make generated code safe.

## Subscription distinctions

Z.AI's dedicated Coding Plan endpoint is `https://api.z.ai/api/coding/paas/v4`, but its official FAQ restricts subscription benefits to supported tools/products. The direct hosted Z.AI preset therefore uses the regular `https://api.z.ai/api/paas/v4` API. Use the supported signed-in/configured CLI companion path for Coding Plan access; a custom app should not claim eligibility merely because a key works.

Claude Code and Codex subscription OAuth credentials are not interchangeable with Anthropic/OpenAI API keys. The companion invokes installed signed-in tools instead of extracting or uploading their tokens.

## Verification

`npx vitest run tests/providers.test.ts` exercises split UTF-8/SSE framing, interrupted streams, explicit token cutoffs, midstream errors, credential redaction, Anthropic stop handling/pagination, catalog breadth, endpoint restrictions, normalized image output, persistent media IDs, direct-transfer descriptors, bad narration content types, and the actual Node HTTP handler. All provider responses are mocked; these tests do not incur charges or establish that a user's account/model is entitled to a provider.

## Uploaded character and location references

The media request accepts `referenceImages: string[]` containing embedded PNG, JPEG, or WebP data URLs. The browser selects only image assets linked to the current scene's cast and locations, deduplicates them, and prepares copies up to 1024 pixels on the long edge. Original media stays unchanged. Each shot supports at most three references and 1.5 MB of encoded reference data; missing, undersized, malformed, or excessive references produce an actionable error instead of silently dropping a character's image.

OpenRouter images send the actual bytes in `input_references`, after checking that the chosen model advertises this parameter. Venice images with references use `/image/multi-edit` with `modelId` and `images`; a compatible editing model is required. Its per-model input limit is checked against the live catalog. Editing models appear alongside image generators in the Venice image picker. Edited binary images download directly to the browser, avoiding the hosted response-size limit.

Video uses `referenceMode: "reference"` by default: OpenRouter receives `input_references` and Venice receives `reference_image_urls`. Optional `first-frame` mode requires one image; `first-last-frame` requires exactly two. They use OpenRouter's `frame_images` or Venice's `image_url` / `end_image_url`. Image order follows selected cast, then selected locations, with duplicate assets removed. These modes require a video model supporting the chosen input. Provider errors remain visible; the app never retries without the requested references. Reference guidance improves consistency but does not guarantee identical faces or geometry. Reusing the same 3D model supplies deterministic geometry.

Reference conditioning has mock-transport and local-browser tests. Paid provider generation is not part of the test suite. Browser CORS and provider/model availability still apply.

Official contracts: [OpenRouter image references](https://openrouter.ai/blog/tutorials/image-generation/), [OpenRouter video inputs](https://openrouter.ai/docs/guides/overview/multimodal/video-generation), [Venice multi-edit](https://docs.venice.ai/api-reference/endpoint/image/multi-edit), [Venice video inputs](https://docs.venice.ai/api-reference/endpoint/video/queue).

## Primary references

- [OpenRouter catalog](https://openrouter.ai/docs/api/api-reference/models/list-all-models-and-their-properties), [streaming](https://openrouter.ai/docs/api_reference/streaming), [images](https://openrouter.ai/docs/guides/overview/multimodal/image-generation), [video](https://openrouter.ai/docs/guides/overview/multimodal/video-generation), [speech](https://openrouter.ai/docs/guides/overview/multimodal/tts)
- [Venice catalog](https://docs.venice.ai/api-reference/endpoint/models/list), [chat](https://docs.venice.ai/api-reference/endpoint/chat/completions), [images](https://docs.venice.ai/api-reference/endpoint/image/generate), [video job persistence](https://docs.venice.ai/guides/media/video-generation), [speech](https://docs.venice.ai/guides/media/text-to-speech)
- [Anthropic API headers](https://platform.claude.com/docs/en/api/overview), [streaming](https://platform.claude.com/docs/en/build-with-claude/streaming)
- [Z.AI plan restrictions](https://docs.z.ai/devpack/faq), [supported configuration](https://zcode.z.ai/en/docs/configuration)
- [ElevenLabs speech](https://elevenlabs.io/docs/api-reference/text-to-speech/convert), [OpenAI speech and deprecation notice](https://developers.openai.com/api/reference/resources/audio/subresources/speech/methods/create)
- [Gemini OpenAI compatibility](https://ai.google.dev/gemini-api/docs/openai), [Groq](https://console.groq.com/docs/openai), [Mistral models](https://docs.mistral.ai/api/endpoint/models), [DeepSeek models](https://api-docs.deepseek.com/api/list-models/)
- [xAI API](https://docs.x.ai/developers/rest-api-reference/inference), [xAI language-model catalog](https://docs.x.ai/developers/rest-api-reference/inference/models)
