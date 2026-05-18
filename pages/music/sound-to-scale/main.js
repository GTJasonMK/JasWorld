import '@styles/index.css';
import './style.css';
import { bootstrapCore } from '@core/index.js';

bootstrapCore();

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const SCALE_TYPES = [
    { label: '大调', offsets: [0, 2, 4, 5, 7, 9, 11], degrees: ['1', '2', '3', '4', '5', '6', '7'] },
    { label: '小调', offsets: [0, 2, 3, 5, 7, 8, 10], degrees: ['1', '2', 'b3', '4', '5', 'b6', 'b7'] },
];

const MIN_FREQ = 55;
const MAX_FREQ = 1760;
const BUFFER_SIZE = 4096;
const FRAME_INTERVAL = 70;
const STABLE_MS = 160;
const SILENCE_RESET_MS = 240;

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
let recordingNotes = [];
let currentCandidate = null;
let candidateStartedAt = 0;
let lastRecordedNote = null;
let hasSilenceSinceNote = true;
let silenceStartedAt = 0;
let bestScale = null;

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
    if (rms < threshold) return { frequency: null, confidence: 0, rms };

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

    if (bestLag < 0 || bestCorrelation < 0.72) {
        return { frequency: null, confidence: bestCorrelation, rms };
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

function recordStableNote(noteInfo) {
    recordingNotes.push({
        note: noteInfo.note,
        midi: noteInfo.midi,
        pitchClass: noteInfo.pitchClass,
        frequency: noteInfo.frequency,
        cents: noteInfo.cents,
    });
    lastRecordedNote = noteInfo.note;
    hasSilenceSinceNote = false;
    setStatus(`已听到 ${recordingNotes.length} 个音`);
}

function handlePitch(result, now) {
    if (!result.frequency) {
        currentCandidate = null;
        candidateStartedAt = 0;
        if (!silenceStartedAt) silenceStartedAt = now;
        if (now - silenceStartedAt > SILENCE_RESET_MS) {
            hasSilenceSinceNote = true;
            setStatus('继续按住, 逐个弹奏或哼唱');
        }
        return;
    }

    silenceStartedAt = 0;
    const noteInfo = frequencyToNote(result.frequency);
    renderCurrent(noteInfo);

    if (currentCandidate !== noteInfo.note) {
        currentCandidate = noteInfo.note;
        candidateStartedAt = now;
        return;
    }

    const stableEnough = now - candidateStartedAt >= STABLE_MS;
    const shouldRecord = noteInfo.note !== lastRecordedNote || hasSilenceSinceNote;
    if (stableEnough && shouldRecord) {
        recordStableNote(noteInfo);
    }
}

function tick(now = performance.now()) {
    if (!recording || !analyser || !timeBuffer || !audioContext) return;

    animationFrameId = requestAnimationFrame(tick);
    if (now - lastFrameAt < FRAME_INTERVAL) return;
    lastFrameAt = now;

    analyser.getFloatTimeDomainData(timeBuffer);
    const threshold = Number(els.sensitivity.value || 0.025);
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
        recordingNotes = [];
        currentCandidate = null;
        candidateStartedAt = 0;
        lastRecordedNote = null;
        hasSilenceSinceNote = true;
        silenceStartedAt = 0;
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

    if (recordingNotes.length === 0) {
        setStatus('没有识别到稳定音高');
        return;
    }

    capturedNotes.push(...recordingNotes);
    renderSequence();
    setStatus(`识别完成: ${recordingNotes.length} 个音`);
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

    currentCandidate = null;
    candidateStartedAt = 0;
    silenceStartedAt = 0;
    recordingNotes = [];
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
