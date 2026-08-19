// ==UserScript==
// @name         DAT Local Bridge POC
// @namespace    https://github.com/amuletmaiden/kt-bus
// @version      0.2.0
// @description  Direct ChatGPT -> localhost MCP bridge with bounded local file attachment.
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      127.0.0.1
// @connect      localhost
// @run-at       document-idle
// @downloadURL  https://amuletmaiden.github.io/ktbus-poc/chatgpt_dat_bridge.user.js
// @updateURL    https://amuletmaiden.github.io/ktbus-poc/chatgpt_dat_bridge.user.js
// ==/UserScript==

(() => {
  'use strict';

  const VERSION = '0.2.0';
  const REQUEST_RE = /DAT_POC_REQUEST\s+({[^\n]+})/g;
  const RESULT_PREFIX = 'DAT_POC_RESULT ';
  const KTBUSD_MCP = 'http://127.0.0.1:8765/mcp';
  const DAT_MCP = 'http://127.0.0.1:8767/mcp';
  const DAT_HEALTH = 'http://127.0.0.1:8767/healthz';
  const KEYS = {
    cap: 'dat-local-bridge-cap-v1',
    seen: 'dat-local-bridge-seen-v2',
    results: 'dat-local-bridge-results-v2',
  };
  const MAX_SEEN = 1000;
  const MAX_RESULTS = 100;
  const MAX_SCAN_MESSAGES = 20;
  const MAX_RESULT_CHARS = 120000;
  const MAX_FILE_BYTES = 64 * 1024 * 1024;
  const BINARY_CHUNK = 512 * 1024;
  const SEND_TIMEOUT_MS = 120000;
  let executing = false;
  let flushing = false;
  const inflight = new Set();

  function getValue(key, fallback) {
    try { return GM_getValue(key, fallback); } catch { return fallback; }
  }

  function setValue(key, value) {
    try { GM_setValue(key, value); } catch {}
  }

  function newCap() {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
  }

  function capability() {
    let cap = String(getValue(KEYS.cap, '') || '');
    if (!/^[a-f0-9]{64,128}$/i.test(cap)) {
      cap = newCap();
      setValue(KEYS.cap, cap);
    }
    return cap;
  }

  function validId(value) {
    return typeof value === 'string' && /^[A-Za-z0-9._-]{1,120}$/.test(value);
  }

  function loadSeen() {
    const raw = getValue(KEYS.seen, []);
    return new Set(Array.isArray(raw) ? raw.filter(validId).slice(-MAX_SEEN) : []);
  }

  const seen = loadSeen();

  function remember(id) {
    seen.add(id);
    setValue(KEYS.seen, [...seen].slice(-MAX_SEEN));
  }

  function loadResults() {
    const raw = getValue(KEYS.results, []);
    if (!Array.isArray(raw)) return [];
    return raw.filter(row => row && validId(row.id) && row.payload && typeof row.payload === 'object').slice(-MAX_RESULTS);
  }

  function saveResults(rows) {
    setValue(KEYS.results, rows.slice(-MAX_RESULTS));
  }

  function queueResult(id, payload) {
    const rows = loadResults().filter(row => row.id !== id);
    rows.push({id, payload, created_at: Date.now()});
    saveResults(rows);
  }

  function dropResult(id) {
    saveResults(loadResults().filter(row => row.id !== id));
  }

  function hasQueuedResult(id) {
    return loadResults().some(row => row.id === id);
  }

  function isVisible(element) {
    if (!(element instanceof Element)) return false;
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function generationInProgress() {
    return [...document.querySelectorAll('button')].some(button => {
      const label = button.getAttribute('aria-label') || '';
      return isVisible(button) && !button.disabled && (
        button.dataset.testid === 'stop-button' || /stop generating|stop response/i.test(label)
      );
    });
  }

  function assistantMessages() {
    return [...document.querySelectorAll('[data-message-author-role="assistant"]')].slice(-MAX_SCAN_MESSAGES);
  }

  function userMessages() {
    return [...document.querySelectorAll('[data-message-author-role="user"]')].slice(-60);
  }

  function resultDelivered(id) {
    const needle = `\"id\":\"${id}\"`;
    return userMessages().some(message => {
      const text = message.innerText || message.textContent || '';
      return text.includes(RESULT_PREFIX) && text.includes(needle);
    });
  }

  function composer() {
    return document.querySelector('#prompt-textarea') ||
      document.querySelector('[contenteditable="true"][data-virtualkeyboard="true"]') ||
      document.querySelector('textarea');
  }

  function composerText(node) {
    if (!node) return '';
    return node instanceof HTMLTextAreaElement ? (node.value || '') : (node.innerText || node.textContent || '');
  }

  function setComposerText(node, text) {
    node.focus();
    if (node instanceof HTMLTextAreaElement || node instanceof HTMLInputElement) {
      const proto = node instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (setter) setter.call(node, text); else node.value = text;
      node.dispatchEvent(new Event('input', {bubbles: true}));
      return;
    }
    if (!node.isContentEditable) throw new Error('ChatGPT composer is not editable');
    node.replaceChildren(document.createElement('p'));
    node.firstElementChild.textContent = text;
    node.dispatchEvent(new InputEvent('input', {bubbles: true, inputType: 'insertText', data: text}));
  }

  function sendButton() {
    const preferred = document.querySelector('button[data-testid="send-button"]');
    if (preferred && isVisible(preferred)) return preferred;
    return [...document.querySelectorAll('button')].find(button =>
      isVisible(button) && /send/i.test(button.getAttribute('aria-label') || '')
    ) || null;
  }

  async function sleep(ms) {
    await new Promise(resolve => setTimeout(resolve, ms));
  }

  async function submitResult(id, payload) {
    if (resultDelivered(id)) return;
    let text = RESULT_PREFIX + JSON.stringify(payload);
    if (text.length > MAX_RESULT_CHARS) {
      text = RESULT_PREFIX + JSON.stringify({
        id,
        status: 'error',
        error: `DAT result is ${text.length} characters; request a smaller result`,
      });
    }

    const box = composer();
    if (!box) throw new Error('ChatGPT composer not found');
    const existing = composerText(box).trim();
    if (!existing) {
      setComposerText(box, text);
    } else if (existing !== text) {
      throw new Error('ChatGPT composer contains unrelated user text');
    }

    const deadline = Date.now() + SEND_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (resultDelivered(id)) return;
      if (!generationInProgress()) {
        const button = sendButton();
        if (button && !button.disabled) {
          button.click();
          const confirmDeadline = Date.now() + 12000;
          while (Date.now() < confirmDeadline) {
            if (resultDelivered(id)) return;
            await sleep(100);
          }
          throw new Error('ChatGPT send click was not confirmed in conversation');
        }
      }
      await sleep(150);
    }
    throw new Error('ChatGPT result send timed out');
  }

  async function flushResults() {
    if (flushing || executing) return;
    const row = loadResults()[0];
    if (!row) return;
    flushing = true;
    try {
      if (resultDelivered(row.id)) {
        dropResult(row.id);
        return;
      }
      await submitResult(row.id, row.payload);
      dropResult(row.id);
    } catch (error) {
      console.warn('[DAT bridge] result remains queued', row.id, error);
    } finally {
      flushing = false;
    }
  }

  function gmRequest({method = 'GET', url, body, headers = {}, timeout = 120000}) {
    return new Promise((resolve, reject) => {
      const data = body === undefined ? undefined : JSON.stringify(body);
      const finalHeaders = {...headers, 'Cache-Control': 'no-cache'};
      if (data !== undefined) finalHeaders['Content-Type'] = 'application/json';
      GM_xmlhttpRequest({
        method,
        url,
        headers: finalHeaders,
        data,
        timeout,
        onload: response => {
          let parsed;
          try { parsed = JSON.parse(response.responseText); }
          catch { parsed = String(response.responseText || ''); }
          if (response.status < 200 || response.status >= 300) {
            reject(new Error(`${url} -> HTTP ${response.status}: ${typeof parsed === 'string' ? parsed.slice(0, 500) : JSON.stringify(parsed)}`));
            return;
          }
          resolve({status: response.status, body: parsed});
        },
        onerror: () => reject(new Error(`${url} -> network error`)),
        ontimeout: () => reject(new Error(`${url} -> timeout`)),
      });
    });
  }

  function requireCap(request) {
    if (String(request.cap || '') !== capability()) throw new Error('DAT relay capability required');
  }

  function endpoint(name) {
    if (name === 'ktbusd') return {url: KTBUSD_MCP, auth: false};
    if (name === 'dat') return {url: DAT_MCP, auth: true};
    throw new Error('endpoint must be "ktbusd" or "dat"');
  }

  function parseMcpBody(raw, endpointName) {
    if (raw && typeof raw === 'object') return raw;
    if (typeof raw !== 'string') throw new Error(`${endpointName} MCP returned unsupported response`);
    const trimmed = raw.trim();
    try { return JSON.parse(trimmed); } catch {}
    const dataLines = trimmed.split(/\r?\n/).filter(line => line.startsWith('data:'));
    for (let index = dataLines.length - 1; index >= 0; index -= 1) {
      const data = dataLines[index].slice(5).trim();
      try { return JSON.parse(data); } catch {}
    }
    throw new Error(`${endpointName} MCP returned unparseable JSON/SSE`);
  }

  async function mcpRequest(endpointName, method, params = {}, requestId = `mcp-${Date.now()}`) {
    const target = endpoint(endpointName);
    const headers = {'Accept': 'application/json, text/event-stream'};
    if (target.auth) headers['X-DAT-Cap'] = capability();
    const response = await gmRequest({
      method: 'POST',
      url: target.url,
      headers,
      body: {jsonrpc: '2.0', id: requestId, method, params},
    });
    const body = parseMcpBody(response.body, endpointName);
    if (body.error) throw new Error(`${endpointName} MCP: ${body.error.message || JSON.stringify(body.error)}`);
    return body.result;
  }

  async function mcpCall(endpointName, tool, args, requestId) {
    if (typeof tool !== 'string' || !tool) throw new Error('tool must be a non-empty string');
    if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('arguments must be an object');
    return mcpRequest(endpointName, 'tools/call', {name: tool, arguments: args}, requestId);
  }

  function structured(result) {
    if (result?.structuredContent && typeof result.structuredContent === 'object') return result.structuredContent;
    const text = result?.content?.find?.(item => item?.type === 'text')?.text;
    if (typeof text === 'string') {
      try { return JSON.parse(text); } catch {}
    }
    return result;
  }

  function base64Bytes(value) {
    const raw = atob(value);
    const bytes = new Uint8Array(raw.length);
    for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
    return bytes;
  }

  function hex(bytes) {
    return [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, '0')).join('');
  }

  async function readLocalFile(root, path) {
    const first = structured(await mcpCall('dat', 'files_read_binary', {
      root,
      path,
      offset: 0,
      max_bytes: BINARY_CHUNK,
      sha256: true,
    }, `read-0-${Date.now()}`));
    if (!first || typeof first.size !== 'number' || typeof first.data_base64 !== 'string') {
      throw new Error('files_read_binary returned malformed metadata');
    }
    if (first.size > MAX_FILE_BYTES) {
      throw new Error(`local file is ${first.size} bytes; POC limit is ${MAX_FILE_BYTES}`);
    }
    const chunks = [base64Bytes(first.data_base64)];
    let offset = Number(first.next_offset || chunks[0].length);
    let eof = first.eof === true;
    let index = 1;
    while (!eof) {
      const part = structured(await mcpCall('dat', 'files_read_binary', {
        root,
        path,
        offset,
        max_bytes: BINARY_CHUNK,
      }, `read-${index}-${Date.now()}`));
      if (!part || Number(part.offset) !== offset || typeof part.data_base64 !== 'string') {
        throw new Error(`malformed binary chunk at offset ${offset}`);
      }
      const bytes = base64Bytes(part.data_base64);
      if (bytes.length !== Number(part.bytes)) throw new Error(`binary chunk length mismatch at offset ${offset}`);
      chunks.push(bytes);
      offset = Number(part.next_offset);
      eof = part.eof === true;
      index += 1;
      if (offset > first.size || index > Math.ceil(first.size / BINARY_CHUNK) + 2) {
        throw new Error('binary chunk sequence exceeded expected file size');
      }
    }
    if (offset !== first.size) throw new Error(`binary reconstruction ended at ${offset}, expected ${first.size}`);
    const blob = new Blob(chunks, {type: first.mime || 'application/octet-stream'});
    if (blob.size !== first.size) throw new Error(`reconstructed Blob is ${blob.size}, expected ${first.size}`);
    const digest = hex(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()));
    if (first.sha256 && digest !== first.sha256) throw new Error(`SHA-256 mismatch: ${digest} != ${first.sha256}`);
    return {
      blob,
      name: first.name || String(path).split('/').pop() || 'upload.bin',
      mime: first.mime || 'application/octet-stream',
      size: first.size,
      sha256: digest,
      chunks: index,
    };
  }

  function chooseFileInput() {
    const inputs = [...document.querySelectorAll('input[type="file"]')].filter(input => !input.disabled);
    if (!inputs.length) return null;
    return inputs.find(input => input.multiple) || inputs[0];
  }

  async function waitForFileInput(timeoutMs = 5000) {
    let input = chooseFileInput();
    if (input) return input;
    const attachmentButton = [...document.querySelectorAll('button')].find(button => {
      const label = `${button.getAttribute('aria-label') || ''} ${button.getAttribute('title') || ''}`;
      return isVisible(button) && /attach|add files|upload|paperclip/i.test(label);
    });
    if (attachmentButton) {
      attachmentButton.click();
      await sleep(250);
      input = chooseFileInput();
      if (input) return input;
    }
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await sleep(100);
      input = chooseFileInput();
      if (input) return input;
    }
    throw new Error('ChatGPT file input not found');
  }

  function attachmentVisible(name) {
    const escaped = String(name);
    return [...document.querySelectorAll('[data-testid], [aria-label], button, div, span')].some(node => {
      const text = `${node.getAttribute?.('aria-label') || ''} ${node.textContent || ''}`;
      return text.includes(escaped);
    });
  }

  async function attachLocal(root, path, requestedName) {
    const local = await readLocalFile(root, path);
    const input = await waitForFileInput();
    const name = typeof requestedName === 'string' && requestedName.trim() ? requestedName.trim() : local.name;
    if (/[\\/\u0000]/.test(name)) throw new Error('attachment name may not contain path separators');
    const file = new File([local.blob], name, {type: local.mime, lastModified: Date.now()});
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event('input', {bubbles: true}));
    input.dispatchEvent(new Event('change', {bubbles: true}));

    const deadline = Date.now() + 10000;
    let accepted = false;
    while (Date.now() < deadline) {
      accepted = [...input.files].some(item => item.name === name && item.size === file.size) || attachmentVisible(name);
      if (accepted) break;
      await sleep(100);
    }
    if (!accepted) throw new Error('ChatGPT did not accept the attached file');
    return {
      attached: true,
      name,
      size: file.size,
      mime: file.type || local.mime,
      sha256: local.sha256,
      chunks: local.chunks,
      input_files: input.files.length,
    };
  }

  async function execute(request) {
    if (request.op === 'hello') {
      let ktbusd = null;
      let dat = null;
      try { ktbusd = await mcpRequest('ktbusd', 'tools/list', {}, `hello-k-${Date.now()}`); } catch (error) { ktbusd = {error: String(error?.message || error)}; }
      try { dat = await gmRequest({method: 'GET', url: DAT_HEALTH, timeout: 3000}); } catch (error) { dat = {error: String(error?.message || error)}; }
      return {
        id: request.id,
        op: 'hello',
        status: 'ok',
        version: VERSION,
        cap: capability(),
        localhost: {ktbusd: !ktbusd?.error, dat: dat?.body || dat},
      };
    }
    requireCap(request);
    if (request.op === 'mcp_call') {
      const result = await mcpCall(
        request.endpoint || 'ktbusd',
        request.tool,
        request.arguments || {},
        `chat-${request.id}`,
      );
      return {id: request.id, op: request.op, status: 'ok', version: VERSION, endpoint: request.endpoint || 'ktbusd', tool: request.tool, result: structured(result)};
    }
    if (request.op === 'attach_local') {
      if (typeof request.root !== 'string' || typeof request.path !== 'string' || !request.path) {
        throw new Error('attach_local requires root and path');
      }
      const attachment = await attachLocal(request.root, request.path, request.name);
      return {id: request.id, op: request.op, status: 'ok', version: VERSION, attachment};
    }
    throw new Error(`unsupported DAT op: ${request.op}`);
  }

  async function handle(request) {
    if (executing || !request || !validId(request.id) || seen.has(request.id) || hasQueuedResult(request.id) || inflight.has(request.id)) return;
    executing = true;
    inflight.add(request.id);
    let payload;
    try {
      try {
        payload = await execute(request);
      } catch (error) {
        payload = {id: request.id, op: request.op, status: 'error', version: VERSION, error: String(error?.message || error)};
      }
      // Persist the result before recording execution. Once seen is durable, the
      // operation is never re-executed merely because ChatGPT was busy.
      queueResult(request.id, payload);
      remember(request.id);
    } finally {
      inflight.delete(request.id);
      executing = false;
    }
    await flushResults();
  }

  function scan() {
    if (executing) return;
    for (const message of assistantMessages()) {
      const text = message.innerText || '';
      REQUEST_RE.lastIndex = 0;
      let match;
      while ((match = REQUEST_RE.exec(text))) {
        try {
          const request = JSON.parse(match[1]);
          if (validId(request?.id) && !seen.has(request.id) && !hasQueuedResult(request.id) && !inflight.has(request.id)) {
            void handle(request);
            return;
          }
        } catch {}
      }
    }
  }

  async function tick() {
    await flushResults();
    scan();
  }

  const observer = new MutationObserver(() => setTimeout(() => void tick(), 0));
  observer.observe(document.documentElement, {subtree: true, childList: true, characterData: true});
  setInterval(() => void tick(), 1000);
  capability();
  void tick();
  console.info(`[DAT bridge] v${VERSION} loaded`);
})();
