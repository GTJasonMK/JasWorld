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
const NOTE_PLAY_SECONDS = 1.25;

const els = {
    hold: document.getElementById('hold-to-record'),
    holdTitle: document.getElementById('hold-title'),
    holdHint: document.getElementById('hold-hint'),
    play: document.getElementById('play-sequence'),
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
let micSource = null;
let micStream = null;
let timeBuffer = null;
let animationFrameId = null;
let lastFrameAt = 0;
let recording = false;
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
const pianoBufferCache = new Map();

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

function connectAudioInput() {
    micSource = audioContext.createMediaStreamSource(micStream);
    inputGain = audioContext.createGain();
    inputGain.gain.value = getInputGainValue();
    micSource.connect(inputGain);
    inputGain.connect(analyser);
}

function disconnectAudioInput() {
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
    if (recording || pendingStart) return;
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
        connectAudioInput();
        await ensureAudioContextRunning();
        describeInputTrack();

        recording = true;
        pendingStart = false;
        recordingFrames = [];
        recordingStats = createRecordingStats();
        lastPitchAt = 0;
        lastFrameAt = 0;

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

function commitRecording() {
    setHoldState('processing');
    setStatus('正在识别');

    const recognizedNotes = extractNotesFromFrames(recordingFrames);
    if (recognizedNotes.length === 0) {
        setStatus(getRecordingFailureMessage());
        return;
    }

    capturedNotes.push(...recognizedNotes);
    renderSequence();
    setStatus(`识别完成: ${recognizedNotes.length} 个音`);
}

function stopRecording(commit = true) {
    if (pendingStart) {
        stopAfterStart = commit;
        return;
    }

    if (!recording) return;
    recording = false;
    closeAudioInput();

    if (commit) {
        commitRecording();
    }

    recordingFrames = [];
    recordingStats = createRecordingStats();
    lastPitchAt = 0;
    renderCurrent();
    setHoldState('idle');
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
    stopPlayback();
    if (playbackContext && playbackContext.state !== 'closed') {
        playbackContext.close().catch(() => {});
    }
    closeAudioInput();
});

renderSequence();
