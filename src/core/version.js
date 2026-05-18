/**
 * 版本信息
 *
 * 由 vite.config.js 通过 define 注入。开发模式下值为 'dev'。
 */

/* global __APP_VERSION__, __APP_COMMIT__, __APP_BUILD_TIME__ */

export const VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';
export const COMMIT = typeof __APP_COMMIT__ !== 'undefined' ? __APP_COMMIT__ : 'unknown';
export const BUILD_TIME =
  typeof __APP_BUILD_TIME__ !== 'undefined' ? __APP_BUILD_TIME__ : new Date().toISOString();

export function printVersionBanner() {
  const style = 'color:#4CAF50;font-weight:bold';
  console.log(`%c[jasonaa-next] version=${VERSION} commit=${COMMIT} built=${BUILD_TIME}`, style);
}
