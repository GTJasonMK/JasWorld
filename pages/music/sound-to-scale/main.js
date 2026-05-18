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
const STABLE_MS = 180;
const SILENCE_RESET_MS = 260;

const els = {
    start: document.getElementById('start-listening'),
    stop: document.getElementById('stop-listening'),
    clear: document.getElementById('clear-sequence'),
    copy: document.getElementById('copy-sequence'),
    removeLast: document.getElementById('remove-last'),
    sensitivity: document.getElementById('sensitivity-slider'),
    currentNote: document.getElementById('current-note'),
    currentFrequency: document.getElementById('current-frequency'),
    centsNeedle: document.getElementById('cents-needle'),
    centsReadout: document.getElementById('cents-readout'),
    signalFill: document.getElementById('signal-fill'),
    confidence: document.getElementById('confidence-value'),
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
let listening = false;
let capturedNotes = [];
let currentCandidate = null;
let candidateStartedAt = 0;
let lastCapturedNote = null;
let hasSilenceSinceCapture = true;
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
    const cents = 1200 * Math.log2(frequency / expectedFrequency);
    return {
        midi,
        note: midiToNote(midi),
        pitchClass: ((midi % 12) + 12) % 12,
        frequency,
        cents,
    };
}

function detectPitch(buffer, sampleRate, threshold) {
    let sumSquares = 0;
    for (let i = 0; i < buffer.length; i += 1) {
        sumSquares += buffer[i] * buffer[i];
    }

    const rms = Math.sqrt(sumSquares / buffer.length);
    if (rms < threshold) {
        return { frequency: null, confidence: 0, rms };
    }

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

        const denominator = Math.sqrt(leftPower * rightPower) || 1;
        const correlation = dot / denominator;
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

function renderSignal(rms, confidence = 0) {
    const level = clamp((rms / 0.18) * 100, 0, 100);
    els.signalFill.style.width = `${level}%`;
    els.confidence.textContent = confidence ? `${Math.round(confidence * 100)}%` : '--';
}

function renderNoPitch(rms = 0, confidence = 0) {
    els.currentNote.textContent = '--';
    els.currentFrequency.textContent = '-- Hz';
    els.centsReadout.textContent = '偏差 -- cents';
    els.centsNeedle.style.left = '50%';
    renderSignal(rms, confidence);
}

function renderCurrent(noteInfo, confidence, rms) {
    els.currentNote.textContent = noteInfo.note;
    els.currentFrequency.textContent = `${noteInfo.frequency.toFixed(1)} Hz`;
    els.centsReadout.textContent = `偏差 ${noteInfo.cents >= 0 ? '+' : ''}${noteInfo.cents.toFixed(0)} cents`;
    els.centsNeedle.style.left = `${clamp(((noteInfo.cents + 50) / 100) * 100, 0, 100)}%`;
    renderSignal(rms, confidence);
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
        root,
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
            <small>${candidate.matched}/${candidate.total} 个音吻合</small>
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
        els.sequence.textContent = '等待输入';
    } else {
        els.sequence.className = 'note-sequence';
        els.sequence.innerHTML = capturedNotes
            .map((item, index) => `<span class="note-chip" data-index="${index}">${item.note}</span>`)
            .join('');
    }

    renderScaleCandidates();
    renderDegrees();
}

function captureNote(noteInfo) {
    capturedNotes.push({
        note: noteInfo.note,
        midi: noteInfo.midi,
        pitchClass: noteInfo.pitchClass,
        frequency: noteInfo.frequency,
        cents: noteInfo.cents,
    });
    lastCapturedNote = noteInfo.note;
    hasSilenceSinceCapture = false;
    renderSequence();
}

function handlePitch(result, now) {
    if (!result.frequency) {
        renderNoPitch(result.rms, result.confidence);
        currentCandidate = null;
        candidateStartedAt = 0;

        if (!silenceStartedAt) silenceStartedAt = now;
        if (now - silenceStartedAt > SILENCE_RESET_MS) {
            hasSilenceSinceCapture = true;
            setStatus(listening ? '等待稳定音高' : '未监听');
        }
        return;
    }

    silenceStartedAt = 0;
    const noteInfo = frequencyToNote(result.frequency);
    renderCurrent(noteInfo, result.confidence, result.rms);
    setStatus('正在识别');

    if (currentCandidate !== noteInfo.note) {
        currentCandidate = noteInfo.note;
        candidateStartedAt = now;
        return;
    }

    const stableEnough = now - candidateStartedAt >= STABLE_MS;
    const shouldCapture = noteInfo.note !== lastCapturedNote || hasSilenceSinceCapture;
    if (stableEnough && shouldCapture) {
        captureNote(noteInfo);
        setStatus(`已记录 ${noteInfo.note}`);
    }
}

function tick(now = performance.now()) {
    if (!listening || !analyser || !timeBuffer || !audioContext) return;

    animationFrameId = requestAnimationFrame(tick);
    if (now - lastFrameAt < FRAME_INTERVAL) return;
    lastFrameAt = now;

    analyser.getFloatTimeDomainData(timeBuffer);
    const threshold = Number(els.sensitivity.value || 0.025);
    const result = detectPitch(timeBuffer, audioContext.sampleRate, threshold);
    handlePitch(result, now);
}

async function getMicrophoneStream() {
    const detailedConstraints = {
        audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
        },
        video: false,
    };

    try {
        return await navigator.mediaDevices.getUserMedia(detailedConstraints);
    } catch (error) {
        console.warn('[听音识阶] 精确音频约束失败,改用默认麦克风约束', error);
        return navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    }
}

async function startListening() {
    if (listening) return;

    if (!navigator.mediaDevices?.getUserMedia) {
        setStatus('浏览器不支持麦克风');
        return;
    }

    if (!window.isSecureContext && location.hostname !== 'localhost') {
        setStatus('需要 HTTPS 或本地环境');
        return;
    }

    els.start.disabled = true;
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

        listening = true;
        lastFrameAt = 0;
        currentCandidate = null;
        candidateStartedAt = 0;
        silenceStartedAt = 0;
        hasSilenceSinceCapture = true;

        els.stop.disabled = false;
        setStatus('等待稳定音高');
        animationFrameId = requestAnimationFrame(tick);
    } catch (error) {
        console.error('[听音识阶] 无法启动麦克风', error);
        setStatus('麦克风不可用');
        els.start.disabled = false;
    }
}

function stopListening() {
    listening = false;
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
    currentCandidate = null;
    candidateStartedAt = 0;
    silenceStartedAt = 0;

    els.start.disabled = false;
    els.stop.disabled = true;
    setStatus('未监听');
    renderNoPitch();
}

function clearSequence() {
    capturedNotes = [];
    lastCapturedNote = null;
    hasSilenceSinceCapture = true;
    bestScale = null;
    renderSequence();
    setStatus(listening ? '等待稳定音高' : '未监听');
}

function removeLastNote() {
    capturedNotes.pop();
    lastCapturedNote = capturedNotes.at(-1)?.note || null;
    hasSilenceSinceCapture = true;
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

els.start.addEventListener('click', startListening);
els.stop.addEventListener('click', stopListening);
els.clear.addEventListener('click', clearSequence);
els.removeLast.addEventListener('click', removeLastNote);
els.copy.addEventListener('click', copySequence);

els.sequence.addEventListener('click', (event) => {
    const chip = event.target.closest('.note-chip');
    if (!chip) return;
    const index = Number(chip.dataset.index);
    if (!Number.isInteger(index)) return;
    capturedNotes.splice(index, 1);
    lastCapturedNote = capturedNotes.at(-1)?.note || null;
    hasSilenceSinceCapture = true;
    renderSequence();
});

window.addEventListener('beforeunload', stopListening);
renderSequence();
