# Jeff Phone

A React Native iOS app that runs Gemma 4 on-device against a private memory layer, with voice in/out via Gradium and provider routing via Fastino.

Built for the **Big Berlin Hack 2026**.

> **Local-first brain. Berlin voice stack. Private memory with explicit provider control.**

## Status

Hackathon build in progress. Local Gemma chat, memory tools, memory management, image/file attachments, Gradium STT/TTS, Fastino smart routing, and an OpenAI-compatible cloud fallback are wired. Gemma vision works when the multimodal projector initialises successfully, but is still the most memory-sensitive path on physical devices. Apple Foundation Models and LiveKit/ai-coustics voice v2 are planned provider upgrades.

## The Stack

- **Runtime**: Expo SDK 55, RN 0.83.6, TypeScript strict
- **State**: [Zustand](https://zustand.docs.pmnd.rs) (single store, slices pattern)
- **Local LLM**: [llama.rn](https://github.com/mybigday/llama.rn) 0.12 + Gemma 4 E2B/E4B GGUF Q4_K_M
- **Memory**: [`@jeffs-brain/memory-react-native`](https://github.com/jeffs-brain/memory) (hot-linked from `../memory/sdks/rn/memory`)
- **Voice**: Gradium STT + TTS over direct WebSocket
- **Noise removal**: ai-coustics Quail via LiveKit v2 (planned)
- **Smart routing**: Fastino Classification TLM (zero-shot)
- **Cloud fallback**: OpenAI-compatible provider path for manual or routed text turns
- **Apple provider**: Apple Foundation Models text provider planned for Apple Intelligence devices; Apple Vision fallback under evaluation for OCR/classification image summaries

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
│   ├── inference-stream.ts
│   └── router.ts        # Fastino classifier call
├── lib/                 # Shared constants and feature helpers
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

## Fastino Smart Routing

Smart mode calls Fastino before a turn and maps the returned label to a provider tier:

- `trivial_chat` / `factual_qa` → local Gemma
- `reasoning_or_code` → local Gemma for now
- `long_context_or_creative` → cloud fallback when configured

Set `EXPO_PUBLIC_FASTINO_API_KEY` in `.env`. By default the app calls Pioneer’s OpenAI-compatible schema endpoint with `fastino/gliner2-base-v1`; override `EXPO_PUBLIC_FASTINO_ENDPOINT` or `EXPO_PUBLIC_FASTINO_MODEL_ID` only when testing another deployed Fastino/Pioneer model. If Fastino is missing, unavailable, or slower than the routing timeout, the app falls back to the selected manual provider.

## Architecture

See `~/code/me/big-hack-berlin/plan.md` for the full plan, decisions, and demo strategy. Research notes for each architectural choice live in `~/code/me/big-hack-berlin/research/`.

## Security Notes

This is a public-source repo. The `.env` file is gitignored, and `AGENTS.md`, `credentials.md`, `credentials.json`, and `*.credentials.*` are ignored as local-only files. **`EXPO_PUBLIC_*` env vars are embedded in the app bundle**. That is acceptable for a short-lived hackathon demo, but production builds should proxy partner API calls through a backend.

Local memory stays on-device. Smart routing sends a short recent text context to Fastino when Smart mode is enabled. Voice sends audio/text to Gradium when voice is enabled. Cloud fallback sends chat text to the configured OpenAI-compatible provider only when the selected or routed provider is cloud.

## Contributing

This is a hackathon entry; PRs are welcome but the main branch is moving fast over the weekend of 25-26 April 2026.

## Licence

MIT (TBC).
