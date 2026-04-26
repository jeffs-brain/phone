import os

from livekit.agents import Agent, AgentSession, JobContext, WorkerOptions, cli
from livekit.plugins import ai_coustics, gradium


class JeffVoiceAgent(Agent):
    def __init__(self) -> None:
        super().__init__(
            instructions=(
                "You are the voice transport for Jeff. Send final transcripts to "
                "the phone app over LiveKit data packets, wait for the phone's "
                "answer text, then speak that answer. Do not run a cloud LLM."
            )
        )


async def entrypoint(ctx: JobContext) -> None:
    await ctx.connect()
    session = AgentSession(
        stt=gradium.STT(
            api_key=os.environ["GRADIUM_API_KEY"],
            base_url=os.getenv("GRADIUM_STT_ENDPOINT", "wss://api.gradium.ai/api/speech/asr"),
        ),
        tts=gradium.TTS(
            api_key=os.environ["GRADIUM_API_KEY"],
            base_url=os.getenv("GRADIUM_TTS_ENDPOINT", "wss://api.gradium.ai/api/speech/tts"),
        ),
    )
    await session.start(
        agent=JeffVoiceAgent(),
        room=ctx.room,
        room_options={
            "audio_input": {
                "noise_cancellation": ai_coustics.audio_enhancement(
                    enhancement_level=float(os.getenv("AICOUSTICS_ENHANCEMENT_LEVEL", "0.8")),
                )
            }
        },
    )


def main() -> None:
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))


if __name__ == "__main__":
    main()
