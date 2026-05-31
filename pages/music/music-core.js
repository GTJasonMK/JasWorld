/**
 * 音乐练习模块
 * 实现音阶练习、单音辨听和多音辨听功能
 */

// 音乐练习模块 - ES模块版本
import { storage, StorageKeys } from '../../src/core/storage.js';
import { settingsManager } from '../../src/core/settings.js';

// 钢琴采样覆盖完整88键（A0-C8），文件名用 s 表示升号，例如 C#4 -> Cs4。
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NOTE_OFFSETS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const PIANO_MIN_MIDI = 21; // A0
const PIANO_MAX_MIDI = 108; // C8

function midiToNote(midi) {
  const name = NOTE_NAMES[midi % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${name}${octave}`;
}

function noteToMidi(note) {
  const match = /^([A-G])([#bs]?)(-?\d+)$/.exec(note);
  if (!match) return null;

  const [, letter, accidental, octaveText] = match;
  const accidentalOffset =
    accidental === '#' || accidental === 's' ? 1 : accidental === 'b' ? -1 : 0;
  return (Number(octaveText) + 1) * 12 + NOTE_OFFSETS[letter] + accidentalOffset;
}

function normalizeNoteName(note) {
  const midi = noteToMidi(note);
  if (midi === null || midi < PIANO_MIN_MIDI || midi > PIANO_MAX_MIDI) {
    return null;
  }

  return midiToNote(midi);
}

function noteToFrequency(note) {
  const midi = noteToMidi(note);
  if (midi === null) return null;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function noteToFileName(note) {
  const normalizedNote = normalizeNoteName(note);
  return normalizedNote ? normalizedNote.replace('#', 's') : null;
}

function buildChromaticRange(startNote, endNote) {
  const startMidi = noteToMidi(startNote);
  const endMidi = noteToMidi(endNote);
  if (startMidi === null || endMidi === null || startMidi > endMidi) return [];

  const notes = [];
  for (let midi = startMidi; midi <= endMidi; midi++) {
    notes.push(midiToNote(midi));
  }
  return notes;
}

const PIANO_NOTES = buildChromaticRange('A0', 'C8');
const NOTE_FREQUENCIES = Object.fromEntries(
  PIANO_NOTES.map((note) => [note, Number(noteToFrequency(note).toFixed(2))])
);

// 预加载常用中音区，其他琴键在首次播放时按需加载。
const NOTES_TO_PRELOAD = buildChromaticRange('C4', 'C5');

// 音阶定义
const SCALES = {
  C大调: ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4'],
  G大调: ['G4', 'A4', 'B4', 'C4', 'D4', 'E4', 'F#4'],
  D大调: ['D4', 'E4', 'F#4', 'G4', 'A4', 'B4', 'C#4'],
  A大调: ['A4', 'B4', 'C#4', 'D4', 'E4', 'F#4', 'G#4'],
  E大调: ['E4', 'F#4', 'G#4', 'A4', 'B4', 'C#4', 'D#4'],
  B大调: ['B4', 'C#4', 'D#4', 'E4', 'F#4', 'G#4', 'A#4'],
  'F#大调': ['F#4', 'G#4', 'A#4', 'B4', 'C#4', 'D#4', 'E#4'],
  'C#大调': ['C#4', 'D#4', 'E#4', 'F#4', 'G#4', 'A#4', 'B#4'],
};

// 音域范围选项
const RANGE_OPTIONS = [
  { name: '基础', notes: ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4'] },
  { name: '进阶', notes: buildChromaticRange('C4', 'B4') },
  { name: '扩展', notes: buildChromaticRange('C4', 'C5') },
  { name: '低音区', notes: buildChromaticRange('A0', 'B2') },
  { name: '中音区', notes: buildChromaticRange('C3', 'B5') },
  { name: '高音区', notes: buildChromaticRange('C6', 'C8') },
  { name: '全键盘', notes: PIANO_NOTES },
];

function renderRangeOptions(selectedIndex = 0) {
  const parsedIndex = Number(selectedIndex);
  const safeSelectedIndex =
    Number.isInteger(parsedIndex) && RANGE_OPTIONS[parsedIndex] ? parsedIndex : 0;
  return RANGE_OPTIONS.map((range, index) => {
    const selected = index === safeSelectedIndex ? 'selected' : '';
    return `<option value="${index}" ${selected}>${range.name}</option>`;
  }).join('');
}

function renderStats(items) {
  return items
    .map(
      (item) => `
            <div class="stats-item">
                <span>${item.label}</span>
                <strong id="${item.id}">${item.value}</strong>
            </div>
        `
    )
    .join('');
}

function showInlineResult(element, message, type = 'info') {
  if (!element) return;
  element.textContent = message;
  element.className = `training-result ${type}`;
}

// 旋律长度选项
const MELODY_LENGTH_OPTIONS = [3, 4, 5, 7, 9];
const INTERVAL_MELODY_LENGTH_OPTIONS = [3, 4, 5, 6, 7];
const INTERVAL_TRAINING_NOTES = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'];
const INTERVAL_MAX_SEMITONES = 12;
const AUTO_MELODY_WAIT_OPTIONS = [2, 3, 5, 8, 12];
const AUTO_MELODY_BATCH_ROUNDS = 20;
const AUTO_MELODY_LEAD_IN_SECONDS = 0.4;
const AUTO_MELODY_NOTE_SECONDS = 0.72;
const AUTO_MELODY_NOTE_STEP_SECONDS = 0.84;
const AUTO_ANSWER_NOTE_SECONDS = 1.15;
const AUTO_ANSWER_NOTE_STEP_SECONDS = 1.5;
const AUTO_ANSWER_START_OFFSET_SECONDS = 0.24;
const AUTO_SOLFEGE_TTS_SECONDS = 1.5;
const AUTO_SOLFEGE_TTS_STEP_SECONDS = 1.5;
const AUTO_SOLFEGE_TTS_START_OFFSET_SECONDS = 0.06;
const AUTO_ROUND_GAP_SECONDS = 1.1;
const INTERVAL_SEMITONE_NAMES = {
  0: '同音',
  1: '小二度',
  2: '大二度',
  3: '小三度',
  4: '大三度',
  5: '纯四度',
  6: '三全音',
  7: '纯五度',
  8: '小六度',
  9: '大六度',
  10: '小七度',
  11: '大七度',
  12: '纯八度',
};
const INTERVAL_DIRECTIONS = [
  { value: 'up', label: '上', tabLabel: '上行' },
  { value: 'down', label: '下', tabLabel: '下行' },
];
const INTERVAL_OPTIONS = Object.entries(INTERVAL_SEMITONE_NAMES).flatMap(([semitones, name]) =>
  Number(semitones) === 0
    ? []
    : INTERVAL_DIRECTIONS.map((direction) => ({
        value: `${direction.value}-${semitones}`,
        direction: direction.value,
        semitones: Number(semitones),
        name,
        label: `${direction.label}${name}`,
      }))
);
const SOLFEGE_DISPLAY_NAMES = {
  C: 'do',
  'C#': '升do',
  D: 're',
  'D#': '升re',
  E: 'mi',
  F: 'fa',
  'F#': '升fa',
  G: 'sol',
  'G#': '升sol',
  A: 'la',
  'A#': '升la',
  B: 'si',
};

// 音频上下文和音频缓存
let audioContext = null;
const audioBufferCache = {};
const solfegeAudioBufferCache = {};
let currentPlayingSource = null;

// 调试模式
const DEBUG = true;

// 设备类型检测（简化版）
const isMobileDevice = () => {
  return (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    ('ontouchstart' in window && window.matchMedia('(max-width: 768px)').matches)
  );
};

// 增强型日志
function debugLog(...args) {
  if (DEBUG) {
    console.log('[音乐模块]', ...args);
  }
}

function debugError(...args) {
  console.error('[音乐模块错误]', ...args);
}

function debugWarn(...args) {
  console.warn('[音乐模块警告]', ...args);
}

// 检查是否使用了file://协议
function isFileProtocol() {
  return window.location.protocol === 'file:';
}

// 显示协议警告
function showProtocolWarning() {
  debugWarn('检测到通过file://协议访问，音频文件可能无法正常加载，请使用HTTP服务器');

  // 创建警告元素
  const warningDiv = document.createElement('div');
  warningDiv.className = 'protocol-warning';
  warningDiv.innerHTML = `
            <strong>注意!</strong> 通过直接打开文件的方式访问可能导致音频无法加载。
            <br>请通过HTTP服务器访问此页面(例如使用http-server或其他本地服务器)。
            <button id="close-warning">我知道了</button>
            <button id="use-synth">继续使用合成音频</button>
        `;

  document.body.prepend(warningDiv);

  // 添加关闭按钮事件
  document.getElementById('close-warning').addEventListener('click', () => {
    warningDiv.style.display = 'none';
  });

  // 添加使用合成音频的按钮事件
  document.getElementById('use-synth').addEventListener('click', () => {
    settingsManager.update('audio', 'useSynthAudio', true);
    warningDiv.style.display = 'none';
    location.reload();
  });
}

// 确定是否应该使用合成音频
let useSynthAudio = settingsManager.get('audio', 'useSynthAudio', false);

// 初始化音频上下文
function initAudioContext() {
  if (audioContext === null) {
    try {
      window.AudioContext = window.AudioContext || window.webkitAudioContext;
      audioContext = new AudioContext();

      // 处理移动设备上的自动播放限制
      if (audioContext.state === 'suspended') {
        debugLog('AudioContext处于挂起状态，等待用户交互解锁');

        // 添加解锁音频上下文的事件处理
        const unlockAudio = () => {
          if (audioContext.state === 'suspended') {
            audioContext.resume().then(() => {
              debugLog('AudioContext已恢复');
            });
          }
        };

        // 监听常见的用户交互事件以解锁音频
        const unlockEvents = ['touchstart', 'touchend', 'click', 'keydown'];
        unlockEvents.forEach((eventType) => {
          document.body.addEventListener(eventType, unlockAudio, { once: true, passive: true });
        });
      } else {
        debugLog('音频上下文初始化成功');
      }

      return true;
    } catch (e) {
      debugError('Web Audio API 不受支持。请使用现代浏览器。', e);
      alert(
        '您的浏览器不支持Web Audio API，音乐功能可能无法正常工作。请使用Chrome或Firefox等现代浏览器。'
      );
      return false;
    }
  }
  return true;
}

function getAppRootPath() {
  const currentPath = window.location.pathname;
  return currentPath.includes('/pages/')
    ? currentPath.slice(0, currentPath.indexOf('/pages/') + 1)
    : currentPath.replace(/[^/]*$/, '');
}

// 计算音频文件的路径
function getAudioPath(note) {
  const fileNote = noteToFileName(note);
  if (!fileNote) {
    throw new Error(`音符超出钢琴采样范围: ${note}`);
  }

  return `${window.location.origin}${getAppRootPath()}audio/piano/${fileNote}.mp3`;
}

function getSolfegeTtsPath(pitchName) {
  const fileName = pitchName.replace('#', 's');
  return `${window.location.origin}${getAppRootPath()}audio/solfege-tts/${fileName}.mp3`;
}

// 加载音频文件
function loadPianoSound(note) {
  if (!initAudioContext()) return Promise.reject('AudioContext初始化失败');

  // 如果用户选择使用合成音频或者检测到file://协议，直接使用合成音频
  if (useSynthAudio || (isFileProtocol() && !localStorage.getItem('ignoreSynthWarning'))) {
    debugLog(`使用合成音频: ${note}`);
    const synthBuffer = createSynthSound(note);
    if (synthBuffer) {
      return Promise.resolve(synthBuffer);
    }
    return Promise.reject('无法创建合成音频');
  }

  return new Promise((resolve, reject) => {
    try {
      const fileNote = noteToFileName(note);
      if (!fileNote) {
        reject(new Error(`音符超出钢琴采样范围: ${note}`));
        return;
      }

      const possiblePaths = [getAudioPath(note)];

      debugLog(`将尝试以下路径加载音频 ${note}:`, possiblePaths);

      // 显示加载状态
      showAudioStatus(`正在加载音符: ${note}`, 'loading');

      // 尝试所有可能的路径
      tryLoadFromMultiplePaths(possiblePaths)
        .then((result) => {
          showAudioStatus(`音符 ${note} 加载成功`, 'success');
          resolve(result.buffer);
        })
        .catch((error) => {
          showAudioStatus(`真实钢琴采样加载失败: ${note}`, 'error');
          debugError(`真实钢琴采样加载失败: ${note}`, error);
          reject(error);
        });
    } catch (err) {
      debugError(`加载过程中出现异常: ${note}`, err);
      reject(err);
    }
  });
}

// 依次尝试多个路径加载音频
function tryLoadFromMultiplePaths(paths) {
  // 递归尝试所有路径
  function tryPath(index) {
    if (index >= paths.length) {
      return Promise.reject(new Error('所有路径尝试失败'));
    }

    const path = paths[index];
    debugLog(`尝试路径 ${index + 1}/${paths.length}: ${path}`);

    return fetch(path)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`路径 ${path} 返回状态码: ${response.status}`);
        }
        return response.arrayBuffer();
      })
      .then((arrayBuffer) => {
        debugLog(`音频文件已加载成功: ${path}, 大小: ${arrayBuffer.byteLength} 字节`);
        return audioContext.decodeAudioData(arrayBuffer);
      })
      .then((audioBuffer) => {
        debugLog(`音频解码成功: ${path}`);
        return {
          buffer: audioBuffer,
          path: path,
        };
      })
      .catch((error) => {
        debugWarn(`路径 ${path} 加载失败: ${error.message}`);
        // 尝试下一个路径
        return tryPath(index + 1);
      });
  }

  return tryPath(0);
}

// 显示音频状态指示器
function showAudioStatus(message, type = 'info') {
  // 创建或更新状态栏
  let statusBar = document.getElementById('audio-status-bar');
  if (!statusBar) {
    statusBar = document.createElement('div');
    statusBar.id = 'audio-status-bar';
    document.body.appendChild(statusBar);
  }
  statusBar.style.opacity = '0.9';

  // 设置样式和内容
  switch (type) {
    case 'loading':
      statusBar.style.backgroundColor = '#e9f5fe';
      statusBar.style.color = '#0078d4';
      statusBar.textContent = `⏳ ${message}`;
      break;
    case 'success':
      statusBar.style.backgroundColor = '#e6f7e6';
      statusBar.style.color = '#107c10';
      statusBar.textContent = `✓ ${message}`;
      setTimeout(() => {
        statusBar.style.opacity = '0';
      }, 2000);
      break;
    case 'error':
      statusBar.style.backgroundColor = '#fde7e9';
      statusBar.style.color = '#d13438';
      statusBar.textContent = `✗ ${message}`;
      break;
    default:
      statusBar.style.backgroundColor = '#f9f9f9';
      statusBar.style.color = '#333';
      statusBar.textContent = `ℹ ${message}`;
  }

  // 确保状态栏可见
  statusBar.style.opacity = '0.9';
}

// 创建合成音频作为备选
function createSynthSound(note) {
  try {
    const normalizedNote = normalizeNoteName(note);
    const frequency = noteToFrequency(note);

    if (!frequency || !normalizedNote || !NOTE_FREQUENCIES[normalizedNote]) {
      debugError(`无法为音符生成合成音频: ${note} - 频率未定义`);
      return null;
    }

    const duration = 2.0; // 2秒
    const sampleRate = audioContext.sampleRate;
    const bufferSize = duration * sampleRate;

    const buffer = audioContext.createBuffer(1, bufferSize, sampleRate);
    const data = buffer.getChannelData(0);

    // 生成简单的正弦波
    for (let i = 0; i < bufferSize; i++) {
      // 添加包络，使声音更自然
      const envelope =
        i < 0.1 * bufferSize
          ? i / (0.1 * bufferSize) // 淡入
          : Math.max(0, 1 - (i - 0.1 * bufferSize) / (0.9 * bufferSize)); // 淡出

      data[i] = Math.sin((2 * Math.PI * frequency * i) / sampleRate) * envelope * 0.5;
    }

    debugLog(`已为音符创建合成音频: ${note}`);
    return buffer;
  } catch (err) {
    debugError(`创建合成音频失败: ${note}`, err);
    return null;
  }
}

// 预加载所有音符
function preloadAllNotes() {
  console.log('开始预加载所有音符...');

  const loadPromises = NOTES_TO_PRELOAD.map((note) => {
    return loadPianoSound(note)
      .then((buffer) => {
        audioBufferCache[note] = buffer;
        console.log(`预加载音符成功: ${note}`);
      })
      .catch((err) => {
        console.warn(`预加载音符失败: ${note}`, err);
      });
  });

  Promise.all(loadPromises)
    .then(() => console.log('所有音符预加载完成'))
    .catch((err) => console.error('预加载过程中出现错误', err));
}

// 播放音符
function playNote(note) {
  if (!initAudioContext()) return;

  // 尝试恢复被挂起的AudioContext (对移动设备很重要)
  if (audioContext.state === 'suspended') {
    audioContext
      .resume()
      .then(() => {
        debugLog('AudioContext已恢复，重试播放');
        // 递归调用自身重新尝试播放
        setTimeout(() => playNote(note), 100);
      })
      .catch((err) => {
        debugError('恢复AudioContext失败', err);
      });
    return;
  }

  // 停止当前正在播放的声音
  if (currentPlayingSource) {
    try {
      currentPlayingSource.stop();
    } catch (err) {
      debugWarn('停止当前播放源时出错', err);
    }
  }

  // 检查缓存
  if (!audioBufferCache[note]) {
    // 如果缓存中没有，则尝试加载
    debugLog(`缓存中未找到音符 ${note}, 正在加载...`);

    // 移动设备上显示加载指示
    if (isMobileDevice()) {
      showAudioStatus(`正在加载音符 ${note}...`, 'loading');
    }

    loadPianoSound(note)
      .then((audioBuffer) => {
        // 保存到缓存
        audioBufferCache[note] = audioBuffer;
        debugLog(`音符加载完成并已缓存: ${note}`);

        // 播放
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.destination);

        try {
          source.start();
          currentPlayingSource = source;
          debugLog(`正在播放音符: ${note}`);

          if (isMobileDevice()) {
            showAudioStatus(`播放音符: ${note}`, 'success');
          }
        } catch (err) {
          debugError(`开始播放音符时出错: ${note}`, err);
        }
      })
      .catch((error) => {
        debugError(`播放音符失败: ${note}`, error);

        if (isMobileDevice()) {
          showAudioStatus(`无法播放音符 ${note}`, 'error');
        } else {
          alert(`无法播放音符 ${note}, 请检查控制台获取详细信息。`);
        }
      });
    return;
  }

  // 如果缓存中已有，直接播放
  try {
    const source = audioContext.createBufferSource();
    source.buffer = audioBufferCache[note];
    source.connect(audioContext.destination);
    source.start();
    currentPlayingSource = source;
    debugLog(`从缓存播放音符: ${note}`);
    return source;
  } catch (err) {
    debugError(`播放缓存的音符时出错: ${note}`, err);
    // 尝试重新加载
    delete audioBufferCache[note];
    debugLog(`已从缓存中移除损坏的音符: ${note}, 将重新加载`);
    playNote(note);
  }
}

// 播放音阶
function playScale(scaleName) {
  if (!SCALES[scaleName]) {
    console.error(`未知音阶: ${scaleName}`);
    return;
  }

  // 获取用户设置
  const settings = loadUserSettings();
  const audioSettings = settings.audio || { noteDelay: 400 };
  const delay = audioSettings.noteDelay || 400;

  // 依次播放音阶中的每个音符
  const notes = SCALES[scaleName];
  notes.forEach((note, index) => {
    setTimeout(() => {
      playNote(note);
    }, index * delay);
  });
}

// 播放旋律
function playMelody(melody) {
  if (!Array.isArray(melody) || melody.length === 0) {
    console.error('无效的旋律序列');
    return;
  }

  // 获取用户设置
  const settings = loadUserSettings();
  const audioSettings = settings.audio || { noteDelay: 400 };
  const delay = audioSettings.noteDelay || 400;

  // 依次播放旋律中的每个音符
  melody.forEach((note, index) => {
    setTimeout(() => {
      playNote(note);
    }, index * delay);
  });
}

// 停止所有声音
function stopAllSounds() {
  if (currentPlayingSource) {
    currentPlayingSource.stop();
    currentPlayingSource = null;
  }
}

// 生成随机旋律
function generateRandomMelody(rangeIndex, length) {
  const availableNotes = RANGE_OPTIONS[rangeIndex].notes;
  const melody = [];

  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * availableNotes.length);
    melody.push(availableNotes[randomIndex]);
  }

  return melody;
}

function getIntervalCandidateNotes(previousNote, availableNotes) {
  if (!previousNote) return availableNotes;

  const previousMidi = noteToMidi(previousNote);
  if (previousMidi === null) return availableNotes;

  return availableNotes.filter((note) => {
    const midi = noteToMidi(note);
    if (midi === null) return false;

    const semitones = Math.abs(midi - previousMidi);
    return semitones > 0 && semitones <= INTERVAL_MAX_SEMITONES;
  });
}

function generateIntervalTrainingMelody(rangeIndex, length) {
  const rangeNotes = RANGE_OPTIONS[rangeIndex]?.notes || INTERVAL_TRAINING_NOTES;
  const availableNotes = rangeNotes.filter((note) => noteToMidi(note) !== null);
  const melody = [];

  for (let i = 0; i < length; i++) {
    const candidates = getIntervalCandidateNotes(melody[i - 1], availableNotes);
    const sourceNotes = candidates.length > 0 ? candidates : availableNotes;
    const note = sourceNotes[Math.floor(Math.random() * sourceNotes.length)];
    melody.push(note);
  }

  return melody;
}

function getDirectedInterval(fromNote, toNote) {
  const fromMidi = noteToMidi(fromNote);
  const toMidi = noteToMidi(toNote);
  if (fromMidi === null || toMidi === null) return null;

  const delta = toMidi - fromMidi;
  const semitones = Math.abs(delta);
  const intervalName = INTERVAL_SEMITONE_NAMES[semitones];
  if (!intervalName) return null;

  if (delta === 0) {
    return {
      value: 'same-0',
      direction: 'same',
      semitones,
      label: intervalName,
    };
  }

  const direction = delta > 0 ? 'up' : 'down';
  return {
    value: `${direction}-${semitones}`,
    direction,
    semitones,
    label: `${direction === 'up' ? '上' : '下'}${intervalName}`,
  };
}

function getMelodyIntervals(melody) {
  const intervals = [];
  for (let i = 1; i < melody.length; i++) {
    const interval = getDirectedInterval(melody[i - 1], melody[i]);
    if (interval) intervals.push(interval);
  }
  return intervals;
}

function getSolfegeParts(note) {
  const normalizedNote = normalizeNoteName(note) || note;
  const match = /^([A-G]#?)(-?\d+)$/.exec(normalizedNote);
  if (!match) return null;

  const [, pitchName, octave] = match;
  return { pitchName, octave };
}

function formatAnswerNote(note) {
  const parts = getSolfegeParts(note);
  if (!parts) return normalizeNoteName(note) || note;

  return `${SOLFEGE_DISPLAY_NAMES[parts.pitchName] || parts.pitchName.toLowerCase()}${parts.octave}`;
}

function formatMelodyAnswer(melody) {
  return melody.map((note) => formatAnswerNote(note));
}

function getSolfegePitchName(note) {
  const parts = getSolfegeParts(note);
  if (!parts) {
    throw new Error(`无法转换唱名: ${note}`);
  }
  return parts.pitchName;
}

function getSequenceDuration(noteCount, stepSeconds, noteSeconds) {
  if (noteCount <= 0) return 0;
  return (noteCount - 1) * stepSeconds + noteSeconds;
}

function createAutoMelodySession(options) {
  const { rangeIndex, melodyLength, answerDelay } = options;
  const roundCount = AUTO_MELODY_BATCH_ROUNDS;
  const rounds = [];
  let cursor = AUTO_MELODY_LEAD_IN_SECONDS;

  for (let index = 0; index < roundCount; index++) {
    const melody = generateIntervalTrainingMelody(rangeIndex, melodyLength);
    const answerLabels = formatMelodyAnswer(melody);
    const melodyStart = cursor;
    const melodyEnd =
      melodyStart +
      getSequenceDuration(melody.length, AUTO_MELODY_NOTE_STEP_SECONDS, AUTO_MELODY_NOTE_SECONDS);
    const answerRevealTime = melodyEnd + answerDelay;
    const answerStart = answerRevealTime + AUTO_ANSWER_START_OFFSET_SECONDS;
    const answerToneEnd =
      answerStart +
      getSequenceDuration(melody.length, AUTO_ANSWER_NOTE_STEP_SECONDS, AUTO_ANSWER_NOTE_SECONDS);
    const speechStart = answerStart + AUTO_SOLFEGE_TTS_START_OFFSET_SECONDS;
    const speechEnd =
      speechStart +
      getSequenceDuration(melody.length, AUTO_SOLFEGE_TTS_STEP_SECONDS, AUTO_SOLFEGE_TTS_SECONDS);
    const answerEnd = Math.max(answerToneEnd, speechEnd);
    const endTime = answerEnd + AUTO_ROUND_GAP_SECONDS;

    rounds.push({
      index,
      melody,
      answerLabels,
      melodyStart,
      melodyEnd,
      answerRevealTime,
      answerStart,
      answerEnd,
      speechStart,
      speechEnd,
      endTime,
    });
    cursor = endTime;
  }

  return {
    ...options,
    rounds,
    duration: cursor + 0.4,
  };
}

async function getTrainingAudioBuffer(note) {
  if (audioBufferCache[note]) return audioBufferCache[note];

  try {
    const buffer = await loadPianoSound(note);
    audioBufferCache[note] = buffer;
    return buffer;
  } catch (error) {
    debugWarn(`采样加载失败，使用合成音: ${note}`, error);
    const synthBuffer = createSynthSound(note);
    if (!synthBuffer) throw error;
    audioBufferCache[note] = synthBuffer;
    return synthBuffer;
  }
}

async function getSolfegeAudioBuffer(pitchName) {
  if (!initAudioContext()) throw new Error('AudioContext 初始化失败');
  if (solfegeAudioBufferCache[pitchName]) return solfegeAudioBufferCache[pitchName];

  const response = await fetch(getSolfegeTtsPath(pitchName));
  if (!response.ok) {
    throw new Error(`唱名语音资源加载失败: ${pitchName}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = await audioContext.decodeAudioData(arrayBuffer);
  solfegeAudioBufferCache[pitchName] = buffer;
  return buffer;
}

function mixAudioBuffer(target, sampleRate, sourceBuffer, startTime, duration, gain = 0.75) {
  const startSample = Math.max(0, Math.floor(startTime * sampleRate));
  const maxSamples = Math.min(
    Math.floor(duration * sampleRate),
    sourceBuffer.length,
    target.length - startSample
  );
  const channelCount = sourceBuffer.numberOfChannels;
  const fadeInSamples = Math.max(1, Math.floor(0.018 * sampleRate));
  const fadeOutSamples = Math.max(1, Math.floor(0.06 * sampleRate));

  for (let i = 0; i < maxSamples; i++) {
    let value = 0;
    for (let channel = 0; channel < channelCount; channel++) {
      value += sourceBuffer.getChannelData(channel)[i] / channelCount;
    }

    const fadeIn = Math.min(1, i / fadeInSamples);
    const fadeOut = Math.min(1, (maxSamples - i) / fadeOutSamples);
    target[startSample + i] += value * gain * Math.min(fadeIn, fadeOut);
  }
}

function mixNoteSequence(
  target,
  sampleRate,
  buffers,
  melody,
  startTime,
  stepSeconds,
  noteSeconds,
  gain
) {
  melody.forEach((note, index) => {
    const buffer = buffers[note];
    if (!buffer) return;
    mixAudioBuffer(target, sampleRate, buffer, startTime + index * stepSeconds, noteSeconds, gain);
  });
}

function mixSolfegeSequence(target, sampleRate, buffers, melody, startTime, gain) {
  melody.forEach((note, index) => {
    const pitchName = getSolfegePitchName(note);
    const buffer = buffers[pitchName];
    if (!buffer) {
      throw new Error(`唱名语音资源未加载: ${pitchName}`);
    }
    mixAudioBuffer(
      target,
      sampleRate,
      buffer,
      startTime + index * AUTO_SOLFEGE_TTS_STEP_SECONDS,
      Math.min(AUTO_SOLFEGE_TTS_SECONDS, buffer.duration),
      gain
    );
  });
}

function encodeWav(samples, sampleRate) {
  const bytesPerSample = 2;
  const blockAlign = bytesPerSample;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  function writeString(offset, value) {
    for (let i = 0; i < value.length; i++) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  }

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += 2;
  }

  return buffer;
}

async function createAutoMelodyAudioBlob(session) {
  if (!initAudioContext()) throw new Error('AudioContext 初始化失败');
  if (audioContext.state === 'suspended') {
    await audioContext.resume();
  }

  const uniqueNotes = [...new Set(session.rounds.flatMap((round) => round.melody))];
  const uniqueSolfegePitchNames = [
    ...new Set(uniqueNotes.map((note) => getSolfegePitchName(note))),
  ];
  const buffers = {};
  const solfegeBuffers = {};
  await Promise.all(
    uniqueNotes.map(async (note) => {
      buffers[note] = await getTrainingAudioBuffer(note);
    })
  );
  await Promise.all(
    uniqueSolfegePitchNames.map(async (pitchName) => {
      solfegeBuffers[pitchName] = await getSolfegeAudioBuffer(pitchName);
    })
  );

  const sampleRate = audioContext.sampleRate;
  const samples = new Float32Array(Math.ceil(session.duration * sampleRate));

  session.rounds.forEach((round) => {
    mixNoteSequence(
      samples,
      sampleRate,
      buffers,
      round.melody,
      round.melodyStart,
      AUTO_MELODY_NOTE_STEP_SECONDS,
      AUTO_MELODY_NOTE_SECONDS,
      0.82
    );
    mixNoteSequence(
      samples,
      sampleRate,
      buffers,
      round.melody,
      round.answerStart,
      AUTO_ANSWER_NOTE_STEP_SECONDS,
      AUTO_ANSWER_NOTE_SECONDS,
      0.42
    );
    mixSolfegeSequence(samples, sampleRate, solfegeBuffers, round.melody, round.speechStart, 0.92);
  });

  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    peak = Math.max(peak, Math.abs(samples[i]));
  }
  if (peak > 0.95) {
    const scale = 0.95 / peak;
    for (let i = 0; i < samples.length; i++) {
      samples[i] *= scale;
    }
  }

  return new Blob([encodeWav(samples, sampleRate)], { type: 'audio/wav' });
}

// 加载用户设置
function loadUserSettings() {
  try {
    const settings = storage.getJSON(StorageKeys.appSettings, null);
    if (settings) {
      return {
        audio: settings.audio || {
          volume: 0.8,
          noteDelay: 400,
          answerDelay: 1000,
          autoPlayNext: true,
        },
        game: {
          startingDifficulty: settings.music?.startingDifficulty || 0,
          melodyLength: settings.music?.melodyLength || 3,
          pointsPerCorrect: settings.music?.pointsPerCorrect || 10,
          showHints: settings.music?.showHints || true,
        },
        ui: settings.ui || { theme: 'dark', fontSize: 16, animations: true, highContrast: false },
      };
    }
  } catch (e) {
    console.error('加载设置出错:', e);
  }

  return {
    audio: { volume: 0.8, noteDelay: 400, answerDelay: 1000, autoPlayNext: true },
    game: { startingDifficulty: 0, melodyLength: 3, pointsPerCorrect: 10, showHints: true },
    ui: { theme: 'dark', fontSize: 16, animations: true, highContrast: false },
  };
}

// 加载音乐练习内容
function loadMusicContent(moduleId) {
  // 初始化音频环境
  initAudioContext();

  const container = document.getElementById(`${moduleId}-container`);
  if (!container) return;

  // 清空容器
  container.innerHTML = '';

  switch (moduleId) {
    case 'scales-training':
      container.innerHTML = createScalesTrainingUI();
      initScalesTrainingListeners();
      break;
    case 'single-note':
      container.innerHTML = createSingleNoteTrainingUI();
      initSingleNoteTrainingListeners();
      break;
    case 'multi-note':
      container.innerHTML = createMultiNoteTrainingUI();
      initMultiNoteTrainingListeners();
      break;
    case 'interval-training':
      container.innerHTML = createIntervalTrainingUI();
      initIntervalTrainingListeners();
      break;
    case 'auto-melody':
      container.innerHTML = createAutoMelodyPracticeUI();
      initAutoMelodyPracticeListeners();
      break;
    default:
      container.innerHTML = '<p>请选择一个练习模式</p>';
  }

  // 内容加载完成后添加触摸反馈
  if (isMobileDevice()) {
    setTimeout(addTouchFeedback, 100);
  }
}

// 创建音阶练习UI
function createScalesTrainingUI() {
  const scaleNames = Object.keys(SCALES);

  return `
            <h3>音阶练习</h3>
            <div class="compact-container">
                <div class="left-panel">
                    <div class="scale-buttons">
                        ${scaleNames
                          .map(
                            (name) =>
                              `<div class="scale-button" data-scale="${name}" role="button" tabindex="0">
                                <div class="scale-name">${name}</div>
                                <div class="scale-controls">
                                    <button class="play-button" data-scale="${name}">播放</button>
                                </div>
                            </div>`
                          )
                          .join('')}
                    </div>
                </div>
                <div class="right-panel">
                    <div class="scale-detail">
                        <h4 id="current-scale-name"></h4>
                        <div class="scale-notes" id="scale-notes"></div>
                    </div>
                </div>
            </div>
        `;
}

// 初始化音阶练习事件监听器
function initScalesTrainingListeners() {
  const selectScale = (scaleName) => {
    document.getElementById('current-scale-name').textContent = scaleName;
    showScaleNotes(scaleName);

    const scaleButtons = document.querySelectorAll('.scale-button');
    scaleButtons.forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-scale') === scaleName);
    });
  };

  const scaleButtons = document.querySelectorAll('.scale-button');
  scaleButtons.forEach((button) => {
    button.addEventListener('click', () => {
      selectScale(button.getAttribute('data-scale'));
    });
    button.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectScale(button.getAttribute('data-scale'));
      }
    });
  });

  const playButtons = document.querySelectorAll('.play-button');
  playButtons.forEach((button) => {
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      const scaleName = e.target.getAttribute('data-scale');
      selectScale(scaleName);
      playScale(scaleName);
    });
  });

  // 默认显示第一个音阶的信息
  const scaleNames = Object.keys(SCALES);
  if (scaleNames.length > 0) {
    selectScale(scaleNames[0]);
  }
}

// 显示音阶音符
function showScaleNotes(scaleName) {
  const scaleNotesContainer = document.getElementById('scale-notes');
  if (!scaleNotesContainer) return;

  // 清空容器
  scaleNotesContainer.innerHTML = '';

  // 获取音阶音符
  const scaleNotes = SCALES[scaleName];

  // 创建音符显示
  scaleNotes.forEach((note) => {
    const noteElement = document.createElement('div');
    noteElement.className = 'scale-note';
    noteElement.textContent = note;
    noteElement.addEventListener('click', () => {
      playNote(note);

      // 高亮点击的音符
      noteElement.classList.add('active');
      setTimeout(() => {
        noteElement.classList.remove('active');
      }, 500);
    });

    scaleNotesContainer.appendChild(noteElement);
  });
}

// 创建单音辨听训练UI
function createSingleNoteTrainingUI() {
  const settings = loadUserSettings();
  // 确保settings.game存在，如果不存在则使用默认值
  const gameSettings = settings.game || { startingDifficulty: 0 };
  const defaultDifficulty = gameSettings.startingDifficulty || 0;

  return `
            <h3>单音辨听训练</h3>
            <div class="training-toolbar">
                <div class="difficulty-selection">
                    <label for="note-difficulty">音域</label>
                    <select id="note-difficulty">
                        ${renderRangeOptions(defaultDifficulty)}
                    </select>
                </div>
                <button id="play-single-note" class="play-button">播放音符</button>
                <div class="game-stats">
                    ${renderStats([
                      { label: '正确', id: 'correct-count', value: 0 },
                      { label: '错误', id: 'error-count', value: 0 },
                      { label: '准确率', id: 'accuracy', value: '0%' },
                    ])}
                </div>
                <div id="single-note-result" class="training-result" aria-live="polite"></div>
            </div>
            <div class="compact-container">
                <div class="main-panel">
                    <div class="notes-section">
                        <h4>选择答案</h4>
                        <div id="notes-grid" class="notes-grid">
                            <!-- 音符选项将在这里生成 -->
                        </div>
                    </div>
                </div>
            </div>
        `;
}

// 初始化单音辨听训练事件监听器
function initSingleNoteTrainingListeners() {
  // 单音辨听状态
  let currentNote = null;
  let correctCount = 0;
  let errorCount = 0;
  const resultDisplay = document.getElementById('single-note-result');

  // 初始化音符按钮
  initNoteButtons();

  // 更新统计信息
  function updateStats() {
    document.getElementById('correct-count').textContent = correctCount;
    document.getElementById('error-count').textContent = errorCount;
    const totalAttempts = correctCount + errorCount;
    const accuracy = totalAttempts > 0 ? Math.round((correctCount / totalAttempts) * 100) : 0;
    document.getElementById('accuracy').textContent = `${accuracy}%`;
  }

  // 初始化音符按钮
  function initNoteButtons() {
    const notesGrid = document.getElementById('notes-grid');
    if (!notesGrid) return;

    // 清空现有内容
    notesGrid.innerHTML = '';

    // 获取当前难度的可用音符
    const difficultyIndex = parseInt(document.getElementById('note-difficulty').value);
    const availableNotes = RANGE_OPTIONS[difficultyIndex].notes;
    notesGrid.classList.toggle('dense-grid', availableNotes.length > 24);

    // 创建音符按钮
    availableNotes.forEach((note) => {
      const noteButton = document.createElement('div');
      noteButton.className = 'note-button';
      noteButton.textContent = note;
      noteButton.addEventListener('click', () => {
        if (currentNote) {
          // 检查是否选择了正确的音符
          if (note === currentNote) {
            correctCount++;
            noteButton.classList.add('correct');
            showInlineResult(resultDisplay, `正确：${note}`, 'success');

            // 获取用户设置
            const settings = loadUserSettings();
            const audioSettings = settings.audio || { autoPlayNext: true, answerDelay: 1000 };

            setTimeout(() => {
              // 成功后自动播放下一个音符
              noteButton.classList.remove('correct');
              if (audioSettings.autoPlayNext) {
                playRandomNote();
              }
            }, audioSettings.answerDelay || 1000);
          } else {
            errorCount++;
            noteButton.classList.add('incorrect');
            showInlineResult(resultDisplay, `错误，重新听一遍当前音符`, 'error');
            setTimeout(() => {
              noteButton.classList.remove('incorrect');
            }, 1000);
          }
          updateStats();
        } else {
          // 如果没有当前音符，直接播放
          playNote(note);
        }
      });

      notesGrid.appendChild(noteButton);
    });
  }

  // 播放随机音符
  function playRandomNote() {
    const difficultyIndex = parseInt(document.getElementById('note-difficulty').value);
    const availableNotes = RANGE_OPTIONS[difficultyIndex].notes;
    const randomIndex = Math.floor(Math.random() * availableNotes.length);
    currentNote = availableNotes[randomIndex];
    showInlineResult(resultDisplay, '', 'info');

    // 清除所有高亮
    const noteButtons = document.querySelectorAll('.note-button');
    noteButtons.forEach((button) => {
      button.classList.remove('correct');
      button.classList.remove('incorrect');
    });

    playNote(currentNote);
  }

  // 难度变化时重新生成音符按钮
  document.getElementById('note-difficulty').addEventListener('change', () => {
    initNoteButtons();
    currentNote = null;
    showInlineResult(resultDisplay, '', 'info');
  });

  // 初始化播放按钮
  document.getElementById('play-single-note').addEventListener('click', () => {
    if (currentNote) {
      playNote(currentNote);
    } else {
      playRandomNote();
    }
  });
}

// 创建多音辨听训练UI
function createMultiNoteTrainingUI() {
  const settings = loadUserSettings();
  // 确保settings.game存在，如果不存在则使用默认值
  const gameSettings = settings.game || { melodyLength: 3, startingDifficulty: 0 };
  const defaultMelodyLength = gameSettings.melodyLength || 3;
  const defaultDifficulty = gameSettings.startingDifficulty || 0;

  return `
            <h3>多音辨听训练</h3>
            <div class="training-toolbar">
                <div class="difficulty-selection">
                    <label for="melody-length">长度</label>
                    <select id="melody-length">
                        ${MELODY_LENGTH_OPTIONS.map(
                          (length) =>
                            `<option value="${length}" ${length === defaultMelodyLength ? 'selected' : ''}>${length}个音符</option>`
                        ).join('')}
                    </select>
                </div>
                <div class="difficulty-selection">
                    <label for="melody-range">音域</label>
                    <select id="melody-range">
                        ${renderRangeOptions(defaultDifficulty)}
                    </select>
                </div>
                <div class="game-stats">
                    ${renderStats([
                      { label: '得分', id: 'melody-score', value: 0 },
                      { label: '最高分', id: 'high-score', value: 0 },
                    ])}
                </div>
            </div>
            <div class="compact-container">
                <div class="left-panel">
                    <div class="melody-play-section">
                        <div class="melody-actions">
                            <button id="play-melody" class="play-button">播放旋律</button>
                            <button id="new-melody">新旋律</button>
                        </div>
                        <div id="melody-display" class="melody-display">
                            <!-- 旋律将在这里显示 -->
                        </div>
                    </div>
                    <div class="melody-answer-section">
                        <h4>您的答案</h4>
                        <div id="user-selection" class="user-selection">
                            <!-- 用户的选择会在这里显示 -->
                        </div>
                    </div>
                    <div id="melody-controls" class="controls">
                        <button id="check-melody">检查答案</button>
                    </div>
                    <div id="melody-result" class="training-result" aria-live="polite"></div>
                </div>
                <div class="right-panel">
                    <div class="notes-section">
                        <h4>可选音符</h4>
                        <div id="notes-selection" class="notes-grid">
                            <!-- 音符选择将在这里生成 -->
                        </div>
                    </div>
                </div>
            </div>
        `;
}

// 初始化多音辨听训练事件监听器
function initMultiNoteTrainingListeners() {
  // 旋律状态
  let currentMelody = [];
  let userSelection = [];
  let melodyScore = 0;
  let highScore = Number(localStorage.getItem('melodyHighScore') || 0);

  // 显示最高分
  document.getElementById('high-score').textContent = highScore;

  // 获取DOM元素
  const melodyLengthSelect = document.getElementById('melody-length');
  const melodyRangeSelect = document.getElementById('melody-range');
  const playMelodyBtn = document.getElementById('play-melody');
  const checkMelodyBtn = document.getElementById('check-melody');
  const newMelodyBtn = document.getElementById('new-melody');
  const melodyDisplay = document.getElementById('melody-display');
  const userSelectionDiv = document.getElementById('user-selection');
  const notesSelectionDiv = document.getElementById('notes-selection');
  const scoreDisplay = document.getElementById('melody-score');
  const resultDisplay = document.getElementById('melody-result');

  // 生成新旋律
  function generateNewMelody() {
    const melodyLength = parseInt(melodyLengthSelect.value);
    const melodyRange = parseInt(melodyRangeSelect.value);

    currentMelody = generateRandomMelody(melodyRange, melodyLength);
    userSelection = [];

    // 更新显示
    updateMelodyDisplay();
    updateUserSelection();
    showInlineResult(resultDisplay, '', 'info');
    // 更新音符选择按钮
    updateNotesSelection();
  }

  // 播放当前旋律
  function playCurrentMelody() {
    if (currentMelody.length > 0) {
      playMelody(currentMelody);
    }
  }

  // 更新旋律显示
  function updateMelodyDisplay() {
    melodyDisplay.innerHTML = '';
    for (let i = 0; i < currentMelody.length; i++) {
      const noteSlot = document.createElement('div');
      noteSlot.className = 'note-slot';
      noteSlot.textContent = '?';
      melodyDisplay.appendChild(noteSlot);
    }
  }

  // 更新用户选择显示
  function updateUserSelection() {
    userSelectionDiv.innerHTML = '';

    if (userSelection.length === 0) {
      const emptyMsg = document.createElement('p');
      emptyMsg.className = 'empty-selection';
      emptyMsg.textContent = '请选择音符来完成旋律';
      userSelectionDiv.appendChild(emptyMsg);
      return;
    }

    for (let i = 0; i < userSelection.length; i++) {
      const noteElement = document.createElement('div');
      noteElement.className = 'selected-note';
      noteElement.textContent = userSelection[i];

      // 添加删除按钮
      const deleteBtn = document.createElement('span');
      deleteBtn.className = 'delete-note';
      deleteBtn.textContent = '×';
      deleteBtn.onclick = () => {
        userSelection.splice(i, 1);
        updateUserSelection();
      };

      noteElement.appendChild(deleteBtn);
      userSelectionDiv.appendChild(noteElement);
    }
  }

  // 更新音符选择按钮
  function updateNotesSelection() {
    notesSelectionDiv.innerHTML = '';

    // 获取当前难度的可用音符
    const melodyRange = parseInt(melodyRangeSelect.value);
    const availableNotes = RANGE_OPTIONS[melodyRange].notes;
    notesSelectionDiv.classList.toggle('dense-grid', availableNotes.length > 24);

    // 创建音符按钮
    availableNotes.forEach((note) => {
      const noteButton = document.createElement('div');
      noteButton.className = 'note-button';
      noteButton.textContent = note;
      noteButton.addEventListener('click', () => {
        // 播放音符
        playNote(note);

        // 如果当前旋律已满，不再添加
        if (userSelection.length < currentMelody.length) {
          userSelection.push(note);
          updateUserSelection();
        }
      });

      notesSelectionDiv.appendChild(noteButton);
    });
  }

  // 检查答案
  function checkAnswer() {
    if (userSelection.length !== currentMelody.length) {
      showInlineResult(
        resultDisplay,
        `还需要选择 ${currentMelody.length - userSelection.length} 个音符`,
        'warning'
      );
      return;
    }

    // 计算正确数量
    let correctCount = 0;
    for (let i = 0; i < currentMelody.length; i++) {
      if (userSelection[i] === currentMelody[i]) {
        correctCount++;
      }
    }

    // 获取设置
    const settings = loadUserSettings();
    const audioSettings = settings.audio || { answerDelay: 1000, autoPlayNext: true };
    const gameSettings = settings.game || { pointsPerCorrect: 10 };

    // 计算分数
    const pointsPerCorrect = gameSettings.pointsPerCorrect || 10;
    const newScore = currentMelody.length * pointsPerCorrect;

    // 显示正确答案
    showAnswer();

    // 显示结果信息
    if (correctCount === currentMelody.length) {
      melodyScore += newScore;
      if (melodyScore > highScore) {
        highScore = melodyScore;
        localStorage.setItem('melodyHighScore', highScore);
        document.getElementById('high-score').textContent = highScore;
      }
      scoreDisplay.textContent = melodyScore;
      showInlineResult(resultDisplay, `全部正确，得分 +${newScore}`, 'success');

      if (audioSettings.autoPlayNext !== false) {
        setTimeout(() => {
          generateNewMelody();
          setTimeout(() => {
            playCurrentMelody();
          }, 500);
        }, audioSettings.answerDelay || 1000);
      }
    } else {
      melodyScore = 0;
      scoreDisplay.textContent = melodyScore;
      showInlineResult(
        resultDisplay,
        `答对 ${correctCount}/${currentMelody.length}，连击已重置`,
        'error'
      );
    }
  }

  // 显示正确答案
  function showAnswer() {
    melodyDisplay.innerHTML = '';
    for (let i = 0; i < currentMelody.length; i++) {
      const noteElement = document.createElement('div');
      noteElement.className = 'note-slot correct';
      noteElement.textContent = currentMelody[i];

      if (userSelection[i] === currentMelody[i]) {
        noteElement.classList.add('user-correct');
      }

      melodyDisplay.appendChild(noteElement);
    }
  }

  // 事件监听
  melodyRangeSelect.addEventListener('change', () => {
    updateNotesSelection();
    // 自动生成新旋律
    generateNewMelody();
  });

  // 添加旋律长度变化的事件监听，自动生成新旋律
  melodyLengthSelect.addEventListener('change', () => {
    generateNewMelody();
  });

  // 添加事件监听
  playMelodyBtn.addEventListener('click', playCurrentMelody);
  checkMelodyBtn.addEventListener('click', checkAnswer);
  newMelodyBtn.addEventListener('click', generateNewMelody);

  // 初始生成一个旋律
  generateNewMelody();
}

// 创建音程训练UI
function createIntervalTrainingUI() {
  const settings = loadUserSettings();
  const gameSettings = settings.game || { startingDifficulty: 0 };
  const defaultDifficulty = gameSettings.startingDifficulty || 0;
  const defaultMelodyLength = 4;

  return `
            <h3>音程训练</h3>
            <div class="training-toolbar">
                <div class="difficulty-selection">
                    <label for="interval-melody-length">长度</label>
                    <select id="interval-melody-length">
                        ${INTERVAL_MELODY_LENGTH_OPTIONS.map(
                          (length) =>
                            `<option value="${length}" ${length === defaultMelodyLength ? 'selected' : ''}>${length}个音符</option>`
                        ).join('')}
                    </select>
                </div>
                <div class="difficulty-selection">
                    <label for="interval-range">音域</label>
                    <select id="interval-range">
                        ${renderRangeOptions(defaultDifficulty)}
                    </select>
                </div>
                <div class="game-stats">
                    ${renderStats([
                      { label: '得分', id: 'interval-score', value: 0 },
                      { label: '最高分', id: 'interval-high-score', value: 0 },
                    ])}
                </div>
            </div>
            <div class="compact-container interval-training-layout">
                <div class="left-panel">
                    <div class="melody-play-section">
                        <div class="melody-actions">
                            <button id="play-interval-melody" class="play-button">播放旋律</button>
                            <button id="new-interval-melody">新旋律</button>
                        </div>
                        <div id="interval-melody-display" class="melody-display interval-melody-display">
                            <!-- 旋律将在这里显示 -->
                        </div>
                    </div>
                    <div class="melody-answer-section">
                        <h4>您的音程答案</h4>
                        <div id="interval-user-selection" class="user-selection interval-user-selection">
                            <!-- 用户的音程选择会在这里显示 -->
                        </div>
                    </div>
                    <div id="interval-controls" class="controls">
                        <button id="check-intervals">检查答案</button>
                        <button id="clear-interval-answer" class="secondary-action" type="button">撤销一个</button>
                    </div>
                    <div id="interval-result" class="training-result" aria-live="polite"></div>
                </div>
                <div class="right-panel">
                    <div class="notes-section">
                        <h4>可选音程</h4>
                        <div class="interval-direction-tabs" role="tablist" aria-label="音程方向">
                            ${INTERVAL_DIRECTIONS.map(
                              (direction) => `
                                <button
                                    type="button"
                                    class="interval-direction-tab ${direction.value}"
                                    data-interval-direction="${direction.value}"
                                    role="tab"
                                    aria-selected="${direction.value === 'up' ? 'true' : 'false'}"
                                >
                                    ${direction.tabLabel}
                                </button>
                            `
                            ).join('')}
                        </div>
                        <div id="interval-options" class="interval-options-grid">
                            <!-- 音程选择将在这里生成 -->
                        </div>
                    </div>
                </div>
            </div>
        `;
}

// 初始化音程训练事件监听器
function initIntervalTrainingListeners() {
  let currentMelody = [];
  let correctIntervals = [];
  let userIntervals = [];
  let selectedIntervalDirection = 'up';
  let intervalScore = 0;
  let highScore = Number(localStorage.getItem('intervalTrainingHighScore') || 0);

  const melodyLengthSelect = document.getElementById('interval-melody-length');
  const intervalRangeSelect = document.getElementById('interval-range');
  const playMelodyBtn = document.getElementById('play-interval-melody');
  const newMelodyBtn = document.getElementById('new-interval-melody');
  const checkIntervalsBtn = document.getElementById('check-intervals');
  const clearAnswerBtn = document.getElementById('clear-interval-answer');
  const melodyDisplay = document.getElementById('interval-melody-display');
  const userSelectionDiv = document.getElementById('interval-user-selection');
  const intervalOptionsDiv = document.getElementById('interval-options');
  const intervalDirectionTabs = document.querySelectorAll('[data-interval-direction]');
  const scoreDisplay = document.getElementById('interval-score');
  const highScoreDisplay = document.getElementById('interval-high-score');
  const resultDisplay = document.getElementById('interval-result');

  highScoreDisplay.textContent = highScore;

  function generateNewIntervalMelody() {
    const melodyLength = parseInt(melodyLengthSelect.value);
    const intervalRange = parseInt(intervalRangeSelect.value);
    currentMelody = generateIntervalTrainingMelody(intervalRange, melodyLength);
    correctIntervals = getMelodyIntervals(currentMelody);
    userIntervals = [];

    updateMelodyDisplay(false);
    updateUserSelection(false);
    updateIntervalOptions();
    showInlineResult(resultDisplay, '', 'info');
  }

  function playCurrentMelody() {
    if (currentMelody.length > 0) {
      playMelody(currentMelody);
    }
  }

  function updateMelodyDisplay(revealAnswer) {
    melodyDisplay.innerHTML = '';

    currentMelody.forEach((note, index) => {
      if (index > 0) {
        const bridge = document.createElement('div');
        bridge.className = 'interval-bridge';
        bridge.textContent = revealAnswer ? correctIntervals[index - 1].label : `${index}`;
        melodyDisplay.appendChild(bridge);
      }

      const noteSlot = document.createElement('div');
      noteSlot.className = revealAnswer ? 'note-slot correct' : 'note-slot';
      noteSlot.textContent = revealAnswer ? note : '?';
      melodyDisplay.appendChild(noteSlot);
    });
  }

  function updateUserSelection(showStatus) {
    userSelectionDiv.innerHTML = '';

    correctIntervals.forEach((correctInterval, index) => {
      const selectedInterval = userIntervals[index];
      const slot = document.createElement('div');
      slot.className = 'interval-answer-slot';
      slot.textContent = selectedInterval ? selectedInterval.label : `第${index + 1}个`;

      if (selectedInterval) {
        slot.classList.add('filled');
      }
      if (showStatus) {
        slot.classList.add(
          selectedInterval?.value === correctInterval.value ? 'correct' : 'incorrect'
        );
      }

      userSelectionDiv.appendChild(slot);
    });
  }

  function updateIntervalOptions() {
    intervalOptionsDiv.innerHTML = '';

    INTERVAL_OPTIONS.filter((option) => option.direction === selectedIntervalDirection).forEach(
      (option) => {
        const optionButton = document.createElement('button');
        optionButton.type = 'button';
        optionButton.className = `interval-option ${option.direction}`;
        optionButton.textContent = option.name;
        optionButton.setAttribute('aria-label', option.label);
        optionButton.addEventListener('click', () => {
          if (userIntervals.length >= correctIntervals.length) return;
          userIntervals.push(option);
          updateUserSelection(false);
          showInlineResult(resultDisplay, '', 'info');
        });

        intervalOptionsDiv.appendChild(optionButton);
      }
    );
  }

  function updateIntervalDirectionTabs() {
    intervalDirectionTabs.forEach((tab) => {
      const isActive = tab.dataset.intervalDirection === selectedIntervalDirection;
      tab.classList.toggle('active', isActive);
      tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
  }

  function setIntervalDirection(direction) {
    if (direction === selectedIntervalDirection) return;
    selectedIntervalDirection = direction;
    updateIntervalDirectionTabs();
    updateIntervalOptions();
  }

  intervalDirectionTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      setIntervalDirection(tab.dataset.intervalDirection);
    });
  });

  updateIntervalDirectionTabs();

  function clearLastAnswer() {
    userIntervals.pop();
    updateUserSelection(false);
    showInlineResult(resultDisplay, '', 'info');
  }

  function checkAnswer() {
    if (userIntervals.length !== correctIntervals.length) {
      const remaining = correctIntervals.length - userIntervals.length;
      showInlineResult(resultDisplay, `还需要选择 ${remaining} 个音程`, 'warning');
      return;
    }

    let correctCount = 0;
    for (let i = 0; i < correctIntervals.length; i++) {
      if (userIntervals[i].value === correctIntervals[i].value) {
        correctCount++;
      }
    }

    const settings = loadUserSettings();
    const audioSettings = settings.audio || { answerDelay: 1000, autoPlayNext: true };
    const gameSettings = settings.game || { pointsPerCorrect: 10 };
    const pointsPerCorrect = gameSettings.pointsPerCorrect || 10;
    const newScore = correctIntervals.length * pointsPerCorrect;

    updateMelodyDisplay(true);
    updateUserSelection(true);

    if (correctCount === correctIntervals.length) {
      intervalScore += newScore;
      if (intervalScore > highScore) {
        highScore = intervalScore;
        localStorage.setItem('intervalTrainingHighScore', highScore);
        highScoreDisplay.textContent = highScore;
      }
      scoreDisplay.textContent = intervalScore;
      showInlineResult(resultDisplay, `全部正确，得分 +${newScore}`, 'success');

      if (audioSettings.autoPlayNext !== false) {
        setTimeout(() => {
          generateNewIntervalMelody();
          setTimeout(playCurrentMelody, 500);
        }, audioSettings.answerDelay || 1000);
      }
    } else {
      intervalScore = 0;
      scoreDisplay.textContent = intervalScore;
      showInlineResult(
        resultDisplay,
        `答对 ${correctCount}/${correctIntervals.length}，连击已重置`,
        'error'
      );
    }
  }

  melodyLengthSelect.addEventListener('change', generateNewIntervalMelody);
  intervalRangeSelect.addEventListener('change', generateNewIntervalMelody);
  playMelodyBtn.addEventListener('click', playCurrentMelody);
  newMelodyBtn.addEventListener('click', generateNewIntervalMelody);
  checkIntervalsBtn.addEventListener('click', checkAnswer);
  clearAnswerBtn.addEventListener('click', clearLastAnswer);

  generateNewIntervalMelody();
}

function createAutoMelodyPracticeUI() {
  const settings = loadUserSettings();
  const gameSettings = settings.game || { melodyLength: 4, startingDifficulty: 0 };
  const defaultMelodyLength = gameSettings.melodyLength || 4;
  const defaultDifficulty = gameSettings.startingDifficulty || 0;
  const defaultWaitSeconds = 5;

  return `
            <h3>旋律跟听</h3>
            <div class="training-toolbar auto-melody-toolbar">
                <div class="difficulty-selection">
                    <label for="auto-melody-length">长度</label>
                    <select id="auto-melody-length">
                        ${MELODY_LENGTH_OPTIONS.map(
                          (length) =>
                            `<option value="${length}" ${length === defaultMelodyLength ? 'selected' : ''}>${length}个音符</option>`
                        ).join('')}
                    </select>
                </div>
                <div class="difficulty-selection">
                    <label for="auto-melody-range">音域</label>
                    <select id="auto-melody-range">
                        ${renderRangeOptions(defaultDifficulty)}
                    </select>
                </div>
                <div class="difficulty-selection">
                    <label for="auto-answer-delay">等待</label>
                    <select id="auto-answer-delay">
                        ${AUTO_MELODY_WAIT_OPTIONS.map(
                          (seconds) =>
                            `<option value="${seconds}" ${seconds === defaultWaitSeconds ? 'selected' : ''}>${seconds}秒</option>`
                        ).join('')}
                    </select>
                </div>
            </div>
            <div class="compact-container auto-melody-layout">
                <div class="left-panel">
                    <div class="melody-play-section">
                        <div class="melody-actions">
                            <button id="auto-build-play" class="play-button" type="button">启动播放</button>
                        </div>
                        <audio id="auto-melody-audio" preload="none"></audio>
                    </div>
                    <div class="melody-answer-section">
                        <h4>当前答案</h4>
                        <div id="auto-playback-status" class="auto-playback-status">未生成</div>
                        <div id="auto-answer-display" class="auto-answer-display">
                            ${Array.from({ length: defaultMelodyLength }, () => '<span>?</span>').join('')}
                        </div>
                    </div>
                    <div id="auto-melody-result" class="training-result" aria-live="polite"></div>
                </div>
                <div class="right-panel">
                    <div class="notes-section">
                        <h4>练习列表</h4>
                        <div id="auto-round-list" class="auto-round-list"></div>
                    </div>
                </div>
            </div>
        `;
}

function initAutoMelodyPracticeListeners() {
  let session = null;
  let audioUrl = null;

  const lengthSelect = document.getElementById('auto-melody-length');
  const rangeSelect = document.getElementById('auto-melody-range');
  const delaySelect = document.getElementById('auto-answer-delay');
  const buildPlayBtn = document.getElementById('auto-build-play');
  const audioElement = document.getElementById('auto-melody-audio');
  const statusDisplay = document.getElementById('auto-playback-status');
  const answerDisplay = document.getElementById('auto-answer-display');
  const roundList = document.getElementById('auto-round-list');
  const resultDisplay = document.getElementById('auto-melody-result');

  function getOptions() {
    return {
      melodyLength: parseInt(lengthSelect.value),
      rangeIndex: parseInt(rangeSelect.value),
      answerDelay: parseInt(delaySelect.value),
    };
  }

  function renderAnswerLabels(labels, hidden = false) {
    answerDisplay.innerHTML = labels
      .map((label) => `<span>${hidden ? '?' : label}</span>`)
      .join('');
  }

  function renderRoundList() {
    if (!session) {
      roundList.innerHTML = '';
      return;
    }

    roundList.innerHTML = session.rounds
      .map(
        (round) => `
          <div class="auto-round-item" data-auto-round="${round.index}">
            <span class="auto-round-number">${round.index + 1}</span>
            <span class="auto-round-answer">${round.answerLabels.map(() => '?').join(' ')}</span>
          </div>
        `
      )
      .join('');
  }

  function updateRoundList(currentRound) {
    if (!session) return;

    roundList.querySelectorAll('.auto-round-item').forEach((item) => {
      const index = Number(item.dataset.autoRound);
      const round = session.rounds[index];
      const isActive = currentRound && currentRound.index === index;
      const isRevealed = audioElement.currentTime >= round.answerRevealTime;
      item.classList.toggle('active', isActive);
      item.classList.toggle('revealed', isRevealed);
      item.querySelector('.auto-round-answer').textContent = isRevealed
        ? round.answerLabels.join(' ')
        : round.answerLabels.map(() => '?').join(' ');
    });
  }

  function getCurrentRound() {
    if (!session) return null;
    const currentTime = audioElement.currentTime;
    return (
      session.rounds.find(
        (round) => currentTime >= round.melodyStart && currentTime < round.endTime
      ) || null
    );
  }

  function updatePlaybackState() {
    if (!session) return;

    const currentTime = audioElement.currentTime;
    const currentRound = getCurrentRound();
    if (!currentRound) {
      statusDisplay.textContent = audioElement.paused ? '准备播放' : '循环播放中';
      renderAnswerLabels(
        Array.from({ length: session.melodyLength }, () => '?'),
        false
      );
      updateRoundList(null);
      return;
    }

    const revealAnswer = currentTime >= currentRound.answerRevealTime;
    const phase = revealAnswer ? '答案' : currentTime < currentRound.melodyEnd ? '旋律' : '等待';
    statusDisplay.textContent = `循环第 ${currentRound.index + 1} 段 · ${phase}`;
    renderAnswerLabels(currentRound.answerLabels, !revealAnswer);
    updateRoundList(currentRound);
  }

  function updateMediaSession() {
    if (!session || !('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: '旋律跟听',
      artist: '琴键之旅',
      album: `循环播放 · ${RANGE_OPTIONS[session.rangeIndex]?.name || '自定义音域'}`,
    });

    [
      ['play', () => audioElement.play()],
      ['pause', () => audioElement.pause()],
      ['stop', stopPlayback],
    ].forEach(([action, handler]) => {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch (error) {
        debugWarn(`Media Session 不支持 ${action} 操作`, error);
      }
    });
  }

  function revokeAudioUrl() {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      audioUrl = null;
    }
  }

  function stopPlayback() {
    audioElement.pause();
    audioElement.currentTime = 0;
    audioElement.loop = false;
    audioElement.removeAttribute('src');
    audioElement.load();
    session = null;
    revokeAudioUrl();
    renderAnswerLabels(
      Array.from({ length: parseInt(lengthSelect.value) }, () => '?'),
      false
    );
    roundList.innerHTML = '';
    statusDisplay.textContent = '已停止';
    buildPlayBtn.textContent = '启动播放';
  }

  async function buildAndPlay() {
    try {
      stopPlayback();
      buildPlayBtn.disabled = true;
      buildPlayBtn.textContent = '生成中';
      showInlineResult(resultDisplay, '正在生成训练音频...', 'info');

      session = createAutoMelodySession(getOptions());
      renderRoundList();
      const blob = await createAutoMelodyAudioBlob(session);
      audioUrl = URL.createObjectURL(blob);
      audioElement.src = audioUrl;
      audioElement.loop = true;
      audioElement.currentTime = 0;
      updateMediaSession();
      await audioElement.play();
      buildPlayBtn.textContent = '停止播放';
      showInlineResult(resultDisplay, '已启动循环播放，唱名会同步对应音高', 'success');
      updatePlaybackState();
    } catch (error) {
      debugError('生成自动旋律训练音频失败', error);
      stopPlayback();
      showInlineResult(resultDisplay, '生成失败，请检查音频资源', 'error');
    } finally {
      buildPlayBtn.disabled = false;
      buildPlayBtn.textContent = session && audioElement.src ? '停止播放' : '启动播放';
    }
  }

  function handlePrimaryPlaybackAction() {
    if (session || audioElement.src) {
      stopPlayback();
      showInlineResult(resultDisplay, '已停止播放', 'info');
    } else {
      buildAndPlay();
    }
  }

  [lengthSelect, rangeSelect, delaySelect].forEach((select) => {
    select.addEventListener('change', () => {
      if (session || audioElement.src) stopPlayback();
      renderAnswerLabels(
        Array.from({ length: parseInt(lengthSelect.value) }, () => '?'),
        false
      );
      roundList.innerHTML = '';
      statusDisplay.textContent = '参数已更新';
      showInlineResult(resultDisplay, '', 'info');
    });
  });

  buildPlayBtn.addEventListener('click', handlePrimaryPlaybackAction);
  audioElement.addEventListener('timeupdate', updatePlaybackState);
  audioElement.addEventListener('play', updatePlaybackState);
  audioElement.addEventListener('pause', updatePlaybackState);
  audioElement.addEventListener('ended', () => {
    buildPlayBtn.textContent = '启动播放';
    updatePlaybackState();
  });
}

// 尝试预加载基本音符
function preloadBasicNotes() {
  if (!initAudioContext()) return;

  debugLog('开始预加载基本音符');
  // 基本的C大调音阶
  const basicNotes = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4'];

  // 创建加载进度追踪
  let loaded = 0;
  let total = basicNotes.length;

  // 显示加载进度
  function updateLoadingStatus() {
    debugLog(`音符加载进度: ${loaded}/${total}`);
  }

  // 为每个音符创建加载Promise
  const loadPromises = basicNotes.map((note) => {
    return loadPianoSound(note)
      .then((buffer) => {
        audioBufferCache[note] = buffer;
        loaded++;
        debugLog(`预加载音符成功: ${note}`);
        updateLoadingStatus();
        return { note, success: true };
      })
      .catch((err) => {
        debugWarn(`预加载音符失败: ${note}`, err);
        loaded++;
        updateLoadingStatus();
        return { note, success: false, error: err };
      });
  });

  // 返回所有加载Promise的组合
  return Promise.allSettled(loadPromises).then((results) => {
    // 统计成功和失败的数量
    const success = results.filter((r) => r.value && r.value.success).length;
    const failed = total - success;

    if (failed > 0) {
      debugWarn(`音符预加载完成: ${success}成功, ${failed}失败`);
    } else {
      debugLog(`所有音符(${total}个)预加载成功!`);
    }

    return {
      total,
      success,
      failed,
    };
  });
}

// 初始化音乐模块
function init() {
  debugLog('初始化音乐模块...');
  if (!initAudioContext()) {
    debugError('音频上下文初始化失败');
    return;
  }
  if (isFileProtocol() && !useSynthAudio) showProtocolWarning();
  if (isMobileDevice()) {
    document.body.classList.add('mobile-device');
    addTouchFeedback();
  }
  preloadBasicNotes();
  loadUserSettings();
  initMusicUI();
  initAudioSettings();
}

// DOM准备好后初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// 为UI元素添加触摸反馈
function addTouchFeedback() {
  // 针对所有可交互元素添加触摸反馈
  const interactiveElements = document.querySelectorAll(
    '.note-button, .scale-button, .play-button, .music-card, .selected-note, .delete-note, .interval-direction-tab, .interval-option, .interval-answer-slot, .secondary-action'
  );

  interactiveElements.forEach((el) => {
    // 使用passive: true提高滚动性能
    el.addEventListener(
      'touchstart',
      function () {
        this.classList.add('touch-active');
      },
      { passive: true }
    );

    // 触摸结束或取消时移除活跃状态
    el.addEventListener(
      'touchend',
      function () {
        this.classList.remove('touch-active');
      },
      { passive: true }
    );

    el.addEventListener(
      'touchcancel',
      function () {
        this.classList.remove('touch-active');
      },
      { passive: true }
    );
  });
}

// 优化后的初始化函数，包含移动端适配
function initMusicUI() {
  // 获取所有音乐卡片
  const musicCards = document.querySelectorAll('.music-card');
  const musicContainers = document.querySelectorAll('.music-container');

  // 为每个卡片添加点击事件
  musicCards.forEach((card) => {
    const clickHandler = function () {
      const id = this.id;

      // 移除所有卡片的active类
      musicCards.forEach((c) => {
        c.classList.remove('active');
        c.setAttribute('aria-selected', 'false');
      });

      // 隐藏所有音乐容器
      musicContainers.forEach((container) => {
        container.style.display = 'none';
      });

      // 添加当前卡片的active类
      this.classList.add('active');
      this.setAttribute('aria-selected', 'true');

      // 找到对应容器并显示
      const targetContainer = document.getElementById(`${id}-container`);
      if (targetContainer) {
        targetContainer.style.display = 'block';
        // 加载对应的音乐内容
        loadMusicContent(id);
        if (isMobileDevice()) {
          requestAnimationFrame(() => {
            targetContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
          });
        }
      }
    };

    card.addEventListener('click', clickHandler);
    card.setAttribute('aria-selected', card.classList.contains('active') ? 'true' : 'false');
  });

  // 默认选中第一个音乐卡片
  if (musicCards.length > 0 && musicCards[0].classList.contains('active')) {
    const firstCardId = musicCards[0].id;
    const firstContainer = document.getElementById(`${firstCardId}-container`);
    if (firstContainer) {
      firstContainer.style.display = 'block';
      loadMusicContent(firstCardId);
    }
  }
}

// 初始化音频设置
function initAudioSettings() {
  // 音频设置已迁移到设置页面，此处仅同步状态
  settingsManager.addEventListener('change', () => {
    const newVal = settingsManager.get('audio', 'useSynthAudio', false);
    if (useSynthAudio !== newVal) {
      useSynthAudio = newVal;
      Object.keys(audioBufferCache).forEach((key) => {
        delete audioBufferCache[key];
      });
      preloadBasicNotes();
    }
  });
}

// 返回公共接口

// 导出公共接口
export { loadMusicContent, playNote, playScale, stopAllSounds, preloadAllNotes, isMobileDevice };
