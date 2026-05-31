# Solfege TTS Assets

These files are pre-rendered fixed-do solfege speech snippets for the music auto melody practice.

- Generator: `scripts/generate-solfege-tts.py`
- Voice: `zh-CN-XiaoxiaoNeural`
- Spoken text: mixed Chinese and pinyin-like solfege prompts (`哆`, `ruī`, `mi`, `发`, `嗦`, `la`, `西`) tuned for the audible answer pronunciation.
- Filenames follow pitch-class sample names: `C.mp3`, `Cs.mp3`, `D.mp3`, `Ds.mp3`, etc.

Run the generator from the repository root after installing `edge-tts` in a local tool environment:

```bash
python scripts/generate-solfege-tts.py
```
