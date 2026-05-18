/**
 * 统一 localStorage 封装
 *
 * 集中管理所有存储键名常量、提供类型化读写接口、首次访问时自动迁移旧键。
 */

export const StorageKeys = Object.freeze({
  appSettings: 'app:settings',
  appTheme: 'app:theme',
  aiConfig: 'ai:config',
  aichatSessions: 'aichat:sessions',
  aichatCurrentSession: 'aichat:currentSession',
  chattavernCharacters: 'chattavern:characters',
  chattavernMemory: (characterId) => `chattavern:memory:${characterId}`,
  mdreaderCurrent: 'mdreader:current',
  mdreaderFontSize: 'mdreader:fontSize',
  forumAuth: 'forum:auth',
  forumRepo: 'forum:repo',
  forumMode: 'forum:mode',
  forumProfile: (username) => `forum:profile:${username}`,
  musicHighScore: 'music:highScore',
  musicSynthIgnoreWarning: 'music:synthIgnoreWarning',
  gameHighScore: (name) => `game:${name}:highScore`,
  langProgress: (lang, book) => `lang:${lang}:${book}:progress`,
});

function readRaw(key) {
  try {
    return localStorage.getItem(key);
  } catch (err) {
    console.warn('[storage] 读取失败:', key, err);
    return null;
  }
}

function writeRaw(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err) {
    console.warn('[storage] 写入失败:', key, err);
    return false;
  }
}

function removeRaw(key) {
  try {
    localStorage.removeItem(key);
  } catch (err) {
    console.warn('[storage] 删除失败:', key, err);
  }
}

export const storage = {
  getString(key, fallback = null) {
    const v = readRaw(key);
    return v === null ? fallback : v;
  },
  setString(key, value) {
    return writeRaw(key, String(value));
  },
  getJSON(key, fallback = null) {
    const raw = readRaw(key);
    if (raw === null) return fallback;
    try {
      return JSON.parse(raw);
    } catch (err) {
      console.warn('[storage] JSON 解析失败:', key, err);
      return fallback;
    }
  },
  setJSON(key, value) {
    try {
      return writeRaw(key, JSON.stringify(value));
    } catch (err) {
      console.warn('[storage] JSON 序列化失败:', key, err);
      return false;
    }
  },
  has(key) {
    return readRaw(key) !== null;
  },
  remove(key) {
    removeRaw(key);
  },
};

const MIGRATIONS = [
  { from: 'userSettings', to: StorageKeys.appSettings, type: 'json' },
  { from: 'appSettings', to: StorageKeys.appSettings, type: 'json' },
  { from: 'theme', to: StorageKeys.appTheme, type: 'string' },
  { from: 'aichat_config', to: StorageKeys.aiConfig, type: 'json' },
  { from: 'chattavern_ai_config', to: StorageKeys.aiConfig, type: 'json' },
  { from: 'ai_config', to: StorageKeys.aiConfig, type: 'json' },
  { from: 'aichat_sessions', to: StorageKeys.aichatSessions, type: 'json' },
  { from: 'aichat_current_session', to: StorageKeys.aichatCurrentSession, type: 'string' },
  { from: 'chattavern_characters', to: StorageKeys.chattavernCharacters, type: 'json' },
  { from: 'mdreader_current', to: StorageKeys.mdreaderCurrent, type: 'json' },
  { from: 'mdreader_font_size', to: StorageKeys.mdreaderFontSize, type: 'string' },
  { from: 'forumAuthData', to: StorageKeys.forumAuth, type: 'json' },
  { from: 'forum_mode', to: StorageKeys.forumMode, type: 'string' },
  { from: 'melodyHighScore', to: StorageKeys.musicHighScore, type: 'string' },
  { from: 'ignoreSynthWarning', to: StorageKeys.musicSynthIgnoreWarning, type: 'string' },
];

const LEGACY_DROPS = ['musicAppConfig', 'useSynthAudio'];

const MIGRATION_FLAG = 'app:migrationsApplied:v1';

export function runMigrations() {
  if (readRaw(MIGRATION_FLAG) === '1') return;

  for (const { from, to } of MIGRATIONS) {
    const raw = readRaw(from);
    if (raw === null) continue;
    if (readRaw(to) === null) writeRaw(to, raw);
    removeRaw(from);
  }

  const owner = readRaw('forum_repo_owner');
  const name = readRaw('forum_repo_name');
  if ((owner || name) && readRaw(StorageKeys.forumRepo) === null) {
    writeRaw(StorageKeys.forumRepo, JSON.stringify({ owner, name }));
  }
  if (owner !== null) removeRaw('forum_repo_owner');
  if (name !== null) removeRaw('forum_repo_name');

  for (const k of LEGACY_DROPS) removeRaw(k);

  migrateForumProfiles();
  migrateChattavernMemories();

  writeRaw(MIGRATION_FLAG, '1');
}

function migrateForumProfiles() {
  const legacyPrefix = 'forum_profile_';
  const targets = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(legacyPrefix)) targets.push(k);
  }
  for (const oldKey of targets) {
    const username = oldKey.slice(legacyPrefix.length);
    const newKey = StorageKeys.forumProfile(username);
    if (readRaw(newKey) === null) {
      const raw = readRaw(oldKey);
      if (raw !== null) writeRaw(newKey, raw);
    }
    removeRaw(oldKey);
  }
}

function migrateChattavernMemories() {
  const legacyPrefix = 'chattavern_memory_';
  const targets = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(legacyPrefix)) targets.push(k);
  }
  for (const oldKey of targets) {
    const id = oldKey.slice(legacyPrefix.length);
    const newKey = StorageKeys.chattavernMemory(id);
    if (readRaw(newKey) === null) {
      const raw = readRaw(oldKey);
      if (raw !== null) writeRaw(newKey, raw);
    }
    removeRaw(oldKey);
  }
}
