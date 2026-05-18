# Piano Samples

These files are real piano recordings from the University of Iowa Musical Instrument Samples collection.

- Source page: https://theremin.music.uiowa.edu/MISpiano.html
- Usage notes: https://theremin.music.uiowa.edu/MIS.html
- Instrument: Steinway & Sons model B
- Dynamic layer: `Piano.ff.*.aiff`
- Range: 88 keys, `A0` through `C8`
- Processing: converted from AIFF to MP3 with `ffmpeg`/`libmp3lame`, then trimmed with `silenceremove`

The project stores sharp note names with `s` because `#` is awkward in URLs:

- `C#4` -> `Cs4.mp3`
- `D#4` -> `Ds4.mp3`
- `F#4` -> `Fs4.mp3`
- `G#4` -> `Gs4.mp3`
- `A#4` -> `As4.mp3`

The original source uses flat names for black keys in many files, so `Bb` was normalized to `As`, `Db` to `Cs`, `Eb` to `Ds`, `Gb` to `Fs`, and `Ab` to `Gs`.

The final MP3s remove leading and trailing silence with a conservative peak-based threshold:

```sh
silenceremove=start_periods=1:start_duration=0.02:start_threshold=-50dB:start_silence=0.02:stop_periods=1:stop_duration=0.30:stop_threshold=-50dB:stop_silence=0.15:detection=peak:window=0.30
```
