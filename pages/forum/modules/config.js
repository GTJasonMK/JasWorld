/**
 * Forum 配置模块
 * 集中管理仓库标识、管理员名单、分页与速率限制阈值。
 */

import { storage, StorageKeys } from '@core/storage.js';

export const GITHUB_API_URL = 'https://api.github.com';

const DEFAULT_OWNER = '13108387302';
const DEFAULT_REPO = 'jasonaa';

export function getRepoConfig() {
  const urlParams = new URLSearchParams(window.location.search);
  const stored = storage.getJSON(StorageKeys.forumRepo, null) || {};
  const owner = stored.owner || urlParams.get('owner') || DEFAULT_OWNER;
  const name = stored.name || urlParams.get('repo') || DEFAULT_REPO;

  if (urlParams.get('owner') || urlParams.get('repo')) {
    storage.setJSON(StorageKeys.forumRepo, {
      owner: urlParams.get('owner') || stored.owner || DEFAULT_OWNER,
      name: urlParams.get('repo') || stored.name || DEFAULT_REPO,
    });
  }

  return { owner, name };
}

export const CONFIG_ISSUE_LABEL = 'forum-config';
export const CONFIG_ISSUE_TITLE = 'Forum Configuration';
export const PER_PAGE = 10;
export const MIN_RATE_LIMIT = 20;

export function initAdminUsers(repoOwner) {
  return [repoOwner];
}

export const config = {
  GITHUB_API_URL,
  CONFIG_ISSUE_LABEL,
  CONFIG_ISSUE_TITLE,
  PER_PAGE,
  MIN_RATE_LIMIT,
};
