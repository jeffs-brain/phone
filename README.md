# Jeff Phone

A React Native iOS app that runs Gemma 4 on-device against a private memory layer, with voice in/out via Gradium and provider routing via Fastino.

Built for the **Big Berlin Hack 2026**.

> **Local-first brain. Berlin voice stack. Private memory with explicit provider control.**

## Status

Hackathon build in progress. Local Gemma chat, memory tools, memory management, image/file attachments, Brain document import, Gradium STT/TTS, Fastino smart routing, Gemini cloud fallback, offline local-only routing, and an Apple Foundation Models/Vision native bridge are wired. Gemma vision works when the multimodal projector initialises successfully, but remains the most memory-sensitive path on physical devices. LiveKit/ai-coustics voice v2 is scaffolded as an isolated backend/agent path while the app keeps direct Gradium voice as the stable default.

## The Stack

- **Runtime**: Expo SDK 55, RN 0.83.6, TypeScript strict
- **State**: [Zustand](https://zustand.docs.pmnd.rs) (single store, slices pattern)
- **Local LLM**: [llama.rn](https://github.com/mybigday/llama.rn) 0.12 + Gemma 4 E2B/E4B GGUF Q4_K_M
- **Memory**: [`@jeffs-brain/memory-react-native`](https://github.com/jeffs-brain/memory) (hot-linked from `../memory/sdks/rn/memory`)
- **Voice**: Gradium STT + TTS over direct WebSocket by default, with an optional LiveKit voice transport
- **Noise removal**: ai-coustics Quail on the LiveKit agent path (`backend/livekit-token`, `agents/voice-v2`)
- **Smart routing**: Fastino Classification TLM (zero-shot)
- **Cloud fallback**: Gemini provider path for manual or routed large-tier text turns, with the older OpenAI-compatible path retained as a fallback
- **Apple provider**: local Expo module wrapping Apple Foundation Models text generation, Apple Vision OCR/classification signals, and PDFKit text extraction

## Repo Layout

```
phone/
├── app/                 # expo-router screens
├── components/          # Extracted chat, settings, and memory UI
├── store/               # Zustand store
│   ├── types.ts         # Shared types
│   └── slices/          # inference, chat, voice, memory, routing, settings
├── services/            # Native bridges and external APIs
│   ├── inference.ts     # llama.rn adapter, tool loop, cloud fallback
│   ├── gemini-provider.ts
│   ├── inference-stream.ts
│   ├── apple-intelligence.ts
│   └── router.ts        # Fastino classifier call
├── lib/                 # Shared constants and feature helpers
├── modules/             # Local Expo native modules
├── backend/             # Optional LiveKit token service for voice v2
├── agents/              # Optional LiveKit/Gradium/ai-coustics voice agent
├── app.json             # Expo config — bundle id, plugins, entitlements
├── metro.config.js      # Hot-link to ../memory/sdks/rn/memory
└── .env                 # Local credentials (gitignored)
```

## Getting Started

```bash
# 1. Install dependencies (this also resolves the file:../memory/sdks/rn/memory link)
bun install

# 2. Make sure the memory SDK is on the right branch + has a built dist/
cd ../memory
bun install
bun run build
cd ../phone

# 3. Configure environment
cp .env.example .env
# Edit .env locally. Never commit real keys.

# 4. Start Metro for a development build
EXPO_PUBLIC_LLAMA_PROFILE=device bunx expo start --dev-client --clear --tunnel
```

Use `--tunnel` for physical iPhone/iPad demos, especially when the Mac is using a phone hotspot. A physical iOS device cannot use the Mac's `localhost`, and hotspot LAN discovery is unreliable. Install the development build in a second terminal:

```bash
EXPO_PUBLIC_LLAMA_PROFILE=device bunx expo run:ios --device "<device name>" --no-bundler
```

For the simulator, use the simulator profile:

```bash
EXPO_PUBLIC_LLAMA_PROFILE=simulator bunx expo run:ios
```

The app downloads GGUF model assets into the app container. They should persist across normal app launches, but reinstalling the native app can remove them.

## Offline Behaviour

The app watches native network state through NetInfo. When the device is offline, Smart routing is bypassed, Fastino/cloud/voice network calls are blocked with clear local errors, and chat routes through the selected local Gemma model. Downloading a missing GGUF or projector still requires network; already-cached models continue to load from the app container.

## Brain Imports

The Brain screen can import PDF and text-like documents. PDFs are extracted locally through the `JeffAppleIntelligence` Expo module using PDFKit; text, markdown, JSON, XML, and YAML are read from the cached document picker copy. Imported text is chunked and stored as reference memories in the same local memory database used by chat recall, so uploaded documents are searchable through the existing memory tools.

Because the PDF bridge is native, run `pod install` after changing native module files and reinstall the iOS dev client before testing PDF imports.

## Fastino Smart Routing

Smart mode calls Fastino before a turn and maps the returned label to a provider tier:

- `trivial_chat` / `factual_qa` → local Gemma
- `reasoning_or_code` → local Gemma for now
- `long_context_or_creative` → Gemini cloud fallback when configured

Set `EXPO_PUBLIC_FASTINO_API_KEY` in `.env`. By default the app calls Pioneer’s OpenAI-compatible schema endpoint with `fastino/gliner2-base-v1`; override `EXPO_PUBLIC_FASTINO_ENDPOINT` or `EXPO_PUBLIC_FASTINO_MODEL_ID` only when testing another deployed Fastino/Pioneer model. If Fastino is missing, unavailable, or slower than the routing timeout, the app falls back to the selected manual provider.

## Cloud Route

Cloud turns use Gemini by default when `EXPO_PUBLIC_GOOGLE_GENERATIVE_AI_API_KEY` is configured in the dev client. The default model is `gemini-2.5-flash`; override it with `EXPO_PUBLIC_GEMINI_MODEL`. The provider also understands the non-public `GOOGLE_GENERATIVE_AI_*` names for tests or a future server-side proxy, but those values are not embedded into an Expo app bundle. If Gemini is not configured, the app falls back to the legacy OpenAI-compatible `EXPO_PUBLIC_GEMMA_CLOUD_*` settings.

Direct `EXPO_PUBLIC_*` keys are acceptable for this dev-client demo only. Production builds should put Gemini behind a backend proxy and keep `GOOGLE_GENERATIVE_AI_API_KEY` server-side.

## Apple Provider

`modules/apple-intelligence` is a local Expo module linked as `JeffAppleIntelligence`. It provides:

- Apple Foundation Models text generation when the OS/device reports `SystemLanguageModel` availability.
- Apple Vision OCR and image classification summaries that can be fed into Apple FM or Gemma as text context.
- Local PDFKit text extraction for Brain document imports.

This is additive to Gemma, not a replacement. Foundation Models is a text provider; Gemma remains the primary local multimodal path when the projector is stable.

## Voice V2

Direct Gradium STT/TTS is the app default. The LiveKit/ai-coustics path is selectable from Settings after rebuilding the dev client with the LiveKit native plugins:

- `backend/livekit-token` issues short-lived LiveKit room tokens.
- `agents/voice-v2` runs the Python LiveKit agent with ai-coustics enhancement plus Gradium STT/TTS.
- The app joins the LiveKit room, streams mic audio, receives final transcripts over the `jeff.voice` data topic, sends the transcript through the existing Jeff chat pipeline, then returns the assistant text for the agent to speak.

Set `EXPO_PUBLIC_VOICE_TRANSPORT=livekit-ai-coustics` or switch it in Settings. The token backend and Python agent must both be running, and physical devices should still use Expo tunnel when the Mac is on a phone hotspot.

## Architecture

See `~/code/me/big-hack-berlin/plan.md` for the full plan, decisions, and demo strategy. Research notes for each architectural choice live in `~/code/me/big-hack-berlin/research/`.

## Security Notes

This is a public-source repo. The `.env` file is gitignored, and `AGENTS.md`, `credentials.md`, `credentials.json`, and `*.credentials.*` are ignored as local-only files. **`EXPO_PUBLIC_*` env vars are embedded in the app bundle**. That is acceptable for a short-lived hackathon demo, but production builds should proxy partner API calls through a backend.

Local memory stays on-device. Smart routing sends a short recent text context to Fastino when Smart mode is enabled. Voice sends audio/text to Gradium when voice is enabled. Cloud fallback sends chat text to Gemini or the configured OpenAI-compatible provider only when the selected or routed provider is cloud.

## Contributing

This is a hackathon entry; PRs are welcome but the main branch is moving fast over the weekend of 25-26 April 2026.

## Licence

MIT (TBC).
