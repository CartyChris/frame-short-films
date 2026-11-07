# Frame 7 studio guide

Frame keeps films and attachments on the device where you work. Export a complete project backup when moving between devices or before clearing browser data. An imported backup becomes a separate project. The first-launch sample is optional and stays separate from a blank film.

## Start in Chat

Describe the film in your own words. Use **+**, drag files onto Chat, or type **@** to select files already saved with the film. Review and edit the shot outline, or choose auto-proceed after the director has asked its remaining questions. The selected model must be connected for generation.

Original attachments are stored locally. Bounded excerpts of supported text files are sent to the director; other file contents are not automatically understood. If an OpenRouter connection and a vision-capable model are selected, you may explicitly choose to send up to three PNG, JPEG, or WebP originals, totaling 750 KiB. Their metadata is included. Other providers and file types currently use text or metadata only. A provider can reject a model or image even if it is selected.

In Produce, assign connected models and optional instructions to the director, character designer, animator, editor, and composer. These roles run in sequence. A connected MCP server can be enabled for selected tools; one tool can be called or skipped during the production's tool step. An uncertain tool operation stays blocked rather than being sent again. External Blender changes must still be brought back through the Blender exchange.

## ComfyUI and generation services

In Studios → Production tools → ComfyUI, connect a separately running local ComfyUI through the local companion. You can open its own editor, submit an API-format workflow, check saved job IDs, and import supported output. Its own Manager and installed nodes remain in that separate installation. An embedded editor can be blocked by the browser or server; use its new-tab link if needed. Frame does not install ComfyUI, nodes, or model weights.

The Freefield panel connects to a separately running local [Freefield](https://github.com/neuregex/freefield) server, displays available manifest-driven workflows, retains selected inputs, tracks runs, and imports supported image, audio, and video results. For a remote server, use a user-managed local tunnel. Freefield may retain uploaded files and prompts in its own history. Freefield's MIT code and individual model weights have separate license terms; check each workflow's requirements. Uploads are limited to eight files and 100 MiB in total; temporary processing may use two to three times that amount of memory. A lost submission response may require checking Freefield history manually.

The Comfy Cloud panel supports the documented Comfy API v2 on Comfy Cloud and official deployment hosts. A paid plan or credits may be required. It saves job IDs and shows status and output metadata; cloud-output downloading is not yet implemented in Frame. See the [Comfy API v2 overview](https://docs.comfy.org/api-reference/v2/overview) and [Comfy Cloud API overview](https://docs.comfy.org/development/cloud/overview).

The Higgsfield Cloud panel supports the six models listed in the panel using separate Cloud API credentials. Image-to-video currently accepts a public HTTPS reference URL; file upload and automatic result import are not implemented. Provider links, reference URLs, prompts and settings are included in project backups; signed links may grant access to anyone holding the backup. Consumer subscription/OAuth access is not established. The [higgsfield-ai/higgsfield](https://github.com/higgsfield-ai/higgsfield) repository is a distributed GPU training framework, not the complete hosted creative product; the separate [official client](https://github.com/higgsfield-ai/higgsfield-client) documents its Cloud API.

## Recover work

Films and media removed from the main library appear in Recovery. Restoring is reversible; permanent deletion requires a second confirmation and is blocked if saved work still uses an item. Exported files and Mac disk backups are separate copies. Active generations are protected between supported browser tabs; for older drafts or browsers without Web Locks, stop the generation and close other Frame tabs before explicitly recovering a draft. Project backups preserve original attachments, saved draft chunks, workflow settings and operation histories. Imported tool histories are read-only and cannot grant a new dispatch permission.

## Limits

A model-generated film still needs review. Not every provider supports every media type, long-form consistency, or every external tool. The local companion and installed services are required for local MCP, ComfyUI, and Freefield from the web app; a hosted frontend does not run the user's GPU. Tests using simulated providers do not establish real account, model, hardware, or billing availability.
