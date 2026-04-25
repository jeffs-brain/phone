# Jeff Phone

A React Native iOS app that runs Gemma 4 on-device against a personal memory layer, with voice in/out via Gradium and intelligent provider routing via Fastino.

Built for the **Big Berlin Hack 2026** by [Alex Jay](https://github.com/jaythegeek).

> **Local-first brain. Berlin voice stack. Private memory with explicit provider control.**

## Status

🚧 **Hackathon build in progress.** Local Gemma chat, local vision, memory tools, memory management, Fastino routing, Gradium STT/TTS, and an OpenAI-compatible cloud fallback are wired. LiveKit/ai-coustics voice v2, EAS project setup, and real-device final validation are still open.

## The Stack

- **Runtime**: Expo SDK 55, RN 0.83.6, TypeScript strict
- **State**: [Zustand](https://zustand.docs.pmnd.rs) (single store, slices pattern)
- **Local LLM**: [llama.rn](https://github.com/mybigday/llama.rn) 0.12 + Gemma 4 E4B GGUF Q4_K_M
- **Memory**: [`@jeffs-brain/memory-react-native`](https://github.com/jeffs-brain/memory) (hot-linked from `../memory/sdks/rn/memory`)
- **Voice**: Gradium STT + TTS over direct WebSocket
- **Noise removal**: ai-coustics Quail via LiveKit v2 (planned)
- **Smart routing**: Fastino Classification TLM (zero-shot)
- **Cloud fallback**: OpenAI-compatible provider path for manual or routed text turns

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
cd ../memory && git checkout feat/rn-sdk && bun install && bun run build && cd ../phone

# 3. Configure environment
cp .env.example .env
# (edit .env with real keys; see hackathon partner dashboards)

# 4. Run on iOS
bun run ios
```

## Architecture

See `~/code/me/big-hack-berlin/plan.md` for the full plan, decisions, and demo strategy. Research notes for each architectural choice live in `~/code/me/big-hack-berlin/research/`.

## Security Notes

This is a public-source repo. The `.env` file is gitignored and so is `credentials.md` and `*.credentials.*`. **`EXPO_PUBLIC_*` env vars are embedded in the app bundle**. Fine for a hackathon demo, but for production we'd want a backend proxy for the partner API keys. Local memory stays on-device; smart routing sends recent chat context to Fastino, voice sends audio/text to Gradium, and cloud fallback sends chat text to the selected provider when enabled.

## Contributing

This is a hackathon entry; PRs are welcome but the main branch is moving fast over the weekend of 25-26 April 2026.

## Licence

MIT (TBC).
