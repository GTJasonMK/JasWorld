import '@styles/index.css';
import './style.css';
import { bootstrapCore, settingsManager } from '@core/index.js';

bootstrapCore();

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const SCALE_TYPES = [
    { label: '大调', offsets: [0, 2, 4, 5, 7, 9, 11], degrees: ['1', '2', '3', '4', '5', '6', '7'] },
    { label: '小调', offsets: [0, 2, 3, 5, 7, 8, 10], degrees: ['1', '2', 'b3', '4', '5', 'b6', 'b7'] },
];

const MIN_FREQ = 27.5;
const MAX_FREQ = 4200;
const BUFFER_SIZE = 4096;
const FRAME_INTERVAL = 80;
const SILENCE_GAP_MS = 260;
const MIN_SEGMENT_FRAMES = 3;
const MIN_PITCH_CONFIDENCE = 0.7;
const YIN_THRESHOLD = 0.16;
const YIN_FALLBACK_THRESHOLD = 0.24;
const NOTE_CHANGE_CONFIRM_FRAMES = 3;
const ONSET_MIN_GAP_MS = 180;
const ONSET_RMS_RATIO = 1.65;
const ONSET_RMS_DELTA = 0.004;
const ONSET_MIN_CONFIDENCE = 0.72;
const OFFLINE_FRAME_MS = 32;
const OFFLINE_HOP_MS = 12;
const OFFLINE_ATTACK_SKIP_MS = 35;
const OFFLINE_MIN_SEGMENT_MS = 120;
const OFFLINE_ONSET_MIN_GAP_MS = 130;
const OFFLINE_PITCH_SPLIT_MIN_MS = 150;
const OFFLINE_SPECTRUM_MAX_FREQ = 5000;
const DENOISE_FRAME_MS = 46;
const DENOISE_NOISE_PROFILE_MS = 320;
const NOTE_PLAY_SECONDS = 1.25;

const els = {
    hold: document.getElementById('hold-to-record'),
    holdTitle: document.getElementById('hold-title'),
    holdHint: document.getElementById('hold-hint'),
    play: document.getElementById('play-sequence'),
    playRecording: document.getElementById('play-recording'),
    downloadRecording: document.getElementById('download-recording'),
    clearRecording: document.getElementById('clear-recording'),
    recordingLabel: document.getElementById('recording-label'),
    clear: document.getElementById('clear-sequence'),
    copy: document.getElementById('copy-sequence'),
    removeLast: document.getElementById('remove-last'),
    sensitivity: document.getElementById('sensitivity-slider'),
    currentNote: document.getElementById('current-note'),
    currentFrequency: document.getElementById('current-frequency'),
    status: document.getElementById('detector-status'),
    sequence: document.getElementById('note-sequence'),
    degreeSequence: document.getElementById('degree-sequence'),
    scaleCandidates: document.getElementById('scale-candidates'),
};

let audioContext = null;
let analyser = null;
let inputGain = null;
let captureNode = null;
let captureSink = null;
let micSource = null;
let micStream = null;
let timeBuffer = null;
let animationFrameId = null;
let lastFrameAt = 0;
let recording = false;
let processingRecording = false;
let pendingStart = false;
let stopAfterStart = false;
let capturedNotes = [];
let recordingFrames = [];
let recordingStats = createRecordingStats();
let lastPitchAt = 0;
let bestScale = null;
let playbackContext = null;
let playbackMode = 'idle';
let playbackRunId = 0;
let playbackSources = [];
let playbackTimers = [];
let mediaRecorder = null;
let mediaChunks = [];
let savedRecordingUrl = '';
let savedRecordingBlob = null;
let savedRecordingDuration = 0;
let recordingStartedAt = 0;
let originalAudio = null;
let mediaStopPromise = null;
let resolveMediaStop = null;
let pcmChunks = [];
let pcmSampleCount = 0;
let pcmSampleRate = 0;
let captureWorkletUrl = '';
const pianoBufferCache = new Map();
const hannWindowCache = new Map();

function createRecordingStats() {
    return {
        totalFrames: 0,
        loudFrames: 0,
        pitchedFrames: 0,
        maxRms: 0,
        maxConfidence: 0,
    };
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function midiToNote(midi) {
    const name = NOTE_NAMES[((midi % 12) + 12) % 12];
    const octave = Math.floor(midi / 12) - 1;
    return `${name}${octave}`;
}

function frequencyToMidi(frequency) {
    return Math.round(69 + 12 * Math.log2(frequency / 440));
}

function midiToFrequency(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
}

function frequencyToNote(frequency) {
    const midi = clamp(frequencyToMidi(frequency), 21, 108);
    const expectedFrequency = midiToFrequency(midi);
    return {
        midi,
        note: midiToNote(midi),
        pitchClass: ((midi % 12) + 12) % 12,
        frequency,
        cents: 1200 * Math.log2(frequency / expectedFrequency),
    };
}

function parabolicMinimum(values, index) {
    const left = values[index - 1];
    const center = values[index];
    const right = values[index + 1];
    const divisor = left - 2 * center + right;
    if (!Number.isFinite(divisor) || Math.abs(divisor) < 0.000001) return index;
    return index + clamp((left - right) / (2 * divisor), -0.5, 0.5);
}

function detectPitch(buffer, sampleRate, threshold) {
    let sum = 0;
    let sumSquares = 0;
    for (let i = 0; i < buffer.length; i += 1) {
        const sample = buffer[i];
        sum += sample;
        sumSquares += sample * sample;
    }

    const rms = Math.sqrt(sumSquares / buffer.length);
    if (rms < threshold) return { frequency: null, confidence: 0, rms, reason: 'quiet' };

    const mean = sum / buffer.length;
    const minLag = Math.floor(sampleRate / MAX_FREQ);
    const maxLag = Math.min(Math.floor(sampleRate / MIN_FREQ), buffer.length - 1);
    const yin = new Float32Array(maxLag + 1);

    for (let tau = 1; tau <= maxLag; tau += 1) {
        let difference = 0;
        const size = buffer.length - tau;

        for (let i = 0; i < size; i += 1) {
            const delta = (buffer[i] - mean) - (buffer[i + tau] - mean);
            difference += delta * delta;
        }

        yin[tau] = difference;
    }

    let cumulativeDifference = 0;
    let bestLag = -1;
    let bestValue = Number.POSITIVE_INFINITY;

    yin[0] = 1;
    for (let tau = 1; tau <= maxLag; tau += 1) {
        cumulativeDifference += yin[tau];
        yin[tau] = cumulativeDifference > 0 ? (yin[tau] * tau) / cumulativeDifference : 1;

        if (tau >= minLag && yin[tau] < bestValue) {
            bestValue = yin[tau];
            bestLag = tau;
        }
    }

    let selectedLag = -1;
    for (let tau = minLag; tau <= maxLag; tau += 1) {
        if (yin[tau] >= YIN_THRESHOLD) continue;

        while (tau + 1 <= maxLag && yin[tau + 1] < yin[tau]) {
            tau += 1;
        }

        selectedLag = tau;
        break;
    }

    if (selectedLag < 0 && bestValue <= YIN_FALLBACK_THRESHOLD) {
        selectedLag = bestLag;
    }

    const confidence = selectedLag > 0 ? 1 - yin[selectedLag] : Math.max(0, 1 - bestValue);
    if (selectedLag < 0 || confidence < MIN_PITCH_CONFIDENCE) {
        return { frequency: null, confidence, rms, reason: 'unclear' };
    }

    const refinedLag = selectedLag > 1 && selectedLag < maxLag
        ? parabolicMinimum(yin, selectedLag)
        : selectedLag;

    return {
        frequency: sampleRate / refinedLag,
        confidence,
        rms,
        reason: 'pitched',
    };
}

function setStatus(text) {
    els.status.textContent = text;
}

function setHoldState(state) {
    els.hold.classList.toggle('recording', state === 'recording');
    els.hold.classList.toggle('processing', state === 'processing');

    if (state === 'recording') {
        els.holdTitle.textContent = '正在聆听';
        els.holdHint.textContent = '松开开始识别';
        return;
    }

    if (state === 'processing') {
        els.holdTitle.textContent = '正在识别';
        els.holdHint.textContent = '整理本次声音';
        return;
    }

    els.holdTitle.textContent = '按住聆听';
    els.holdHint.textContent = '松开后识别音符与音阶';
}

function renderCurrent(noteInfo = null) {
    if (!noteInfo) {
        els.currentNote.textContent = '--';
        els.currentFrequency.textContent = '-- Hz';
        return;
    }

    els.currentNote.textContent = noteInfo.note;
    els.currentFrequency.textContent = `${noteInfo.frequency.toFixed(1)} Hz`;
}

function getRmsThreshold() {
    const sensitivity = clamp(Number(els.sensitivity.value || 9), 1, 10);
    return 0.016 - ((sensitivity - 1) / 9) * 0.014;
}

function getInputGainValue() {
    const sensitivity = clamp(Number(els.sensitivity.value || 9), 1, 10);
    return 1 + Math.pow((sensitivity - 1) / 9, 1.4) * 7;
}

function syncInputGain() {
    if (!inputGain) return;
    inputGain.gain.setTargetAtTime(getInputGainValue(), audioContext?.currentTime || 0, 0.015);
}

function getAudioVolume() {
    return clamp(Number(settingsManager.get('audio', 'volume', 0.8)), 0, 1);
}

function getSequenceDelayMs() {
    return clamp(Number(settingsManager.get('audio', 'noteDelay', 400)), 150, 1200);
}

function getAppRootPath() {
    const currentPath = window.location.pathname;
    if (currentPath.includes('/pages/')) {
        return currentPath.slice(0, currentPath.indexOf('/pages/') + 1);
    }

    return currentPath.replace(/[^/]*$/, '');
}

function noteToSampleName(note) {
    return note.replace('#', 's');
}

function getPianoSampleUrl(note) {
    return `${window.location.origin}${getAppRootPath()}audio/piano/${noteToSampleName(note)}.mp3`;
}

async function getPlaybackContext() {
    if (!playbackContext || playbackContext.state === 'closed') {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        playbackContext = new AudioCtx();
    }

    if (playbackContext.state === 'suspended') {
        await playbackContext.resume();
    }

    return playbackContext;
}

async function loadPianoBuffer(note) {
    if (pianoBufferCache.has(note)) return pianoBufferCache.get(note);

    const context = await getPlaybackContext();
    const response = await fetch(getPianoSampleUrl(note));
    if (!response.ok) {
        throw new Error(`钢琴采样加载失败: ${note} (${response.status})`);
    }

    const buffer = await context.decodeAudioData(await response.arrayBuffer());
    pianoBufferCache.set(note, buffer);
    return buffer;
}

function setPlaybackMode(mode) {
    playbackMode = mode;
    els.play.classList.toggle('playing', mode === 'playing');

    if (mode === 'loading') {
        els.play.textContent = '加载';
        els.play.disabled = true;
        return;
    }

    if (mode === 'playing') {
        els.play.textContent = '停止';
        els.play.disabled = false;
        return;
    }

    els.play.textContent = '播放';
    els.play.disabled = capturedNotes.length === 0;
}

function formatDuration(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0) return '0.0s';
    return `${seconds.toFixed(1)}s`;
}

function getRecordingExtension(blob) {
    if (blob.type.includes('mp4')) return 'm4a';
    if (blob.type.includes('ogg')) return 'ogg';
    if (blob.type.includes('wav')) return 'wav';
    return 'webm';
}

function setRecordingReviewState(state) {
    const hasRecording = !!savedRecordingBlob;
    const isPlaying = state === 'playing';

    els.playRecording.textContent = isPlaying ? '停止原音' : '原音';
    els.playRecording.classList.toggle('playing', isPlaying);
    els.playRecording.disabled = !hasRecording;
    els.clearRecording.disabled = !hasRecording;
    els.recordingLabel.textContent = hasRecording
        ? `原音已保存 ${formatDuration(savedRecordingDuration)}`
        : '原音未保存';

    if (hasRecording) {
        const extension = getRecordingExtension(savedRecordingBlob);
        els.downloadRecording.href = savedRecordingUrl;
        els.downloadRecording.download = `sound-to-scale-recording-${Date.now()}.${extension}`;
        els.downloadRecording.classList.remove('disabled');
        els.downloadRecording.setAttribute('aria-disabled', 'false');
    } else {
        els.downloadRecording.removeAttribute('href');
        els.downloadRecording.classList.add('disabled');
        els.downloadRecording.setAttribute('aria-disabled', 'true');
    }
}

function revokeSavedRecording() {
    if (savedRecordingUrl) URL.revokeObjectURL(savedRecordingUrl);
    savedRecordingUrl = '';
    savedRecordingBlob = null;
    savedRecordingDuration = 0;
}

function stopOriginalPlayback() {
    if (originalAudio) {
        originalAudio.pause();
        originalAudio.currentTime = 0;
        originalAudio = null;
    }

    setRecordingReviewState('idle');
}

function clearSavedRecording() {
    stopOriginalPlayback();
    revokeSavedRecording();
    setRecordingReviewState('idle');
    setStatus('原音已清除');
}

function saveRecordingBlob(blob, duration) {
    stopOriginalPlayback();
    revokeSavedRecording();
    savedRecordingBlob = blob;
    savedRecordingDuration = duration;
    savedRecordingUrl = URL.createObjectURL(blob);
    setRecordingReviewState('idle');
}

function resolveStoppedRecording(blob = null) {
    if (!resolveMediaStop) return;

    resolveMediaStop(blob);
    resolveMediaStop = null;
    mediaStopPromise = null;
}

function getMediaRecorderOptions() {
    const types = [
        'audio/webm;codecs=opus',
        'audio/ogg;codecs=opus',
        'audio/mp4',
    ];
    const mimeType = types.find(type => window.MediaRecorder?.isTypeSupported?.(type));
    return mimeType ? { mimeType } : undefined;
}

function startOriginalRecording() {
    mediaRecorder = null;
    mediaChunks = [];
    recordingStartedAt = performance.now();
    mediaStopPromise = new Promise(resolve => {
        resolveMediaStop = resolve;
    });

    if (!window.MediaRecorder || !micStream) {
        els.recordingLabel.textContent = '浏览器不支持保存原音';
        resolveStoppedRecording(null);
        return;
    }

    try {
        mediaRecorder = new MediaRecorder(micStream, getMediaRecorderOptions());
        mediaRecorder.addEventListener('dataavailable', (event) => {
            if (event.data?.size > 0) mediaChunks.push(event.data);
        });
        mediaRecorder.addEventListener('stop', () => {
            if (mediaChunks.length === 0) {
                resolveStoppedRecording(null);
                return;
            }

            const blob = new Blob(mediaChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
            saveRecordingBlob(blob, (performance.now() - recordingStartedAt) / 1000);
            mediaChunks = [];
            resolveStoppedRecording(blob);
        });
        mediaRecorder.start();
    } catch (error) {
        console.warn('[听音识阶] 原音保存不可用', error);
        mediaRecorder = null;
        els.recordingLabel.textContent = '原音保存不可用';
        resolveStoppedRecording(null);
    }
}

function stopOriginalRecording() {
    const stopped = mediaStopPromise || Promise.resolve(null);

    if (!mediaRecorder) {
        resolveStoppedRecording(null);
        return stopped;
    }

    if (mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    } else {
        resolveStoppedRecording(savedRecordingBlob);
    }

    return stopped;
}

function playSavedRecording() {
    if (!savedRecordingUrl) {
        setStatus('没有保存的原音');
        return;
    }

    if (originalAudio) {
        stopOriginalPlayback();
        setStatus('已停止原音');
        return;
    }

    stopPlayback();
    originalAudio = new Audio(savedRecordingUrl);
    originalAudio.volume = getAudioVolume();
    originalAudio.addEventListener('ended', () => {
        originalAudio = null;
        setRecordingReviewState('idle');
        setStatus('原音播放完成');
    }, { once: true });
    originalAudio.addEventListener('error', () => {
        originalAudio = null;
        setRecordingReviewState('idle');
        setStatus('原音播放失败');
    }, { once: true });
    setRecordingReviewState('playing');
    setStatus('播放原音');
    originalAudio.play().catch(error => {
        console.warn('[听音识阶] 原音播放失败', error);
        originalAudio = null;
        setRecordingReviewState('idle');
        setStatus('原音播放失败');
    });
}

function setNotePlaybackState(index, active) {
    const chip = els.sequence.querySelector(`.note-chip[data-index="${index}"]`);
    if (chip) chip.classList.toggle('playing', active);
}

function clearNotePlaybackStates() {
    els.sequence.querySelectorAll('.note-chip.playing').forEach(chip => chip.classList.remove('playing'));
}

function stopPlayback(showStatus = false) {
    playbackRunId += 1;
    playbackTimers.forEach(timer => window.clearTimeout(timer));
    playbackTimers = [];

    playbackSources.forEach(source => {
        try {
            source.stop();
        } catch {
            // Source may already have ended.
        }
    });
    playbackSources = [];
    clearNotePlaybackStates();
    setPlaybackMode('idle');

    if (showStatus) setStatus('已停止播放');
}

function startPianoBuffer(buffer, note, index, when, runId) {
    const source = playbackContext.createBufferSource();
    const gain = playbackContext.createGain();
    source.buffer = buffer;
    gain.gain.value = getAudioVolume();
    source.connect(gain);
    gain.connect(playbackContext.destination);

    const highlightDelay = Math.max(0, (when - playbackContext.currentTime) * 1000);
    const highlightTimer = window.setTimeout(() => {
        if (runId !== playbackRunId) return;
        setNotePlaybackState(index, true);
        setStatus(`播放 ${note}`);
    }, highlightDelay);
    playbackTimers.push(highlightTimer);

    source.onended = () => {
        playbackSources = playbackSources.filter(item => item !== source);
        setNotePlaybackState(index, false);
    };

    source.start(when);
    source.stop(when + Math.min(buffer.duration, NOTE_PLAY_SECONDS));
    playbackSources.push(source);
}

async function playCapturedNote(index) {
    const item = capturedNotes[index];
    if (!item) return;

    stopOriginalPlayback();
    stopPlayback();
    const runId = playbackRunId;
    setPlaybackMode('loading');
    setStatus(`加载 ${item.note}`);

    try {
        await getPlaybackContext();
        const buffer = await loadPianoBuffer(item.note);
        if (runId !== playbackRunId) return;

        setPlaybackMode('playing');
        startPianoBuffer(buffer, item.note, index, playbackContext.currentTime, runId);
        const doneTimer = window.setTimeout(() => {
            if (runId !== playbackRunId) return;
            setPlaybackMode('idle');
            setStatus(`已播放 ${item.note}`);
        }, NOTE_PLAY_SECONDS * 1000 + 120);
        playbackTimers.push(doneTimer);
    } catch (error) {
        console.error('[听音识阶] 播放识别音失败', error);
        if (runId === playbackRunId) {
            setPlaybackMode('idle');
            setStatus('钢琴采样加载失败');
        }
    }
}

async function playCapturedSequence() {
    if (playbackMode === 'playing') {
        stopPlayback(true);
        return;
    }

    if (capturedNotes.length === 0) {
        setStatus('没有可播放的音');
        return;
    }

    stopPlayback();
    stopOriginalPlayback();
    const runId = playbackRunId;
    const notes = capturedNotes.map(item => item.note);
    setPlaybackMode('loading');
    setStatus('加载钢琴采样');

    try {
        await getPlaybackContext();
        const buffers = await Promise.all(notes.map(loadPianoBuffer));
        if (runId !== playbackRunId) return;

        const delaySeconds = getSequenceDelayMs() / 1000;
        const startAt = playbackContext.currentTime + 0.04;
        setPlaybackMode('playing');

        buffers.forEach((buffer, index) => {
            startPianoBuffer(buffer, notes[index], index, startAt + index * delaySeconds, runId);
        });

        const totalMs = ((notes.length - 1) * delaySeconds + NOTE_PLAY_SECONDS) * 1000 + 160;
        const doneTimer = window.setTimeout(() => {
            if (runId !== playbackRunId) return;
            clearNotePlaybackStates();
            setPlaybackMode('idle');
            setStatus('播放完成');
        }, totalMs);
        playbackTimers.push(doneTimer);
    } catch (error) {
        console.error('[听音识阶] 播放识别序列失败', error);
        if (runId === playbackRunId) {
            setPlaybackMode('idle');
            setStatus('钢琴采样加载失败');
        }
    }
}

function buildScaleCandidate(root, type, pitchClasses) {
    const scaleClasses = type.offsets.map(offset => (root + offset) % 12);
    const scaleSet = new Set(scaleClasses);
    const matched = pitchClasses.filter(pc => scaleSet.has(pc)).length;
    const score = pitchClasses.length === 0 ? 0 : matched / pitchClasses.length;
    const degreeMap = new Map();
    scaleClasses.forEach((pc, index) => degreeMap.set(pc, type.degrees[index]));

    return {
        name: `${NOTE_NAMES[root]}${type.label}`,
        matched,
        total: pitchClasses.length,
        score,
        degreeMap,
    };
}

function analyzeScales() {
    const pitchClasses = [...new Set(capturedNotes.map(item => item.pitchClass))];
    if (pitchClasses.length < 2) {
        bestScale = null;
        return [];
    }

    const candidates = [];
    for (let root = 0; root < 12; root += 1) {
        SCALE_TYPES.forEach(type => candidates.push(buildScaleCandidate(root, type, pitchClasses)));
    }

    candidates.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return b.matched - a.matched;
    });

    bestScale = candidates[0] || null;
    return candidates.slice(0, 3);
}

function renderScaleCandidates() {
    const candidates = analyzeScales();
    if (candidates.length === 0) {
        els.scaleCandidates.className = 'scale-candidates empty';
        els.scaleCandidates.textContent = '等待更多音符';
        return;
    }

    els.scaleCandidates.className = 'scale-candidates';
    els.scaleCandidates.innerHTML = candidates.map((candidate, index) => `
        <div class="scale-candidate ${index === 0 ? 'best' : ''}">
            <strong>${candidate.name}</strong>
            <span>${Math.round(candidate.score * 100)}%</span>
        </div>
    `).join('');
}

function renderDegrees() {
    if (!bestScale || capturedNotes.length === 0) {
        els.degreeSequence.textContent = '--';
        return;
    }

    els.degreeSequence.textContent = capturedNotes
        .map(item => bestScale.degreeMap.get(item.pitchClass) || '?')
        .join(' ');
}

function renderSequence() {
    if (capturedNotes.length === 0) {
        els.sequence.className = 'note-sequence empty';
        els.sequence.textContent = '按住上方按钮开始';
    } else {
        els.sequence.className = 'note-sequence';
        els.sequence.innerHTML = capturedNotes
            .map((item, index) => `
                <button class="note-chip" type="button" data-index="${index}" aria-label="播放 ${item.note}" title="播放 ${item.note}">
                    ${item.note}
                </button>
            `)
            .join('');
    }

    renderScaleCandidates();
    renderDegrees();
    setPlaybackMode(playbackMode === 'playing' ? 'playing' : 'idle');
}

function median(values) {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
        ? (sorted[middle - 1] + sorted[middle]) / 2
        : sorted[middle];
}

function percentile(values, ratio) {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = clamp(Math.round((sorted.length - 1) * ratio), 0, sorted.length - 1);
    return sorted[index];
}

function nextPowerOfTwo(value) {
    let power = 1;
    while (power < value) power *= 2;
    return power;
}

function getHannWindow(size) {
    if (hannWindowCache.has(size)) return hannWindowCache.get(size);

    const windowValues = new Float32Array(size);
    for (let index = 0; index < size; index += 1) {
        windowValues[index] = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / Math.max(1, size - 1));
    }

    hannWindowCache.set(size, windowValues);
    return windowValues;
}

function calculateRmsRange(samples, start, end) {
    const safeStart = clamp(Math.floor(start), 0, samples.length);
    const safeEnd = clamp(Math.floor(end), safeStart, samples.length);
    const length = safeEnd - safeStart;
    if (length <= 0) return 0;

    let sumSquares = 0;
    for (let index = safeStart; index < safeEnd; index += 1) {
        const sample = samples[index];
        sumSquares += sample * sample;
    }

    return Math.sqrt(sumSquares / length);
}

function getPeakAmplitude(samples) {
    let peak = 0;
    for (let index = 0; index < samples.length; index += 1) {
        peak = Math.max(peak, Math.abs(samples[index]));
    }
    return peak;
}

function audioBufferToMono(audioBuffer) {
    const samples = new Float32Array(audioBuffer.length);
    const channelCount = Math.max(1, audioBuffer.numberOfChannels);

    for (let channel = 0; channel < channelCount; channel += 1) {
        const data = audioBuffer.getChannelData(channel);
        for (let index = 0; index < samples.length; index += 1) {
            samples[index] += data[index] / channelCount;
        }
    }

    return samples;
}

function normalizeSamples(samples) {
    const peak = getPeakAmplitude(samples);
    const rawRms = calculateRmsRange(samples, 0, samples.length);
    if (peak <= 0.000001) {
        return { samples: new Float32Array(samples), peak, rawRms, gain: 1 };
    }

    const gain = Math.min(24, 0.9 / peak);
    const normalized = new Float32Array(samples.length);
    for (let index = 0; index < samples.length; index += 1) {
        normalized[index] = clamp(samples[index] * gain, -1, 1);
    }

    return { samples: normalized, peak, rawRms, gain };
}

function removeDcAndHighPass(samples, sampleRate) {
    if (samples.length === 0) return samples;

    let mean = 0;
    for (let index = 0; index < samples.length; index += 1) {
        mean += samples[index];
    }
    mean /= samples.length;

    const filtered = new Float32Array(samples.length);
    const cutoff = 70;
    const rc = 1 / (2 * Math.PI * cutoff);
    const dt = 1 / sampleRate;
    const alpha = rc / (rc + dt);
    let previousInput = samples[0] - mean;
    let previousOutput = 0;

    for (let index = 0; index < samples.length; index += 1) {
        const input = samples[index] - mean;
        const output = alpha * (previousOutput + input - previousInput);
        filtered[index] = output;
        previousInput = input;
        previousOutput = output;
    }

    return filtered;
}

function estimateNoiseProfile(samples, sampleRate, frameSize, hopSize) {
    const candidates = [];
    const leadingUntil = Math.min(samples.length, Math.round((sampleRate * DENOISE_NOISE_PROFILE_MS) / 1000));

    for (let start = 0; start < samples.length; start += hopSize) {
        const end = Math.min(start + frameSize, samples.length);
        if (end - start < frameSize * 0.7) break;
        const rms = calculateRmsRange(samples, start, end);
        const prefer = start < leadingUntil ? -0.00001 : 0;
        candidates.push({ start, rms: rms + prefer });
    }

    if (candidates.length === 0) return null;

    candidates.sort((a, b) => a.rms - b.rms);
    const selected = candidates.slice(0, clamp(Math.ceil(candidates.length * 0.18), 3, 12));
    const noise = new Float32Array(frameSize / 2 + 1);
    const real = new Float32Array(frameSize);
    const imag = new Float32Array(frameSize);
    const windowValues = getHannWindow(frameSize);

    selected.forEach(candidate => {
        real.fill(0);
        imag.fill(0);
        for (let index = 0; index < frameSize; index += 1) {
            real[index] = (samples[candidate.start + index] || 0) * windowValues[index];
        }
        runFft(real, imag);
        for (let bin = 0; bin < noise.length; bin += 1) {
            noise[bin] += Math.hypot(real[bin], imag[bin]);
        }
    });

    for (let bin = 0; bin < noise.length; bin += 1) {
        noise[bin] /= selected.length;
    }

    return noise;
}

function inverseFft(real, imag) {
    for (let index = 0; index < real.length; index += 1) {
        imag[index] = -imag[index];
    }

    runFft(real, imag);

    const scale = 1 / real.length;
    for (let index = 0; index < real.length; index += 1) {
        real[index] *= scale;
        imag[index] = (-imag[index]) * scale;
    }
}

function spectralDenoise(samples, sampleRate) {
    if (samples.length < sampleRate * 0.18) return samples;

    const frameSize = nextPowerOfTwo(Math.round((sampleRate * DENOISE_FRAME_MS) / 1000));
    const hopSize = Math.floor(frameSize / 2);
    const noise = estimateNoiseProfile(samples, sampleRate, frameSize, hopSize);
    if (!noise) return samples;

    const output = new Float32Array(samples.length + frameSize);
    const weights = new Float32Array(output.length);
    const real = new Float32Array(frameSize);
    const imag = new Float32Array(frameSize);
    const windowValues = getHannWindow(frameSize);
    const floor = 0.12;

    for (let start = 0; start < samples.length; start += hopSize) {
        real.fill(0);
        imag.fill(0);

        for (let index = 0; index < frameSize; index += 1) {
            real[index] = (samples[start + index] || 0) * windowValues[index];
        }

        runFft(real, imag);

        for (let bin = 0; bin <= frameSize / 2; bin += 1) {
            const magnitude = Math.hypot(real[bin], imag[bin]);
            const noiseMagnitude = noise[bin] || 0;
            const signalOverNoise = magnitude / Math.max(noiseMagnitude, 0.000001);
            const reduction = signalOverNoise > 8
                ? 1
                : clamp((magnitude - noiseMagnitude * 1.55) / Math.max(magnitude, 0.000001), floor, 1);
            real[bin] *= reduction;
            imag[bin] *= reduction;

            if (bin > 0 && bin < frameSize / 2) {
                const mirror = frameSize - bin;
                real[mirror] *= reduction;
                imag[mirror] *= reduction;
            }
        }

        inverseFft(real, imag);

        for (let index = 0; index < frameSize; index += 1) {
            const outIndex = start + index;
            const weight = windowValues[index];
            output[outIndex] += real[index] * weight;
            weights[outIndex] += weight * weight;
        }
    }

    const denoised = new Float32Array(samples.length);
    for (let index = 0; index < denoised.length; index += 1) {
        denoised[index] = weights[index] > 0 ? output[index] / weights[index] : samples[index];
    }

    return denoised;
}

function softNoiseGate(samples, sampleRate) {
    const filtered = new Float32Array(samples);
    const noiseWindow = Math.max(512, Math.min(filtered.length, Math.round(sampleRate * 0.25)));
    const leadingRms = calculateRmsRange(filtered, 0, noiseWindow);
    const gate = Math.min(0.01, leadingRms * 1.1);

    if (gate <= 0.00008) return filtered;

    for (let index = 0; index < filtered.length; index += 1) {
        const value = filtered[index];
        const magnitude = Math.abs(value);
        if (magnitude < gate) {
            filtered[index] = 0;
        } else {
            filtered[index] = Math.sign(value) * (magnitude - gate * 0.65);
        }
    }

    return filtered;
}

function preprocessSamples(samples, sampleRate) {
    const highPassed = removeDcAndHighPass(samples, sampleRate);
    const denoised = spectralDenoise(highPassed, sampleRate);
    return softNoiseGate(denoised, sampleRate);
}

function resetPcmCapture() {
    pcmChunks = [];
    pcmSampleCount = 0;
    pcmSampleRate = audioContext?.sampleRate || 0;
}

function appendPcmCapture(inputBuffer) {
    if (!recording || !inputBuffer) return;

    const channelCount = Math.max(1, inputBuffer.numberOfChannels);
    const length = inputBuffer.length;
    const chunk = new Float32Array(length);

    for (let channel = 0; channel < channelCount; channel += 1) {
        const data = inputBuffer.getChannelData(channel);
        for (let index = 0; index < length; index += 1) {
            chunk[index] += data[index] / channelCount;
        }
    }

    pcmChunks.push(chunk);
    pcmSampleCount += chunk.length;
}

function appendPcmSamples(samples) {
    if (!recording || !samples?.length) return;

    const chunk = new Float32Array(samples);
    pcmChunks.push(chunk);
    pcmSampleCount += chunk.length;
}

function getCapturedPcmRecording() {
    if (pcmSampleCount === 0 || !pcmSampleRate) return null;

    const samples = new Float32Array(pcmSampleCount);
    let offset = 0;
    pcmChunks.forEach(chunk => {
        samples.set(chunk, offset);
        offset += chunk.length;
    });

    return {
        samples,
        sampleRate: pcmSampleRate,
    };
}

function runFft(real, imag) {
    const size = real.length;
    let reversed = 0;

    for (let index = 1; index < size; index += 1) {
        let bit = size >> 1;
        while (reversed & bit) {
            reversed ^= bit;
            bit >>= 1;
        }
        reversed ^= bit;

        if (index < reversed) {
            const tempReal = real[index];
            const tempImag = imag[index];
            real[index] = real[reversed];
            imag[index] = imag[reversed];
            real[reversed] = tempReal;
            imag[reversed] = tempImag;
        }
    }

    for (let length = 2; length <= size; length *= 2) {
        const angle = (-2 * Math.PI) / length;
        const stepReal = Math.cos(angle);
        const stepImag = Math.sin(angle);

        for (let offset = 0; offset < size; offset += length) {
            let unitReal = 1;
            let unitImag = 0;
            const half = length / 2;

            for (let index = 0; index < half; index += 1) {
                const evenIndex = offset + index;
                const oddIndex = evenIndex + half;
                const oddReal = real[oddIndex] * unitReal - imag[oddIndex] * unitImag;
                const oddImag = real[oddIndex] * unitImag + imag[oddIndex] * unitReal;

                real[oddIndex] = real[evenIndex] - oddReal;
                imag[oddIndex] = imag[evenIndex] - oddImag;
                real[evenIndex] += oddReal;
                imag[evenIndex] += oddImag;

                const nextReal = unitReal * stepReal - unitImag * stepImag;
                unitImag = unitReal * stepImag + unitImag * stepReal;
                unitReal = nextReal;
            }
        }
    }
}

function computeSpectrumMagnitudes(samples, start, frameSize, fftSize, maxBin) {
    const real = new Float32Array(fftSize);
    const imag = new Float32Array(fftSize);
    const windowValues = getHannWindow(frameSize);
    const available = Math.max(0, Math.min(frameSize, samples.length - start));

    for (let index = 0; index < available; index += 1) {
        real[index] = samples[start + index] * windowValues[index];
    }

    runFft(real, imag);

    const magnitudes = new Float32Array(maxBin + 1);
    const scale = 1 / fftSize;
    for (let bin = 0; bin <= maxBin; bin += 1) {
        magnitudes[bin] = Math.log1p(Math.hypot(real[bin], imag[bin]) * scale * 120);
    }

    return magnitudes;
}

function createOfflineFeatureFrames(samples, sampleRate) {
    const frameSize = nextPowerOfTwo(Math.max(1024, Math.round((sampleRate * OFFLINE_FRAME_MS) / 1000)));
    const hopSize = Math.max(128, Math.round((sampleRate * OFFLINE_HOP_MS) / 1000));
    const maxBin = Math.min(
        Math.floor((OFFLINE_SPECTRUM_MAX_FREQ / sampleRate) * frameSize),
        Math.floor(frameSize / 2),
    );
    const features = [];
    let previousMagnitudes = null;

    for (let start = 0; start < samples.length; start += hopSize) {
        const end = Math.min(start + frameSize, samples.length);
        const length = end - start;
        if (features.length > 0 && length < frameSize * 0.35) break;

        const magnitudes = computeSpectrumMagnitudes(samples, start, frameSize, frameSize, maxBin);
        let spectralFlux = 0;
        if (previousMagnitudes) {
            for (let bin = 1; bin <= maxBin; bin += 1) {
                spectralFlux += Math.max(0, magnitudes[bin] - previousMagnitudes[bin]);
            }
            spectralFlux /= Math.max(1, maxBin);
        }

        features.push({
            startMs: (start / sampleRate) * 1000,
            endMs: (end / sampleRate) * 1000,
            time: ((start + length / 2) / sampleRate) * 1000,
            rms: calculateRmsRange(samples, start, end),
            spectralFlux,
        });
        previousMagnitudes = magnitudes;
    }

    return features;
}

function getOfflineThresholds(features) {
    const rmsValues = features.map(frame => frame.rms);
    const fluxValues = features.map(frame => frame.spectralFlux);
    const leadingRms = features.slice(0, Math.min(12, features.length)).map(frame => frame.rms);
    const noiseRms = Math.max(0.0001, Math.min(median(leadingRms), percentile(rmsValues, 0.35)));
    const highRms = percentile(rmsValues, 0.9);
    const activeRms = Math.max(0.004, noiseRms * 2.2, highRms * 0.18);
    const fluxMedian = percentile(fluxValues, 0.5);
    const fluxHigh = percentile(fluxValues, 0.9);
    const flux = Math.max(0.006, fluxMedian * 2.4, fluxHigh * 0.45);

    return {
        activeRms,
        noiseRms,
        flux,
    };
}

function smoothFeatureFlux(features) {
    return features.map((frame, index) => {
        const previous = features[index - 1]?.spectralFlux ?? frame.spectralFlux;
        const next = features[index + 1]?.spectralFlux ?? frame.spectralFlux;
        return (previous + frame.spectralFlux * 2 + next) / 4;
    });
}

function getLocalFluxBaseline(smoothedFlux, index) {
    const start = Math.max(0, index - 6);
    const end = Math.min(smoothedFlux.length, index + 7);
    return median(smoothedFlux.slice(start, end));
}

function getActiveRanges(features, thresholds) {
    const ranges = [];
    let current = null;

    features.forEach(frame => {
        if (frame.rms >= thresholds.activeRms) {
            if (!current) current = { startMs: frame.startMs, endMs: frame.endMs };
            current.endMs = frame.endMs;
            return;
        }

        if (current) {
            ranges.push(current);
            current = null;
        }
    });

    if (current) ranges.push(current);

    return ranges.reduce((merged, range) => {
        const previous = merged[merged.length - 1];
        if (previous && range.startMs - previous.endMs <= 90) {
            previous.endMs = range.endMs;
        } else if (range.endMs - range.startMs >= OFFLINE_MIN_SEGMENT_MS * 0.65) {
            merged.push({ ...range });
        }
        return merged;
    }, []);
}

function findOfflineOnsets(features, thresholds) {
    const onsets = [];
    let lastOnset = -Number.POSITIVE_INFINITY;
    const smoothedFlux = smoothFeatureFlux(features);

    for (let index = 1; index < features.length - 1; index += 1) {
        const previous = features[index - 1];
        const current = features[index];
        const baseline = getLocalFluxBaseline(smoothedFlux, index);
        const enoughGap = current.time - lastOnset >= OFFLINE_ONSET_MIN_GAP_MS;
        const active = current.rms >= thresholds.activeRms;
        const localFluxPeak = smoothedFlux[index] >= smoothedFlux[index - 1]
            && smoothedFlux[index] >= smoothedFlux[index + 1];
        const fluxOnset = localFluxPeak
            && smoothedFlux[index] >= thresholds.flux
            && smoothedFlux[index] >= baseline * 1.55;
        const rmsRise = current.rms - previous.rms >= thresholds.activeRms * 0.45
            && current.rms / Math.max(previous.rms, thresholds.noiseRms) >= 1.35;

        if (active && enoughGap && (fluxOnset || rmsRise)) {
            let onsetIndex = index;
            while (
                onsetIndex > 0
                && current.time - features[onsetIndex - 1].time < 90
                && features[onsetIndex - 1].rms > thresholds.noiseRms * 1.25
                && features[onsetIndex - 1].rms <= features[onsetIndex].rms * 1.12
            ) {
                onsetIndex -= 1;
            }

            onsets.push(features[onsetIndex].startMs);
            lastOnset = current.time;
        }
    }

    return onsets;
}

function getFeatureAtTime(features, timeMs) {
    if (features.length === 0) return null;
    let best = features[0];
    let bestDistance = Math.abs(best.time - timeMs);

    for (let index = 1; index < features.length; index += 1) {
        const distance = Math.abs(features[index].time - timeMs);
        if (distance < bestDistance) {
            best = features[index];
            bestDistance = distance;
        }
    }

    return best;
}

function normalizeBoundaryPoints(points, range) {
    return [...points]
        .sort((a, b) => a - b)
        .reduce((result, point) => {
            const clamped = clamp(point, range.startMs, range.endMs);
            const previous = result[result.length - 1];
            if (previous === undefined || clamped - previous >= OFFLINE_ONSET_MIN_GAP_MS * 0.55) {
                result.push(clamped);
            }
            return result;
        }, []);
}

function refineSegmentsByEnergy(segments, features, thresholds) {
    const refined = [];

    segments.forEach(segment => {
        const duration = segment.endMs - segment.startMs;
        const startFeature = getFeatureAtTime(features, segment.startMs);
        const middleFeature = getFeatureAtTime(features, (segment.startMs + segment.endMs) / 2);
        const segmentRms = middleFeature?.rms || startFeature?.rms || 0;
        const tooShort = duration < OFFLINE_MIN_SEGMENT_MS;
        const weakTail = refined.length > 0
            && duration < OFFLINE_MIN_SEGMENT_MS * 1.7
            && segmentRms < thresholds.activeRms * 1.45;

        if (tooShort || weakTail) {
            const previous = refined[refined.length - 1];
            if (previous) previous.endMs = Math.max(previous.endMs, segment.endMs);
            return;
        }

        refined.push({ ...segment });
    });

    return refined;
}

function createOfflineSegments(features, durationMs) {
    if (features.length === 0) {
        return {
            segments: [],
            thresholds: { activeRms: 0, noiseRms: 0, flux: 0 },
            ranges: [],
            onsets: [],
        };
    }

    const thresholds = getOfflineThresholds(features);
    const ranges = getActiveRanges(features, thresholds);
    const onsets = findOfflineOnsets(features, thresholds);
    const segments = [];

    ranges.forEach(range => {
        const points = [range.startMs];
        onsets.forEach(onset => {
            const farFromStart = onset - range.startMs > OFFLINE_ONSET_MIN_GAP_MS * 0.5;
            const hasRoomAfter = range.endMs - onset > OFFLINE_MIN_SEGMENT_MS * 0.5;
            const farFromPrevious = onset - points[points.length - 1] >= OFFLINE_ONSET_MIN_GAP_MS;
            if (onset > range.startMs && onset < range.endMs && farFromStart && hasRoomAfter && farFromPrevious) {
                points.push(onset);
            }
        });
        const boundaries = normalizeBoundaryPoints([...points, range.endMs], range);

        boundaries.slice(0, -1).forEach((startMs, index) => {
            const endMs = boundaries[index + 1];
            if (endMs - startMs >= OFFLINE_MIN_SEGMENT_MS) {
                segments.push({
                    startMs: clamp(startMs, 0, durationMs),
                    endMs: clamp(endMs, 0, durationMs),
                });
            }
        });
    });

    return { segments: refineSegmentsByEnergy(segments, features, thresholds), thresholds, ranges, onsets };
}

function periodicityAtFrequency(buffer, sampleRate, frequency) {
    const lag = Math.round(sampleRate / frequency);
    if (lag < 1 || lag >= buffer.length - 1) return 0;

    let mean = 0;
    for (let index = 0; index < buffer.length; index += 1) {
        mean += buffer[index];
    }
    mean /= buffer.length;

    let correlation = 0;
    let energyA = 0;
    let energyB = 0;
    for (let index = 0; index < buffer.length - lag; index += 1) {
        const current = buffer[index] - mean;
        const delayed = buffer[index + lag] - mean;
        correlation += current * delayed;
        energyA += current * current;
        energyB += delayed * delayed;
    }

    if (energyA <= 0 || energyB <= 0) return 0;
    return correlation / Math.sqrt(energyA * energyB);
}

function spectralMagnitudeAtFrequency(buffer, sampleRate, frequency) {
    const windowValues = getHannWindow(buffer.length);
    let real = 0;
    let imag = 0;
    let weight = 0;

    for (let index = 0; index < buffer.length; index += 1) {
        const phase = (-2 * Math.PI * frequency * index) / sampleRate;
        const sample = buffer[index] * windowValues[index];
        real += sample * Math.cos(phase);
        imag += sample * Math.sin(phase);
        weight += windowValues[index];
    }

    return Math.hypot(real, imag) / Math.max(1, weight);
}

function buildSegmentPitchBuffer(samples, sampleRate, segment, attackSkipMs = OFFLINE_ATTACK_SKIP_MS) {
    const durationMs = segment.endMs - segment.startMs;
    const skippedMs = Math.min(attackSkipMs, durationMs * 0.28);
    const startSample = Math.floor(((segment.startMs + skippedMs) / 1000) * sampleRate);
    const endSample = Math.floor((segment.endMs / 1000) * sampleRate);
    const length = Math.max(0, endSample - startSample);
    if (length < sampleRate * 0.06) return null;

    const maxLength = Math.min(length, Math.round(sampleRate * 0.55));
    const offset = Math.max(0, Math.floor((length - maxLength) / 2));
    return samples.slice(startSample + offset, startSample + offset + maxLength);
}

function getMagnitudeFromSpectrum(magnitudes, sampleRate, fftSize, frequency) {
    if (frequency <= 0 || frequency >= sampleRate / 2) return 0;

    const exactBin = (frequency / sampleRate) * fftSize;
    const centerBin = Math.round(exactBin);
    let best = 0;

    for (let bin = centerBin - 1; bin <= centerBin + 1; bin += 1) {
        if (bin >= 0 && bin < magnitudes.length) best = Math.max(best, magnitudes[bin]);
    }

    return best;
}

function computeLinearSpectrum(buffer, sampleRate) {
    const fftSize = nextPowerOfTwo(Math.max(2048, buffer.length));
    const real = new Float32Array(fftSize);
    const imag = new Float32Array(fftSize);
    const windowValues = getHannWindow(buffer.length);
    const maxBin = Math.floor(fftSize / 2);

    for (let index = 0; index < buffer.length; index += 1) {
        real[index] = buffer[index] * windowValues[index];
    }

    runFft(real, imag);

    const magnitudes = new Float32Array(maxBin + 1);
    let peak = 0;
    for (let bin = 0; bin <= maxBin; bin += 1) {
        const frequency = (bin / fftSize) * sampleRate;
        if (frequency < MIN_FREQ || frequency > OFFLINE_SPECTRUM_MAX_FREQ) continue;
        const magnitude = Math.hypot(real[bin], imag[bin]);
        magnitudes[bin] = magnitude;
        peak = Math.max(peak, magnitude);
    }

    return { magnitudes, fftSize, peak };
}

function scoreMidiCandidate(magnitudes, sampleRate, fftSize, peak, midi) {
    const frequency = midiToFrequency(midi);
    if (frequency < MIN_FREQ || frequency > MAX_FREQ) return 0;

    let harmonicScore = 0;
    let harmonicWeight = 0;
    for (let harmonic = 1; harmonic <= 6; harmonic += 1) {
        const harmonicFrequency = frequency * harmonic;
        if (harmonicFrequency > Math.min(OFFLINE_SPECTRUM_MAX_FREQ, sampleRate / 2)) break;

        const weight = 1 / Math.sqrt(harmonic);
        harmonicScore += getMagnitudeFromSpectrum(magnitudes, sampleRate, fftSize, harmonicFrequency) * weight;
        harmonicWeight += weight;
    }

    if (harmonicWeight <= 0 || peak <= 0) return 0;

    const normalizedHarmonics = harmonicScore / harmonicWeight / peak;
    const fundamental = getMagnitudeFromSpectrum(magnitudes, sampleRate, fftSize, frequency) / peak;
    const subHarmonic = getMagnitudeFromSpectrum(magnitudes, sampleRate, fftSize, frequency / 2) / peak;
    const octavePenalty = subHarmonic > fundamental * 1.25 ? 0.72 : 1;

    return normalizedHarmonics * (0.55 + fundamental * 0.45) * octavePenalty;
}

function scoreHpsMidiCandidate(magnitudes, sampleRate, fftSize, peak, midi) {
    const frequency = midiToFrequency(midi);
    if (frequency < MIN_FREQ || frequency > MAX_FREQ || peak <= 0) return 0;

    let score = 1;
    let factors = 0;
    for (let harmonic = 1; harmonic <= 4; harmonic += 1) {
        const magnitude = getMagnitudeFromSpectrum(magnitudes, sampleRate, fftSize, frequency * harmonic) / peak;
        score *= Math.max(0.015, magnitude);
        factors += 1;
    }

    return factors > 0 ? Math.pow(score, 1 / factors) : 0;
}

function detectSpectralPitch(buffer, sampleRate, hintMidi = null) {
    if (!buffer || buffer.length < sampleRate * 0.06) return null;

    const { magnitudes, fftSize, peak } = computeLinearSpectrum(buffer, sampleRate);
    if (peak <= 0) return null;

    const candidates = [];
    const minMidi = 21;
    const maxMidi = 96;
    for (let midi = minMidi; midi <= maxMidi; midi += 1) {
        const harmonicScore = scoreMidiCandidate(magnitudes, sampleRate, fftSize, peak, midi);
        const hpsScore = scoreHpsMidiCandidate(magnitudes, sampleRate, fftSize, peak, midi);
        let score = harmonicScore * 0.68 + hpsScore * 0.32;
        if (hintMidi !== null) {
            const distance = Math.abs(midi - hintMidi);
            if (distance <= 1) score *= 1.18;
            else if (distance <= 2) score *= 1.06;
        }
        candidates.push({ midi, score });
    }

    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];
    const second = candidates.find(candidate => candidate.midi !== best.midi) || { score: 0 };
    if (!best || best.score < 0.035 || best.score < second.score * 1.08) return null;

    const frequency = midiToFrequency(best.midi);
    return {
        note: midiToNote(best.midi),
        midi: best.midi,
        pitchClass: ((best.midi % 12) + 12) % 12,
        frequency,
        cents: 0,
        confidence: clamp(best.score / Math.max(0.001, second.score), 0, 2) / 2,
        score: best.score,
    };
}

function mergePitchEstimates(yinNote, spectralNote) {
    if (!spectralNote) return yinNote;
    if (!yinNote) return spectralNote;

    const distance = Math.abs(yinNote.midi - spectralNote.midi);
    if (distance === 0) {
        return {
            ...yinNote,
            confidence: Math.max(yinNote.confidence || 0, spectralNote.confidence || 0),
        };
    }

    if (distance === 12 && (spectralNote.score || 0) >= 0.05) {
        return spectralNote;
    }

    if ((spectralNote.score || 0) >= 0.09 && (spectralNote.confidence || 0) >= 0.56) {
        return spectralNote;
    }

    return yinNote;
}

function correctOctaveFrequency(buffer, sampleRate, frequency) {
    const lowerFrequency = frequency / 2;
    if (lowerFrequency < MIN_FREQ) return frequency;

    const midi = frequencyToMidi(frequency);
    const currentScore = periodicityAtFrequency(buffer, sampleRate, frequency);
    const lowerScore = periodicityAtFrequency(buffer, sampleRate, lowerFrequency);
    const currentMagnitude = spectralMagnitudeAtFrequency(buffer, sampleRate, frequency);
    const lowerMagnitude = spectralMagnitudeAtFrequency(buffer, sampleRate, lowerFrequency);
    const lowerHasSpectralSupport = lowerMagnitude >= currentMagnitude * (midi >= 72 ? 0.22 : 0.32);
    const requiredRatio = midi >= 72 ? 0.84 : 0.95;

    if (lowerHasSpectralSupport && lowerScore > 0.52 && lowerScore >= currentScore * requiredRatio) {
        return lowerFrequency;
    }

    return frequency;
}

function analyzeOfflineSegment(samples, sampleRate, segment) {
    const durationMs = segment.endMs - segment.startMs;
    if (durationMs < OFFLINE_MIN_SEGMENT_MS) return null;

    const attackSkipMs = Math.min(OFFLINE_ATTACK_SKIP_MS, durationMs * 0.28);
    const startSample = Math.floor(((segment.startMs + attackSkipMs) / 1000) * sampleRate);
    const endSample = Math.floor((segment.endMs / 1000) * sampleRate);
    const segmentRms = calculateRmsRange(samples, startSample, endSample);
    const pitchThreshold = Math.max(0.0015, segmentRms * 0.12, getRmsThreshold() * 0.25);
    const hopSize = Math.max(256, Math.round(sampleRate * 0.025));
    const pitchBuffer = new Float32Array(BUFFER_SIZE);
    const frames = [];

    for (let start = startSample; start < endSample; start += hopSize) {
        const available = Math.min(BUFFER_SIZE, endSample - start);
        if (available < BUFFER_SIZE * 0.25 && frames.length > 0) break;

        pitchBuffer.fill(0);
        pitchBuffer.set(samples.subarray(start, Math.min(start + BUFFER_SIZE, endSample)));
        const result = detectPitch(pitchBuffer, sampleRate, pitchThreshold);
        if (!result.frequency) continue;

        const correctedFrequency = correctOctaveFrequency(pitchBuffer, sampleRate, result.frequency);
        const noteInfo = frequencyToNote(correctedFrequency);
        frames.push({
            time: (start / sampleRate) * 1000,
            note: noteInfo.note,
            midi: noteInfo.midi,
            pitchClass: noteInfo.pitchClass,
            frequency: correctedFrequency,
            cents: noteInfo.cents,
            confidence: result.confidence,
            rms: result.rms,
        });
    }

    const yinNote = summarizeSegment(stabilizePitchFrames(frames));
    const segmentBuffer = buildSegmentPitchBuffer(samples, sampleRate, segment, OFFLINE_ATTACK_SKIP_MS);
    const spectralNote = detectSpectralPitch(segmentBuffer, sampleRate, yinNote?.midi ?? null);

    return mergePitchEstimates(yinNote, spectralNote);
}

function getSegmentPitchTrace(samples, sampleRate, segment) {
    const startSample = Math.floor((segment.startMs / 1000) * sampleRate);
    const endSample = Math.floor((segment.endMs / 1000) * sampleRate);
    const segmentRms = calculateRmsRange(samples, startSample, endSample);
    const pitchThreshold = Math.max(0.0015, segmentRms * 0.14, getRmsThreshold() * 0.25);
    const hopSize = Math.max(256, Math.round(sampleRate * 0.035));
    const pitchBuffer = new Float32Array(BUFFER_SIZE);
    const trace = [];

    for (let start = startSample; start < endSample; start += hopSize) {
        const available = Math.min(BUFFER_SIZE, endSample - start);
        if (available < BUFFER_SIZE * 0.35 && trace.length > 0) break;

        pitchBuffer.fill(0);
        pitchBuffer.set(samples.subarray(start, Math.min(start + BUFFER_SIZE, endSample)));
        const result = detectPitch(pitchBuffer, sampleRate, pitchThreshold);
        if (!result.frequency) continue;

        const frequency = correctOctaveFrequency(pitchBuffer, sampleRate, result.frequency);
        trace.push({
            timeMs: (start / sampleRate) * 1000,
            midi: frequencyToMidi(frequency),
            confidence: result.confidence,
            rms: result.rms,
        });
    }

    return trace;
}

function findPitchSplitPoints(samples, sampleRate, segment) {
    if (segment.endMs - segment.startMs < OFFLINE_PITCH_SPLIT_MIN_MS * 2) return [];

    const trace = getSegmentPitchTrace(samples, sampleRate, segment)
        .filter(item => item.confidence >= MIN_PITCH_CONFIDENCE);
    if (trace.length < 5) return [];

    const splits = [];
    let anchorMidi = trace[0].midi;
    let pending = [];

    for (let index = 1; index < trace.length; index += 1) {
        const item = trace[index];

        if (Math.abs(item.midi - anchorMidi) <= 0) {
            pending = [];
            continue;
        }

        if (pending.length > 0 && item.midi !== pending[0].midi) {
            pending = [];
        }

        pending.push(item);
        const pendingDuration = pending[pending.length - 1].timeMs - pending[0].timeMs;
        const enoughBefore = pending[0].timeMs - segment.startMs >= OFFLINE_PITCH_SPLIT_MIN_MS;
        const enoughAfter = segment.endMs - pending[0].timeMs >= OFFLINE_PITCH_SPLIT_MIN_MS;

        if (pending.length >= 3 && pendingDuration >= 70 && enoughBefore && enoughAfter) {
            splits.push(pending[0].timeMs);
            anchorMidi = pending[0].midi;
            pending = [];
        }
    }

    return splits;
}

function splitSegmentsByPitch(samples, sampleRate, segments) {
    const refined = [];

    segments.forEach(segment => {
        const splitPoints = findPitchSplitPoints(samples, sampleRate, segment);
        if (splitPoints.length === 0) {
            refined.push(segment);
            return;
        }

        const boundaries = [segment.startMs, ...splitPoints, segment.endMs];
        boundaries.slice(0, -1).forEach((startMs, index) => {
            const endMs = boundaries[index + 1];
            if (endMs - startMs >= OFFLINE_MIN_SEGMENT_MS) {
                refined.push({ startMs, endMs });
            }
        });
    });

    return refined;
}

async function decodeRecordingBlob(blob) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const context = new AudioCtx();

    try {
        return await context.decodeAudioData(await blob.arrayBuffer());
    } finally {
        context.close().catch(() => {});
    }
}

function analyzePcmRecording(rawSamples, sampleRate) {
    const normalized = normalizeSamples(preprocessSamples(rawSamples, sampleRate));
    const durationMs = (normalized.samples.length / sampleRate) * 1000;
    const features = createOfflineFeatureFrames(normalized.samples, sampleRate);
    const segmentation = createOfflineSegments(features, durationMs);
    const segments = refineSegmentsByEnergy(
        splitSegmentsByPitch(normalized.samples, sampleRate, segmentation.segments),
        features,
        segmentation.thresholds,
    );
    const notes = segments
        .map(segment => {
            const note = analyzeOfflineSegment(normalized.samples, sampleRate, segment);
            return note
                ? {
                    ...note,
                    startMs: segment.startMs,
                    endMs: segment.endMs,
                    segmentRms: calculateRmsRange(
                        normalized.samples,
                        (segment.startMs / 1000) * sampleRate,
                        (segment.endMs / 1000) * sampleRate,
                    ),
                }
                : null;
        })
        .filter(Boolean);

    return {
        ...normalized,
        durationMs,
        features,
        notes: dedupeRecognizedNotes(notes),
        ...segmentation,
        segments,
    };
}

async function analyzeRecordingBlob(blob) {
    const decoded = await decodeRecordingBlob(blob);
    return analyzePcmRecording(audioBufferToMono(decoded), decoded.sampleRate);
}

function dedupeRecognizedNotes(notes) {
    return notes.reduce((result, note) => {
        const previous = result[result.length - 1];
        if (!previous) {
            result.push(note);
            return result;
        }

        const gap = (note.startMs ?? 0) - (previous.endMs ?? 0);
        const duration = (note.endMs ?? 0) - (note.startMs ?? 0);
        const sameMidi = note.midi === previous.midi;
        const shortTail = duration > 0 && duration < OFFLINE_MIN_SEGMENT_MS * 1.4;
        const weakTail = previous.segmentRms
            && note.segmentRms
            && note.segmentRms < previous.segmentRms * 0.32
            && duration < OFFLINE_MIN_SEGMENT_MS * 1.7;

        if (weakTail) {
            previous.endMs = Math.max(previous.endMs ?? 0, note.endMs ?? 0);
            return result;
        }

        if (sameMidi && (gap < OFFLINE_ONSET_MIN_GAP_MS * 1.1 || shortTail)) {
            previous.endMs = Math.max(previous.endMs ?? 0, note.endMs ?? 0);
            previous.confidence = Math.max(previous.confidence || 0, note.confidence || 0);
            return result;
        }

        result.push(note);
        return result;
    }, []);
}

function getOfflineFailureMessage(result) {
    if (!result) return '';
    if (result.durationMs < OFFLINE_MIN_SEGMENT_MS) return '按住时间太短';
    if (result.peak < 0.0008 || result.rawRms < 0.00025) return '几乎没有输入, 请检查麦克风';
    if (result.ranges.length === 0) return '声音偏小, 已提高灵敏度';
    if (result.segments.length === 0) return '没有分出稳定音段';
    return '检测到声音, 但音高不够稳定';
}

function cloneFrameWithMidi(frame, midi) {
    const frequency = midiToFrequency(midi);
    return {
        ...frame,
        midi,
        note: midiToNote(midi),
        pitchClass: ((midi % 12) + 12) % 12,
        frequency,
        cents: 0,
    };
}

function stabilizePitchFrames(frames) {
    if (frames.length < 3) return frames;

    const stabilized = frames.map(frame => ({ ...frame }));
    for (let index = 1; index < stabilized.length - 1; index += 1) {
        const previous = stabilized[index - 1];
        const current = stabilized[index];
        const next = stabilized[index + 1];
        const isIsolatedSpike = previous.midi === next.midi && current.midi !== previous.midi;
        const isOctaveSpike = previous.pitchClass === current.pitchClass
            && next.pitchClass === current.pitchClass
            && Math.abs(current.midi - previous.midi) >= 12
            && Math.abs(current.midi - next.midi) >= 12;

        if (isIsolatedSpike || isOctaveSpike) {
            stabilized[index] = cloneFrameWithMidi(current, previous.midi);
        }
    }

    return stabilized;
}

function summarizeSegment(segment) {
    if (segment.length < MIN_SEGMENT_FRAMES) return null;

    const midiWeights = new Map();
    const midiFrames = new Map();
    let totalWeight = 0;

    segment.forEach(frame => {
        const weight = Math.max(0.1, frame.confidence) * clamp(frame.rms / 0.035, 0.4, 1.6);
        totalWeight += weight;
        midiWeights.set(frame.midi, (midiWeights.get(frame.midi) || 0) + weight);
        if (!midiFrames.has(frame.midi)) midiFrames.set(frame.midi, []);
        midiFrames.get(frame.midi).push(frame);
    });

    let bestMidi = null;
    let bestWeight = 0;
    midiWeights.forEach((weight, midi) => {
        if (weight > bestWeight) {
            bestMidi = midi;
            bestWeight = weight;
        }
    });

    if (bestMidi === null || bestWeight / totalWeight < 0.42) return null;

    const frames = midiFrames.get(bestMidi);
    const medianFrequency = median(frames.map(frame => frame.frequency));
    const medianCents = median(frames.map(frame => frame.cents));

    return {
        note: midiToNote(bestMidi),
        midi: bestMidi,
        pitchClass: ((bestMidi % 12) + 12) % 12,
        frequency: medianFrequency,
        cents: medianCents,
    };
}

function isEnergyOnset(previousFrame, frame, currentSegment) {
    if (!previousFrame || currentSegment.length < MIN_SEGMENT_FRAMES) return false;
    if (frame.confidence < ONSET_MIN_CONFIDENCE) return false;
    if (frame.time - currentSegment[0].time < ONSET_MIN_GAP_MS) return false;
    if (frame.time - previousFrame.time > SILENCE_GAP_MS) return false;

    const recentRms = currentSegment.slice(-3).map(item => item.rms);
    const baseline = Math.max(median(recentRms), previousFrame.rms || 0, 0.0001);
    const delta = frame.rms - baseline;
    const ratio = frame.rms / baseline;

    return delta >= ONSET_RMS_DELTA && ratio >= ONSET_RMS_RATIO;
}

function splitFramesIntoSegments(frames) {
    const segments = [];
    let currentSegment = [];
    let anchorMidi = null;
    let pendingChange = [];

    function startSegment(frame) {
        currentSegment = [frame];
        anchorMidi = frame.midi;
        pendingChange = [];
    }

    function closeSegment() {
        if (pendingChange.length >= MIN_SEGMENT_FRAMES && currentSegment.length >= MIN_SEGMENT_FRAMES) {
            segments.push(currentSegment);
            currentSegment = pendingChange;
            anchorMidi = summarizeSegment(currentSegment)?.midi || currentSegment[0].midi;
        } else {
            currentSegment.push(...pendingChange);
        }

        pendingChange = [];
        if (currentSegment.length > 0) segments.push(currentSegment);
        currentSegment = [];
        anchorMidi = null;
    }

    frames.forEach(frame => {
        if (currentSegment.length === 0) {
            startSegment(frame);
            return;
        }

        const previousFrame = pendingChange[pendingChange.length - 1] || currentSegment[currentSegment.length - 1];
        if (frame.time - previousFrame.time > SILENCE_GAP_MS) {
            closeSegment();
            startSegment(frame);
            return;
        }

        if (isEnergyOnset(previousFrame, frame, currentSegment)) {
            if (pendingChange.length > 0 && frame.midi === pendingChange[0].midi) {
                segments.push(currentSegment);
                currentSegment = [...pendingChange, frame];
                anchorMidi = summarizeSegment(currentSegment)?.midi || currentSegment[0].midi;
            } else {
                segments.push([...currentSegment, ...pendingChange]);
                startSegment(frame);
            }

            pendingChange = [];
            return;
        }

        if (Math.abs(frame.midi - anchorMidi) === 0) {
            currentSegment.push(...pendingChange, frame);
            pendingChange = [];
            return;
        }

        if (pendingChange.length > 0 && frame.midi !== pendingChange[0].midi) {
            currentSegment.push(...pendingChange);
            pendingChange = [];
        }

        pendingChange.push(frame);
        if (pendingChange.length >= NOTE_CHANGE_CONFIRM_FRAMES) {
            segments.push(currentSegment);
            currentSegment = pendingChange;
            anchorMidi = summarizeSegment(currentSegment)?.midi || currentSegment[0].midi;
            pendingChange = [];
        }
    });

    if (currentSegment.length > 0) closeSegment();
    return segments;
}

function extractNotesFromFrames(frames) {
    if (frames.length < MIN_SEGMENT_FRAMES) return [];

    return splitFramesIntoSegments(stabilizePitchFrames(frames))
        .map(summarizeSegment)
        .filter(Boolean);
}

function getRecordingFailureMessage() {
    if (recordingStats.totalFrames < MIN_SEGMENT_FRAMES) {
        return '按住时间太短';
    }

    if (recordingStats.maxRms < getRmsThreshold()) {
        return getVolumeHint();
    }

    if (recordingStats.loudFrames > 0 && recordingStats.maxConfidence < MIN_PITCH_CONFIDENCE) {
        return '音高不够清晰, 请录单音';
    }

    if (recordingStats.pitchedFrames < MIN_SEGMENT_FRAMES) {
        return '清晰音太短, 请多按一会儿';
    }

    return '没有听到清晰单音';
}

function handlePitch(result, now) {
    recordingStats.totalFrames += 1;
    recordingStats.maxRms = Math.max(recordingStats.maxRms, result.rms || 0);
    recordingStats.maxConfidence = Math.max(recordingStats.maxConfidence, result.confidence || 0);
    if (result.reason !== 'quiet') recordingStats.loudFrames += 1;

    if (!result.frequency) {
        if (recordingStats.totalFrames >= 4 && result.reason === 'quiet') {
            renderCurrent();
            setStatus('声音偏小, 靠近麦克风');
            return;
        }

        if (recordingStats.totalFrames >= 4 && result.reason === 'unclear') {
            setStatus('检测到声音, 请保持单音');
            return;
        }

        if (recordingFrames.length > 0 && now - lastPitchAt > SILENCE_GAP_MS) {
            setStatus(`已采集 ${recordingFrames.length} 帧`);
        }
        return;
    }

    const noteInfo = frequencyToNote(result.frequency);
    renderCurrent(noteInfo);
    lastPitchAt = now;
    recordingStats.pitchedFrames += 1;
    recordingFrames.push({
        time: now,
        note: noteInfo.note,
        midi: noteInfo.midi,
        pitchClass: noteInfo.pitchClass,
        frequency: noteInfo.frequency,
        cents: noteInfo.cents,
        confidence: result.confidence,
        rms: result.rms,
    });
    setStatus(`正在采集 ${recordingFrames.length} 帧`);
}

function tick(now = performance.now()) {
    if (!recording || !analyser || !timeBuffer || !audioContext) return;

    animationFrameId = requestAnimationFrame(tick);
    if (now - lastFrameAt < FRAME_INTERVAL) return;
    lastFrameAt = now;

    syncInputGain();
    analyser.getFloatTimeDomainData(timeBuffer);
    const threshold = getRmsThreshold();
    handlePitch(detectPitch(timeBuffer, audioContext.sampleRate, threshold), now);
}

async function getMicrophoneStream() {
    const candidates = [
        {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: true,
            channelCount: 1,
        },
        {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            channelCount: 1,
        },
        true,
    ];

    for (const audio of candidates) {
        try {
            return await navigator.mediaDevices.getUserMedia({ audio, video: false });
        } catch (error) {
            console.warn('[听音识阶] 麦克风约束失败,尝试下一组约束', error);
        }
    }

    return navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
    });
}

function describeInputTrack() {
    const [track] = micStream?.getAudioTracks?.() || [];
    if (!track) return;

    const settings = track.getSettings?.() || {};
    const parts = [
        settings.sampleRate ? `${settings.sampleRate}Hz` : null,
        settings.channelCount ? `${settings.channelCount}ch` : null,
        settings.autoGainControl === true ? 'AGC' : null,
    ].filter(Boolean);

    if (parts.length > 0) {
        console.info(`[听音识阶] 麦克风输入: ${parts.join(', ')}, gain=${getInputGainValue().toFixed(1)}x`);
    }
}

function createCaptureWorkletUrl() {
    if (captureWorkletUrl) return captureWorkletUrl;

    const source = `
        class PcmCaptureProcessor extends AudioWorkletProcessor {
            process(inputs) {
                const input = inputs[0];
                if (!input || input.length === 0 || input[0].length === 0) return true;
                const length = input[0].length;
                const mixed = new Float32Array(length);
                for (let channel = 0; channel < input.length; channel += 1) {
                    const data = input[channel];
                    for (let index = 0; index < length; index += 1) {
                        mixed[index] += data[index] / input.length;
                    }
                }
                this.port.postMessage(mixed, [mixed.buffer]);
                return true;
            }
        }
        registerProcessor('pcm-capture-processor', PcmCaptureProcessor);
    `;
    captureWorkletUrl = URL.createObjectURL(new Blob([source], { type: 'application/javascript' }));
    return captureWorkletUrl;
}

async function createAudioWorkletCaptureNode() {
    if (!audioContext?.audioWorklet || !window.AudioWorkletNode) return null;

    await audioContext.audioWorklet.addModule(createCaptureWorkletUrl());
    const node = new AudioWorkletNode(audioContext, 'pcm-capture-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
    });
    node.port.onmessage = (event) => appendPcmSamples(event.data);
    return node;
}

function createScriptProcessorCaptureNode() {
    const node = audioContext.createScriptProcessor(2048, 1, 1);
    node.onaudioprocess = (event) => {
        appendPcmCapture(event.inputBuffer);
    };
    return node;
}

async function connectAudioInput() {
    micSource = audioContext.createMediaStreamSource(micStream);
    inputGain = audioContext.createGain();
    inputGain.gain.value = getInputGainValue();
    captureSink = audioContext.createGain();
    captureSink.gain.value = 0;

    try {
        captureNode = await createAudioWorkletCaptureNode();
    } catch (error) {
        console.warn('[听音识阶] AudioWorklet 捕获不可用, 使用兼容模式', error);
        captureNode = null;
    }

    if (!captureNode) {
        captureNode = createScriptProcessorCaptureNode();
    }

    micSource.connect(inputGain);
    inputGain.connect(analyser);
    inputGain.connect(captureNode);
    captureNode.connect(captureSink);
    captureSink.connect(audioContext.destination);
}

function disconnectAudioInput() {
    if (captureNode) {
        captureNode.disconnect();
        if ('onaudioprocess' in captureNode) captureNode.onaudioprocess = null;
        if (captureNode.port) captureNode.port.onmessage = null;
        captureNode = null;
    }

    if (captureSink) {
        captureSink.disconnect();
        captureSink = null;
    }

    if (inputGain) {
        inputGain.disconnect();
        inputGain = null;
    }

    if (micSource) {
        micSource.disconnect();
        micSource = null;
    }
}

function getVolumeHint() {
    if (recordingStats.maxRms < 0.0015) {
        return '几乎没有输入, 请检查麦克风';
    }

    if (recordingStats.maxRms < getRmsThreshold()) {
        return '声音偏小, 已提高灵敏度';
    }

    return '声音太小, 请靠近麦克风';
}

async function ensureAudioContextRunning() {
    if (audioContext?.state === 'suspended') {
        await audioContext.resume();
    }
}

async function startRecording() {
    if (recording || pendingStart || processingRecording) return;
    stopPlayback();

    if (!navigator.mediaDevices?.getUserMedia) {
        setStatus('浏览器不支持麦克风');
        return;
    }

    if (!window.isSecureContext && location.hostname !== 'localhost') {
        setStatus('需要 HTTPS 或本地环境');
        return;
    }

    pendingStart = true;
    stopAfterStart = false;
    setHoldState('processing');
    setStatus('请求麦克风');

    try {
        micStream = await getMicrophoneStream();
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        audioContext = new AudioCtx();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = BUFFER_SIZE;
        analyser.smoothingTimeConstant = 0;
        timeBuffer = new Float32Array(analyser.fftSize);
        await connectAudioInput();
        await ensureAudioContextRunning();
        describeInputTrack();

        recording = true;
        pendingStart = false;
        recordingFrames = [];
        recordingStats = createRecordingStats();
        resetPcmCapture();
        lastPitchAt = 0;
        lastFrameAt = 0;
        startOriginalRecording();

        setHoldState('recording');
        setStatus('继续按住, 逐个弹奏或哼唱');
        animationFrameId = requestAnimationFrame(tick);

        if (stopAfterStart) {
            stopAfterStart = false;
            stopRecording(true);
        }
    } catch (error) {
        console.error('[听音识阶] 无法启动麦克风', error);
        pendingStart = false;
        setHoldState('idle');
        setStatus('麦克风不可用');
    }
}

function closeAudioInput() {
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }

    disconnectAudioInput();

    if (micStream) {
        micStream.getTracks().forEach(track => track.stop());
        micStream = null;
    }

    if (audioContext) {
        audioContext.close().catch(() => {});
        audioContext = null;
    }

    analyser = null;
    timeBuffer = null;
}

async function commitRecording(recordingBlob = null, pcmRecording = null) {
    setHoldState('processing');
    setStatus('正在识别');

    let recognizedNotes = [];
    let offlineResult = null;

    if (pcmRecording) {
        try {
            offlineResult = analyzePcmRecording(pcmRecording.samples, pcmRecording.sampleRate);
            recognizedNotes = offlineResult.notes;
        } catch (error) {
            console.warn('[听音识阶] PCM 离线识别失败, 尝试录音 Blob', error);
        }
    }

    if (recognizedNotes.length === 0 && recordingBlob) {
        try {
            offlineResult = await analyzeRecordingBlob(recordingBlob);
            recognizedNotes = offlineResult.notes;
        } catch (error) {
            console.warn('[听音识阶] 离线识别失败, 使用实时帧回退', error);
        }
    }

    if (recognizedNotes.length === 0) {
        recognizedNotes = extractNotesFromFrames(recordingFrames);
    }

    if (recognizedNotes.length === 0) {
        setStatus(getOfflineFailureMessage(offlineResult) || getRecordingFailureMessage());
        return;
    }

    capturedNotes.push(...recognizedNotes);
    renderSequence();
    setStatus(`识别完成: ${recognizedNotes.length} 个音`);
}

async function stopRecording(commit = true) {
    if (pendingStart) {
        stopAfterStart = commit;
        return;
    }

    if (!recording) return;
    recording = false;
    processingRecording = commit;
    const pcmRecording = getCapturedPcmRecording();
    const stoppedRecording = stopOriginalRecording();
    closeAudioInput();

    try {
        if (commit) {
            const recordingBlob = await stoppedRecording;
            await commitRecording(recordingBlob, pcmRecording);
        }
    } catch (error) {
        console.error('[听音识阶] 识别失败', error);
        setStatus('识别失败');
    } finally {
        recordingFrames = [];
        recordingStats = createRecordingStats();
        lastPitchAt = 0;
        processingRecording = false;
        renderCurrent();
        setHoldState('idle');
    }
}

function clearSequence() {
    stopPlayback();
    capturedNotes = [];
    bestScale = null;
    renderSequence();
    setStatus(recording ? '继续按住, 逐个弹奏或哼唱' : '按住开始');
}

function removeLastNote() {
    stopPlayback();
    capturedNotes.pop();
    renderSequence();
}

async function copySequence() {
    const notes = capturedNotes.map(item => item.note).join(' ');
    const degrees = els.degreeSequence.textContent;
    const scaleName = bestScale?.name || '未确定';
    const text = `音符: ${notes || '--'}\n音阶候选: ${scaleName}\n音级: ${degrees || '--'}`;

    try {
        await navigator.clipboard.writeText(text);
        setStatus('已复制');
    } catch (error) {
        console.warn('[听音识阶] 复制失败', error);
        setStatus('复制失败');
    }
}

function handlePressStart(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    els.hold.setPointerCapture?.(event.pointerId);
    startRecording();
}

function handlePressEnd(event) {
    event.preventDefault();
    stopRecording(true);
}

els.hold.addEventListener('pointerdown', handlePressStart);
els.hold.addEventListener('pointerup', handlePressEnd);
els.hold.addEventListener('pointercancel', handlePressEnd);
els.hold.addEventListener('lostpointercapture', () => {
    if (recording || pendingStart) stopRecording(true);
});

els.hold.addEventListener('keydown', (event) => {
    if ((event.key === ' ' || event.key === 'Enter') && !recording && !pendingStart) {
        event.preventDefault();
        startRecording();
    }
});

els.hold.addEventListener('keyup', (event) => {
    if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        stopRecording(true);
    }
});

els.sensitivity.addEventListener('input', syncInputGain);
els.play.addEventListener('click', playCapturedSequence);
els.playRecording.addEventListener('click', playSavedRecording);
els.clearRecording.addEventListener('click', clearSavedRecording);
els.downloadRecording.addEventListener('click', (event) => {
    if (!savedRecordingBlob) event.preventDefault();
});
els.clear.addEventListener('click', clearSequence);
els.removeLast.addEventListener('click', removeLastNote);
els.copy.addEventListener('click', copySequence);

els.sequence.addEventListener('click', (event) => {
    const chip = event.target.closest('.note-chip');
    if (!chip) return;
    const index = Number(chip.dataset.index);
    if (!Number.isInteger(index)) return;
    playCapturedNote(index);
});

window.addEventListener('beforeunload', () => {
    recording = false;
    pendingStart = false;
    stopOriginalRecording();
    stopOriginalPlayback();
    stopPlayback();
    if (playbackContext && playbackContext.state !== 'closed') {
        playbackContext.close().catch(() => {});
    }
    revokeSavedRecording();
    closeAudioInput();
});

setRecordingReviewState('idle');
renderSequence();
