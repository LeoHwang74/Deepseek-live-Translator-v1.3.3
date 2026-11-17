(function () {
  'use strict';

  const D = window.DSL;
  const { SETTINGS_KEY, STATS_KEY, LIVE_MODES, sanitizeSettings, sanitizeStats, emptyStats } = D;
  const $ = (id) => document.getElementById(id);
  const numberFmt = new Intl.NumberFormat('zh-CN');

  let current = sanitizeSettings({});
  let dirty = false;
  let toastTimer = 0;

  function init() {
    fillSelects();
    bindEvents();
    loadAll();
    window.addEventListener('beforeunload', (event) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = '';
    });
  }

  function fillSelects() {
    const live = $('liveMode');
    for (const item of LIVE_MODES) {
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = item.label;
      live.appendChild(option);
    }
  }

  async function loadAll() {
    try {
      const data = await chrome.storage.local.get([SETTINGS_KEY, STATS_KEY]);
      current = sanitizeSettings(data[SETTINGS_KEY]);
      writeForm(current);
      renderStats(data[STATS_KEY]);
      setDirty(false);
      if (!current.apiKey) {
        $('apiKey').focus();
        toast('首次使用：请填入你的 DeepSeek API Key 并保存', 'warn');
      }
    } catch (_) {
      writeForm(current);
      renderStats(emptyStats());
    }
  }

  function writeForm(settings) {
    $('apiKey').value = settings.apiKey;
    $('baseUrl').value = settings.baseUrl;
    $('liveMode').value = settings.liveMode;
    $('contextLines').value = String(settings.contextLines);
    $('temperature').value = String(settings.temperature);
    $('maxTokens').value = String(settings.maxTokens);
    $('fontSize').value = String(settings.fontSize);
    $('offsetPercent').value = String(settings.offsetPercent);
    $('opacity').value = String(Math.round(settings.opacity * 100));
    $('showOriginal').checked = settings.showOriginal;
    $('showStatus').checked = settings.showStatus;
    $('fontSizeOut').textContent = settings.fontSize + 'px';
    $('offsetOut').textContent = settings.offsetPercent + '%';
    $('opacityOut').textContent = Math.round(settings.opacity * 100) + '%';
    updateEndpointPreview();
    updateLiveModeHint();
    updateKeyState(settings.apiKey);
  }

  function collect() {
    return sanitizeSettings({
      apiKey: $('apiKey').value,
      baseUrl: $('baseUrl').value,
      model: 'deepseek-chat',
      targetLang: 'zh',
      sourceLang: 'auto',
      liveMode: $('liveMode').value,
      contextLines: $('contextLines').value,
      temperature: $('temperature').value,
      maxTokens: $('maxTokens').value,
      fontSize: $('fontSize').value,
      offsetPercent: $('offsetPercent').value,
      opacity: Number($('opacity').value) / 100,
      showOriginal: $('showOriginal').checked,
      showStatus: $('showStatus').checked,
      selectionEnabled: current.selectionEnabled
    });
  }

  function setDirty(value) {
    dirty = !!value;
    $('saveBtn').textContent = dirty ? '保存设置 •' : '保存设置';
  }

  function asrEndpoint(baseUrl) {
    const base = D.normalizeBaseUrl(baseUrl);
    if (/\/tools\/asr$/i.test(base)) return base;
    if (/\/v1$/i.test(base)) return base + '/tools/asr';
    return base + '/v1/tools/asr';
  }

  function updateEndpointPreview() {
    try {
      $('endpointPreview').textContent = D.endpointFor($('baseUrl').value);
      $('asrPreview').textContent = asrEndpoint($('baseUrl').value);
    } catch (_) {
      $('endpointPreview').textContent = '—';
      $('asrPreview').textContent = '—';
    }
  }

  function updateLiveModeHint() {
    const mode = LIVE_MODES.find((m) => m.id === $('liveMode').value);
    $('liveModeHint').textContent = mode ? '当前模式：' + mode.hint : '';
  }

  function updateKeyState(apiKey) {
    const has = !!(apiKey || '').trim();
    const pill = $('keyState');
    pill.textContent = has ? 'API Key 已填写' : '缺少 API Key';
    pill.className = 'pill ' + (has ? 'ok' : 'warn');
  }

  function ensureOrigin(baseUrl) {
    return new Promise((resolve) => {
      const pattern = D.originPattern(baseUrl);
      if (!pattern || pattern === 'https://api.deepseek.com/*') {
        resolve(true);
        return;
      }
      try {
        chrome.permissions.request({ origins: [pattern] }, (granted) => resolve(!!granted));
      } catch (_) {
        resolve(false);
      }
    });
  }

  function sendRuntime(message) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, error: { message: '扩展后台未响应，请重新加载扩展后重试。' } });
            return;
          }
          resolve(response || { ok: false, error: { message: '没有收到响应。' } });
        });
      } catch (_) {
        resolve({ ok: false, error: { message: '扩展上下文已失效，请重新打开设置页。' } });
      }
    });
  }

  async function onSave(event) {
    if (event) event.preventDefault();
    const next = collect();
    const permissionPromise = ensureOrigin(next.baseUrl);
    const granted = await permissionPromise;
    if (!granted) {
      toast('未获得该域名的访问权限，自定义 Base URL 将无法使用。', 'error');
      return;
    }
    try {
      await chrome.storage.local.set({ [SETTINGS_KEY]: next });
      current = next;
      setDirty(false);
      updateKeyState(next.apiKey);
      toast('设置已保存', 'ok');
    } catch (err) {
      toast('保存失败：' + (err && err.message ? err.message : '未知错误'), 'error');
    }
  }

  async function onTest() {
    const next = collect();
    if (!next.apiKey) {
      toast('请先填写 DeepSeek API Key', 'warn');
      $('apiKey').focus();
      return;
    }
    const permissionPromise = ensureOrigin(next.baseUrl);
    const button = $('testBtn');
    button.disabled = true;
    button.textContent = '连接中…';
    renderTest('loading', '正在调用 DeepSeek API…');
    try {
      const granted = await permissionPromise;
      if (!granted) {
        renderTest('error', '未获得 ' + D.originPattern(next.baseUrl) + ' 的访问权限。');
        return;
      }
      const response = await sendRuntime({ type: 'dsl:test-connection', overrides: next });
      if (!response || !response.ok) {
        const info = response && response.error ? response.error : {};
        renderTest('error', (info.message || '连接失败') + (info.code ? `（${info.code}）` : ''));
        return;
      }
      renderTest(
        'ok',
        `连接成功 · ${response.latencyMs} ms · ${response.model}`,
        response.text,
        response.usage
      );
    } finally {
      button.disabled = false;
      button.textContent = '测试连接';
    }
  }

  function renderTest(kind, message, text, usage) {
    const box = $('testResult');
    box.hidden = false;
    box.className = 'test-result ' + (kind === 'ok' ? 'ok' : kind === 'error' ? 'error' : '');
    box.textContent = '';
    const head = document.createElement('div');
    head.textContent = message;
    box.appendChild(head);
    if (text) {
      const line = document.createElement('div');
      line.className = 'result-line';
      line.textContent = '示例译文：' + text;
      box.appendChild(line);
    }
    if (usage) {
      const meta = document.createElement('div');
      meta.className = 'result-meta';
      meta.textContent = `tokens：输入 ${usage.prompt_tokens || 0} · 输出 ${usage.completion_tokens || 0}`;
      box.appendChild(meta);
    }
  }

  function renderStats(raw) {
    const stats = sanitizeStats(raw);
    const container = $('stats');
    container.textContent = '';
    const cards = [
      ['请求次数', numberFmt.format(stats.requests)],
      ['输入 tokens', numberFmt.format(stats.promptTokens)],
      ['输出 tokens', numberFmt.format(stats.completionTokens)],
      ['缓存命中', numberFmt.format(stats.cacheHits)]
    ];
    for (const [label, value] of cards) {
      const cell = document.createElement('div');
      cell.className = 'stat';
      const b = document.createElement('b');
      b.textContent = value;
      const span = document.createElement('span');
      span.textContent = label;
      cell.append(b, span);
      container.appendChild(cell);
    }
    const meta = document.createElement('div');
    meta.style.cssText = 'grid-column:1/-1;color:#91a79c;font-size:11.5px;margin-top:2px;';
    meta.textContent =
      '最近一次：' +
      (stats.lastLatencyMs ? stats.lastLatencyMs + ' ms' : '—') +
      ' · ' +
      (stats.lastAt ? new Date(stats.lastAt).toLocaleString('zh-CN', { hour12: false }) : '—') +
      (stats.errors ? ` · 失败 ${stats.errors} 次` : '');
    container.appendChild(meta);
  }

  async function onResetStats() {
    const response = await sendRuntime({ type: 'dsl:reset-stats' });
    if (response && response.ok) {
      renderStats(emptyStats());
      toast('统计已重置', 'ok');
    }
  }

  async function onClearCache() {
    const response = await sendRuntime({ type: 'dsl:clear-cache' });
    toast(response && response.ok ? '翻译缓存已清空' : '清空失败', response && response.ok ? 'ok' : 'error');
  }

  async function onResetAll() {
    if (!window.confirm('恢复默认设置？API Key 会保留。')) return;
    const next = sanitizeSettings({ apiKey: current.apiKey });
    await chrome.storage.local.set({ [SETTINGS_KEY]: next });
    current = next;
    writeForm(next);
    setDirty(false);
    toast('已恢复默认设置', 'ok');
  }

  function toast(message, kind) {
    const el = $('toast');
    el.textContent = message;
    el.className = 'toast ' + (kind || '');
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.hidden = true;
    }, 3200);
  }

  function bindEvents() {
    $('form').addEventListener('submit', onSave);
    $('form').addEventListener('input', (event) => {
      if (event.target && ['apiKey', 'baseUrl'].indexOf(event.target.id) !== -1) {
        updateKeyState($('apiKey').value);
      }
      if (event.target && event.target.id === 'baseUrl') updateEndpointPreview();
      setDirty(true);
    });
    $('form').addEventListener('change', (event) => {
      if (event.target && event.target.id === 'liveMode') updateLiveModeHint();
      setDirty(true);
    });
    $('toggleKey').addEventListener('click', () => {
      const input = $('apiKey');
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      $('toggleKey').textContent = show ? '隐藏' : '显示';
    });
    $('testBtn').addEventListener('click', onTest);
    $('resetStats').addEventListener('click', onResetStats);
    $('clearCache').addEventListener('click', onClearCache);
    $('resetAll').addEventListener('click', onResetAll);
    $('fontSize').addEventListener('input', () => {
      $('fontSizeOut').textContent = $('fontSize').value + 'px';
    });
    $('offsetPercent').addEventListener('input', () => {
      $('offsetOut').textContent = $('offsetPercent').value + '%';
    });
    $('opacity').addEventListener('input', () => {
      $('opacityOut').textContent = $('opacity').value + '%';
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes[SETTINGS_KEY] || dirty) return;
      current = sanitizeSettings(changes[SETTINGS_KEY].newValue);
      writeForm(current);
    });
  }

  init();
})();
