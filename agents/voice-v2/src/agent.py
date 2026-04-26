import asyncio
import json
import os
from pathlib import Path

from livekit.agents import Agent, AgentSession, JobContext, WorkerOptions, cli, room_io
from livekit.plugins import ai_coustics, gradium

VOICE_TOPIC = "jeff.voice"
DEFAULT_GRADIUM_TTS_VOICE_ID = "m86j6D7UZpGzHsNu"


def load_dotenv() -> None:
    env_path = Path(__file__).resolve().parents[1] / ".env"
    if not env_path.exists():
        return

    for line in env_path.read_text().splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip("\"'"))


load_dotenv()


class JeffVoiceAgent(Agent):
    def __init__(self) -> None:
        super().__init__(
            instructions=(
                "You are the voice transport for Jeff. Send final transcripts to "
                "the phone app over LiveKit data packets, wait for the phone's "
                "answer text, then speak that answer. Do not run a cloud LLM."
            )
        )


async def publish_voice_event(ctx: JobContext, payload: dict[str, object]) -> None:
    await ctx.room.local_participant.publish_data(
        json.dumps(payload),
        reliable=True,
        topic=VOICE_TOPIC,
    )


async def speak_phone_response(ctx: JobContext, session: AgentSession, text: str) -> None:
    clean_text = " ".join(text.split())
    if not clean_text:
        await publish_voice_event(ctx, {"type": "speech_done"})
        return

    try:
        await publish_voice_event(ctx, {"type": "speech_started"})
        handle = session.say(clean_text, add_to_chat_ctx=False)
        await handle.wait_for_playout()
        await publish_voice_event(ctx, {"type": "speech_done"})
    except Exception as exc:
        await publish_voice_event(ctx, {"type": "error", "message": str(exc)})


async def commit_phone_turn(ctx: JobContext, session: AgentSession) -> None:
    try:
        transcript = await session.commit_user_turn(
            transcript_timeout=float(os.getenv("VOICE_V2_TRANSCRIPT_TIMEOUT", "4.0")),
            stt_flush_duration=float(os.getenv("VOICE_V2_STT_FLUSH_DURATION", "1.0")),
            skip_reply=True,
        )
        await publish_voice_event(ctx, {"type": "transcript_final", "text": transcript or ""})
    except Exception as exc:
        await publish_voice_event(ctx, {"type": "error", "message": str(exc)})


async def entrypoint(ctx: JobContext) -> None:
    await ctx.connect()
    session = AgentSession(
        vad=ai_coustics.VAD(),
        stt=gradium.STT(
            api_key=os.environ["GRADIUM_API_KEY"],
            model_endpoint=os.getenv("GRADIUM_STT_ENDPOINT", "wss://api.gradium.ai/api/speech/asr"),
        ),
        tts=gradium.TTS(
            api_key=os.environ["GRADIUM_API_KEY"],
            model_endpoint=os.getenv("GRADIUM_TTS_ENDPOINT", "wss://api.gradium.ai/api/speech/tts"),
            voice_id=os.getenv("GRADIUM_TTS_VOICE_ID", DEFAULT_GRADIUM_TTS_VOICE_ID),
        ),
    )

    @session.on("user_input_transcribed")
    def on_user_input_transcribed(event) -> None:
        event_type = "transcript_final" if event.is_final else "transcript_partial"
        asyncio.create_task(publish_voice_event(ctx, {"type": event_type, "text": event.transcript}))

    @ctx.room.on("data_received")
    def on_data_received(packet) -> None:
        if packet.topic != VOICE_TOPIC:
            return

        try:
            payload = json.loads(packet.data.decode("utf-8"))
        except Exception:
            return

        if not isinstance(payload, dict):
            return

        if payload.get("type") == "assistant_response" and isinstance(payload.get("text"), str):
            asyncio.create_task(speak_phone_response(ctx, session, payload["text"]))
            return

        if payload.get("type") == "stop_listening":
            asyncio.create_task(commit_phone_turn(ctx, session))

    await session.start(
        agent=JeffVoiceAgent(),
        room=ctx.room,
        room_options=room_io.RoomOptions(
            audio_input=room_io.AudioInputOptions(
                noise_cancellation=ai_coustics.audio_enhancement(
                    model=ai_coustics.EnhancerModel.QUAIL_VF_L,
                    model_parameters=ai_coustics.ModelParameters(
                        enhancement_level=float(os.getenv("AICOUSTICS_ENHANCEMENT_LEVEL", "0.8")),
                    ),
                    vad_settings=ai_coustics.VadSettings(
                        speech_hold_duration=0.03,
                        sensitivity=6.0,
                        minimum_speech_duration=0.0,
                    ),
                ),
            ),
        ),
    )


def main() -> None:
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))


if __name__ == "__main__":
    main()
