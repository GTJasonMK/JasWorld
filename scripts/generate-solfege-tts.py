#!/usr/bin/env python3
"""Generate local solfege TTS assets with edge-tts.

Usage:
  python scripts/generate-solfege-tts.py

Install the generator dependency outside the app runtime:
  python -m pip install edge-tts
"""

from __future__ import annotations

import argparse
import asyncio
from pathlib import Path

import edge_tts


SOLFEGE_TEXT = {
    "C": "哆",
    "Cs": "升哆",
    "D": "来",
    "Ds": "升来",
    "E": "咪",
    "F": "发",
    "Fs": "升发",
    "G": "嗦",
    "Gs": "升嗦",
    "A": "拉",
    "As": "升拉",
    "B": "西",
}


async def generate_asset(output_dir: Path, name: str, text: str, voice: str, rate: str) -> None:
    output_file = output_dir / f"{name}.mp3"
    communicate = edge_tts.Communicate(text=text, voice=voice, rate=rate)
    await communicate.save(str(output_file))


async def main() -> None:
    parser = argparse.ArgumentParser(description="Generate local fixed-do solfege TTS mp3 assets.")
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("public/audio/solfege-tts"),
        help="Directory for generated mp3 files.",
    )
    parser.add_argument("--voice", default="zh-CN-XiaoxiaoNeural")
    parser.add_argument("--rate", default="-8%")
    args = parser.parse_args()

    output_dir = args.output_dir
    output_dir.mkdir(parents=True, exist_ok=True)

    for name, text in SOLFEGE_TEXT.items():
        await generate_asset(output_dir, name, text, args.voice, args.rate)


if __name__ == "__main__":
    asyncio.run(main())
