import '@styles/index.css';
import './style.css';
import { bootstrapCore } from '@core/index.js';

bootstrapCore();

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const SCALE_TYPES = [
    { label: '大调', offsets: [0, 2, 4, 5, 7, 9, 11], degrees: ['1', '2', '3', '4', '5', '6', '7'] },
    { label: '小调', offsets: [0, 2, 3, 5, 7, 8, 10], degrees: ['1', '2', 'b3', '4', '5', 'b6', 'b7'] },
];

const MIN_FREQ = 27.5;
const MAX_FREQ = 4200;
const BUFFER_SIZE = 4096;
const FRAME_INTERVAL = 70;
const SILENCE_GAP_MS = 260;
const MIN_SEGMENT_FRAMES = 2;
const MIN_PITCH_CONFIDENCE = 0.45;
const NOTE_CHANGE_CONFIRM_FRAMES = 2;

const els = {
    hold: document.getElementById('hold-to-record'),
    holdTitle: document.getElementById('hold-title'),
    holdHint: document.getElementById('hold-hint'),
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

function detectPitch(buffer, sampleRate, threshold) {
    let sumSquares = 0;
    for (let i = 0; i < buffer.length; i += 1) {
        sumSquares += buffer[i] * buffer[i];
    }

    const rms = Math.sqrt(sumSquares / buffer.length);
    if (rms < threshold) return { frequency: null, confidence: 0, rms, reason: 'quiet' };

    const minLag = Math.floor(sampleRate / MAX_FREQ);
    const maxLag = Math.min(Math.floor(sampleRate / MIN_FREQ), buffer.length - 1);
    const correlations = new Float32Array(maxLag + 1);
    let bestLag = -1;
    let bestCorrelation = 0;

    for (let lag = minLag; lag <= maxLag; lag += 1) {
        let dot = 0;
        let leftPower = 0;
        let rightPower = 0;
        const size = buffer.length - lag;

        for (let i = 0; i < size; i += 1) {
            const left = buffer[i];
            const right = buffer[i + lag];
            dot += left * right;
            leftPower += left * left;
            rightPower += right * right;
        }

        const correlation = dot / (Math.sqrt(leftPower * rightPower) || 1);
        correlations[lag] = correlation;
        if (correlation > bestCorrelation) {
            bestCorrelation = correlation;
            bestLag = lag;
        }
    }

    if (bestLag < 0 || bestCorrelation < MIN_PITCH_CONFIDENCE) {
        return { frequency: null, confidence: bestCorrelation, rms, reason: 'unclear' };
    }

    const prev = correlations[bestLag - 1] || bestCorrelation;
    const next = correlations[bestLag + 1] || bestCorrelation;
    const divisor = 2 * (prev - 2 * bestCorrelation + next);
    const offset = Math.abs(divisor) > 0.0001 ? (prev - next) / divisor : 0;
    const refinedLag = bestLag + clamp(offset, -0.5, 0.5);

    return {
        frequency: sampleRate / refinedLag,
        confidence: bestCorrelation,
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
    const sensitivity = clamp(Number(els.sensitivity.value || 8), 1, 10);
    return 0.038 - ((sensitivity - 1) / 9) * 0.034;
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
            .map((item, index) => `<span class="note-chip" data-index="${index}">${item.note}</span>`)
            .join('');
    }

    renderScaleCandidates();
    renderDegrees();
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

    if (bestMidi === null || bestWeight / totalWeight < 0.32) return null;

    const frames = midiFrames.get(bestMidi);
    const averageFrequency = frames.reduce((sum, frame) => sum + frame.frequency, 0) / frames.length;
    const averageCents = frames.reduce((sum, frame) => sum + frame.cents, 0) / frames.length;

    return {
        note: midiToNote(bestMidi),
        midi: bestMidi,
        pitchClass: ((bestMidi % 12) + 12) % 12,
        frequency: averageFrequency,
        cents: averageCents,
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

    return splitFramesIntoSegments(frames)
        .map(summarizeSegment)
        .filter(Boolean);
}

function getRecordingFailureMessage() {
    if (recordingStats.totalFrames < MIN_SEGMENT_FRAMES) {
        return '按住时间太短';
    }

    if (recordingStats.maxRms < getRmsThreshold()) {
        return '声音太小, 请靠近麦克风';
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

    analyser.getFloatTimeDomainData(timeBuffer);
    const threshold = getRmsThreshold();
    handlePitch(detectPitch(timeBuffer, audioContext.sampleRate, threshold), now);
}

async function getMicrophoneStream() {
    const constraints = {
        audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
        },
        video: false,
    };

    try {
        return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (error) {
        console.warn('[听音识阶] 精确音频约束失败,改用默认麦克风约束', error);
        return navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    }
}

async function startRecording() {
    if (recording || pendingStart) return;

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
        micSource = audioContext.createMediaStreamSource(micStream);
        micSource.connect(analyser);

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

    if (micSource) {
        micSource.disconnect();
        micSource = null;
    }

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
    capturedNotes = [];
    bestScale = null;
    renderSequence();
    setStatus(recording ? '继续按住, 逐个弹奏或哼唱' : '按住开始');
}

function removeLastNote() {
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

els.clear.addEventListener('click', clearSequence);
els.removeLast.addEventListener('click', removeLastNote);
els.copy.addEventListener('click', copySequence);

els.sequence.addEventListener('click', (event) => {
    const chip = event.target.closest('.note-chip');
    if (!chip) return;
    const index = Number(chip.dataset.index);
    if (!Number.isInteger(index)) return;
    capturedNotes.splice(index, 1);
    renderSequence();
});

window.addEventListener('beforeunload', () => {
    recording = false;
    pendingStart = false;
    closeAudioInput();
});

renderSequence();
