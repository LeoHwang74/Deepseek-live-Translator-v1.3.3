/**
 * Settings schema, defaults and small persistence helpers.
 *
 * All settings live in one chrome.storage.local record (key: dsl.settings.v1).
 * The API key never leaves the extension: content scripts only ever get it through
 * the service worker, and the worker is the only place that talks to DeepSeek.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DSL = Object.assign(root.DSL || {}, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SETTINGS_KEY = 'dsl.settings.v1';
  const STATS_KEY = 'dsl.stats.v1';
  const DEFAULT_BASE_URL = 'https://api.deepseek.com';

  // No API key ships with this build. Every user supplies their own key once in
  // the options page; it is stored only in chrome.storage.local on their machine.
  // Never commit a real key here — the repo is public and git history is forever.
  const MODELS = Object.freeze([
    { id: 'deepseek-chat', label: 'deepseek-chat', hint: '固定使用该模型进行实时翻译' }
  ]);
  const LIVE_MODES = Object.freeze([
    { id: 'fast', label: '极速', hint: '更频繁地翻译变化中的字幕（约 180ms 防抖）' },
    { id: 'balanced', label: '均衡', hint: '推荐：约 320ms 防抖，兼顾速度与费用' },
    { id: 'stable', label: '稳定', hint: '句子稳定后再翻译，最省 token' }
  ]);
  const TARGET_CODES = ['zh', 'en', 'de', 'ru', 'ko', 'ja', 'th'];
  const SOURCE_CODES = ['auto'].concat(TARGET_CODES);
  const MAX_SUBTITLE_CHARS = 2000;
  const MAX_SELECTION_CHARS = 6000;

  const DEFAULT_SETTINGS = Object.freeze({
    apiKey: '',
    baseUrl: DEFAULT_BASE_URL,
    model: 'deepseek-chat',
    targetLang: 'zh',
    sourceLang: 'auto',
    temperature: 1.3,
    maxTokens: 512,
    contextLines: 3,
    liveMode: 'fast',
    settleMs: 900,
    showOriginal: true,
    fontSize: 28,
    opacity: 0.84,
    offsetPercent: 12,
    enabled: true,
    selectionEnabled: true,
    showStatus: true
  });

  function clampNumber(value, fallback, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  function asBool(value, fallback) {
    return typeof value === 'boolean' ? value : fallback;
  }

  function normalizeBaseUrl(input) {
    let url = String(input == null ? '' : input).trim();
    if (!url) url = DEFAULT_BASE_URL;
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    url = url.replace(/\/+$/, '');
    if (/\/chat\/completions$/i.test(url)) return url.replace(/\/chat\/completions$/i, '');
    return url;
  }

  function endpointFor(baseUrl) {
    const base = normalizeBaseUrl(baseUrl);
    return /\/chat\/completions$/i.test(base) ? base : base + '/chat/completions';
  }

  function originPattern(baseUrl) {
    try {
      const url = new URL(normalizeBaseUrl(baseUrl));
      return url.protocol + '//' + url.host + '/*';
    } catch (_) {
      return '';
    }
  }

  function sanitizeSettings(raw) {
    const input = raw && typeof raw === 'object' ? raw : {};
    const out = Object.assign({}, DEFAULT_SETTINGS, input);
    out.apiKey =
      typeof input.apiKey === 'string' ? input.apiKey.trim() : DEFAULT_SETTINGS.apiKey;
    out.baseUrl = normalizeBaseUrl(input.baseUrl);
    out.model = 'deepseek-chat';
    out.targetLang = TARGET_CODES.indexOf(input.targetLang) !== -1 ? input.targetLang : DEFAULT_SETTINGS.targetLang;
    out.sourceLang = SOURCE_CODES.indexOf(input.sourceLang) !== -1 ? input.sourceLang : DEFAULT_SETTINGS.sourceLang;
    out.temperature = clampNumber(input.temperature, DEFAULT_SETTINGS.temperature, 0, 2);
    out.maxTokens = Math.round(clampNumber(input.maxTokens, DEFAULT_SETTINGS.maxTokens, 64, 4096));
    out.contextLines = Math.round(clampNumber(input.contextLines, DEFAULT_SETTINGS.contextLines, 0, 8));
    out.liveMode = LIVE_MODES.some((m) => m.id === input.liveMode) ? input.liveMode : DEFAULT_SETTINGS.liveMode;
    out.settleMs = Math.round(clampNumber(input.settleMs, DEFAULT_SETTINGS.settleMs, 250, 4000));
    out.fontSize = Math.round(clampNumber(input.fontSize, DEFAULT_SETTINGS.fontSize, 14, 64));
    out.opacity = clampNumber(input.opacity, DEFAULT_SETTINGS.opacity, 0.2, 1);
    out.offsetPercent = Math.round(clampNumber(input.offsetPercent, DEFAULT_SETTINGS.offsetPercent, 0, 55));
    out.enabled = asBool(input.enabled, DEFAULT_SETTINGS.enabled);
    out.showOriginal = asBool(input.showOriginal, DEFAULT_SETTINGS.showOriginal);
    out.selectionEnabled = asBool(input.selectionEnabled, DEFAULT_SETTINGS.selectionEnabled);
    out.showStatus = asBool(input.showStatus, DEFAULT_SETTINGS.showStatus);
    return out;
  }

  function mergeSettings(raw, patch) {
    return sanitizeSettings(Object.assign({}, raw && typeof raw === 'object' ? raw : {}, patch || {}));
  }

  /** The key actually used for requests: whatever the user stored, or nothing. */
  function effectiveApiKey(settings) {
    return settings && typeof settings.apiKey === 'string' ? settings.apiKey.trim() : '';
  }

  function hasApiKey(settings) {
    return !!effectiveApiKey(settings);
  }

  function debounceForMode(mode) {
    if (mode === 'fast') return 180;
    if (mode === 'stable') return 900;
    return 320;
  }

  function emptyStats() {
    return {
      requests: 0,
      promptTokens: 0,
      completionTokens: 0,
      cachedTokens: 0,
      errors: 0,
      cacheHits: 0,
      lastLatencyMs: 0,
      lastAt: 0
    };
  }

  function sanitizeStats(raw) {
    const base = emptyStats();
    if (!raw || typeof raw !== 'object') return base;
    for (const key of Object.keys(base)) {
      const n = Number(raw[key]);
      if (Number.isFinite(n) && n >= 0) base[key] = key === 'lastAt' ? Math.round(n) : Math.round(n);
    }
    return base;
  }

  function applyUsage(stats, usage, latencyMs) {
    const next = sanitizeStats(stats);
    next.requests += 1;
    if (usage) {
      next.promptTokens += Number(usage.prompt_tokens) || 0;
      next.completionTokens += Number(usage.completion_tokens) || 0;
      next.cachedTokens += Number(usage.prompt_cache_hit_tokens) || 0;
    }
    if (Number.isFinite(latencyMs)) next.lastLatencyMs = Math.round(latencyMs);
    next.lastAt = Date.now();
    return next;
  }

  function isYouTubeUrl(url) {
    try {
      const u = new URL(url);
      return /(^|\.)youtube\.com$/.test(u.hostname) || /(^|\.)youtu\.be$/.test(u.hostname);
    } catch (_) {
      return false;
    }
  }

  return {
    SETTINGS_KEY,
    STATS_KEY,
    DEFAULT_BASE_URL,
    DEFAULT_SETTINGS,
    MODELS,
    LIVE_MODES,
    TARGET_CODES,
    SOURCE_CODES,
    MAX_SUBTITLE_CHARS,
    MAX_SELECTION_CHARS,
    sanitizeSettings,
    mergeSettings,
    effectiveApiKey,
    hasApiKey,
    normalizeBaseUrl,
    endpointFor,
    originPattern,
    debounceForMode,
    emptyStats,
    sanitizeStats,
    applyUsage,
    isYouTubeUrl
  };
});
