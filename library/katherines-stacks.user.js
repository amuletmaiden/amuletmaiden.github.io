// ==UserScript==
// @name         Katherine's Stacks
// @namespace    https://amuletmaiden.github.io/
// @version      0.1.0
// @description  A personal library shell with custom layout, themes, and keyboard navigation.
// @author       Katherine
// @match        https://annas-archive.gl/*
// @match        https://annas-archive.pk/*
// @match        https://annas-archive.gd/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(() => {
  'use strict';

  const KEY = 'katherines-stacks.settings.v1';
  const defaults = { theme: 'verdant', density: 'cozy', covers: true, wide: false };
  let settings = { ...defaults, ...loadSettings() };
  let selectedIndex = -1;

  function loadSettings() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}'); }
    catch { return {}; }
  }

  function saveSettings() {
    localStorage.setItem(KEY, JSON.stringify(settings));
  }

  function addStyle(css) {
    const style = document.createElement('style');
    style.id = 'ks-style';
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  }

  addStyle(`
    :root {
      --ks-bg:#09110d; --ks-panel:#101b15; --ks-panel2:#15251b; --ks-text:#edf8f0;
      --ks-muted:#9ab0a0; --ks-line:#294033; --ks-accent:#42e47d; --ks-accent2:#57b7ff;
      --ks-danger:#ff746c; --ks-shadow:0 16px 44px rgba(0,0,0,.25);
    }
    html[data-ks-theme="midnight"] { --ks-bg:#090b12; --ks-panel:#111522; --ks-panel2:#171e2e; --ks-text:#eff4ff; --ks-muted:#9da8bd; --ks-line:#2a344a; --ks-accent:#8ea7ff; --ks-accent2:#73e1d1; }
    html[data-ks-theme="paper"] { --ks-bg:#f4efe4; --ks-panel:#fffaf0; --ks-panel2:#eee5d5; --ks-text:#2b261e; --ks-muted:#776e60; --ks-line:#d3c7b4; --ks-accent:#286d45; --ks-accent2:#305f9c; --ks-shadow:0 12px 34px rgba(63,47,25,.12); }
    html[data-ks-theme="berry"] { --ks-bg:#140b13; --ks-panel:#21101d; --ks-panel2:#2b1526; --ks-text:#fff0fa; --ks-muted:#c3a2b6; --ks-line:#4b2940; --ks-accent:#ff72c6; --ks-accent2:#6fd5ff; }
    html.ks-active, html.ks-active body { background:var(--ks-bg)!important; color:var(--ks-text)!important; min-height:100%!important; }
    html.ks-active body { padding-top:82px!important; }
    html.ks-active a { color:var(--ks-accent2)!important; }
    html.ks-active input, html.ks-active select, html.ks-active textarea {
      background:var(--ks-panel)!important; color:var(--ks-text)!important; border:1px solid var(--ks-line)!important;
      border-radius:10px!important;
    }
    html.ks-active button, html.ks-active input[type="submit"] {
      background:var(--ks-accent)!important; color:#08110b!important; border:0!important; border-radius:10px!important; font-weight:750!important;
    }
    #ks-topbar { position:fixed; inset:0 0 auto 0; z-index:2147483646; height:70px; display:flex; align-items:center; gap:14px;
      padding:10px 18px; background:color-mix(in srgb,var(--ks-panel) 92%,transparent); border-bottom:1px solid var(--ks-line);
      backdrop-filter:blur(14px); box-shadow:var(--ks-shadow); font:14px/1.2 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif; }
    #ks-brand { font-size:19px; font-weight:850; letter-spacing:-.035em; white-space:nowrap; color:var(--ks-text); }
    #ks-brand span:first-child { color:var(--ks-accent); }
    #ks-brand span:last-child { color:var(--ks-accent2); }
    #ks-search { flex:1; display:flex; gap:8px; max-width:860px; margin-inline:auto; }
    #ks-search input { width:100%; min-width:80px; padding:11px 13px!important; outline:none; }
    #ks-search button, #ks-settings-button { padding:10px 14px!important; cursor:pointer; }
    #ks-settings-button { background:var(--ks-panel2)!important; color:var(--ks-text)!important; border:1px solid var(--ks-line)!important; }
    #ks-panel { position:fixed; z-index:2147483647; top:78px; right:16px; width:min(340px,calc(100vw - 32px)); padding:16px;
      border:1px solid var(--ks-line); background:var(--ks-panel); color:var(--ks-text); border-radius:14px; box-shadow:var(--ks-shadow); display:none;
      font:14px/1.4 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif; }
    #ks-panel.open { display:block; }
    #ks-panel h2 { margin:0 0 12px; font-size:16px; }
    .ks-row { display:grid; grid-template-columns:1fr 1.25fr; gap:12px; align-items:center; margin:10px 0; }
    .ks-row select { padding:8px!important; width:100%; }
    .ks-check { display:flex; align-items:center; gap:8px; }
    .ks-hint { color:var(--ks-muted); font-size:12px; margin-top:12px; }
    html.ks-wide body > *:not(#ks-topbar):not(#ks-panel) { max-width:1500px!important; }
    html.ks-hide-covers img[src*="cover" i], html.ks-hide-covers img[alt*="cover" i] { display:none!important; }
    .ks-result { border:1px solid var(--ks-line)!important; border-radius:14px!important; padding:12px!important; margin-block:10px!important; background:var(--ks-panel)!important; box-shadow:0 8px 24px rgba(0,0,0,.12)!important; }
    html[data-ks-density="compact"] .ks-result { padding:7px!important; margin-block:5px!important; }
    .ks-result.ks-selected { outline:2px solid var(--ks-accent)!important; outline-offset:2px!important; }
    .ks-source-brand { display:none!important; }
    @media (max-width:700px) {
      #ks-topbar { height:auto; min-height:70px; flex-wrap:wrap; gap:8px; }
      html.ks-active body { padding-top:120px!important; }
      #ks-brand { width:100%; }
      #ks-search { order:3; width:100%; }
    }
  `);

  function applySettings() {
    const root = document.documentElement;
    root.dataset.ksTheme = settings.theme;
    root.dataset.ksDensity = settings.density;
    root.classList.toggle('ks-hide-covers', !settings.covers);
    root.classList.toggle('ks-wide', !!settings.wide);
  }

  function qFromLocation() {
    try { return new URL(location.href).searchParams.get('q') || ''; }
    catch { return ''; }
  }

  function buildUI() {
    if (!document.body || document.querySelector('#ks-topbar')) return;
    document.documentElement.classList.add('ks-active');
    applySettings();

    const bar = document.createElement('div');
    bar.id = 'ks-topbar';
    bar.innerHTML = `
      <div id="ks-brand"><span>Katherine's</span> <span>Stacks</span></div>
      <form id="ks-search" action="/search" method="get">
        <input name="q" type="search" autocomplete="off" aria-label="Search the stacks" placeholder="Search titles, authors, ISBNs…">
        <button type="submit">Search</button>
      </form>
      <button id="ks-settings-button" type="button" aria-expanded="false">Settings</button>
    `;
    document.body.prepend(bar);

    const input = bar.querySelector('input[name="q"]');
    input.value = qFromLocation();

    const panel = document.createElement('aside');
    panel.id = 'ks-panel';
    panel.innerHTML = `
      <h2>Stack settings</h2>
      <label class="ks-row"><span>Theme</span><select id="ks-theme">
        <option value="verdant">Verdant</option><option value="midnight">Midnight</option><option value="paper">Paper</option><option value="berry">Berry</option>
      </select></label>
      <label class="ks-row"><span>Density</span><select id="ks-density">
        <option value="cozy">Cozy</option><option value="compact">Compact</option>
      </select></label>
      <label class="ks-check"><input id="ks-covers" type="checkbox"> Show covers</label>
      <label class="ks-check"><input id="ks-wide" type="checkbox"> Wide shelves</label>
      <div class="ks-hint">Keyboard: <b>/</b> search · <b>j/k</b> move · <b>Enter</b> open · <b>Esc</b> close settings</div>
    `;
    document.body.append(panel);

    const btn = bar.querySelector('#ks-settings-button');
    btn.addEventListener('click', () => {
      panel.classList.toggle('open');
      btn.setAttribute('aria-expanded', panel.classList.contains('open') ? 'true' : 'false');
    });

    const theme = panel.querySelector('#ks-theme');
    const density = panel.querySelector('#ks-density');
    const covers = panel.querySelector('#ks-covers');
    const wide = panel.querySelector('#ks-wide');
    theme.value = settings.theme;
    density.value = settings.density;
    covers.checked = settings.covers;
    wide.checked = settings.wide;

    theme.addEventListener('change', () => updateSetting('theme', theme.value));
    density.addEventListener('change', () => updateSetting('density', density.value));
    covers.addEventListener('change', () => updateSetting('covers', covers.checked));
    wide.addEventListener('change', () => updateSetting('wide', wide.checked));
  }

  function updateSetting(key, value) {
    settings[key] = value;
    saveSettings();
    applySettings();
  }

  function replaceBranding(root = document.body) {
    if (!root) return;
    document.title = document.title
      .replace(/Anna[’']s Archive/gi, "Katherine's Stacks")
      .replace(/Anna’s Archive/gi, "Katherine's Stacks");

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      const p = node.parentElement;
      if (!p || p.closest('#ks-topbar,#ks-panel,script,style,noscript')) continue;
      let t = node.nodeValue;
      if (!t) continue;
      t = t.replace(/Anna[’']s Archive/gi, "Katherine's Stacks");
      t = t.replace(/annas-archive\.(?:gl|pk|gd)/gi, 'Stacks mirror');
      if (t !== node.nodeValue) node.nodeValue = t;
    }
  }

  function resultAnchors() {
    return [...document.querySelectorAll('a[href]')].filter(a => {
      const href = a.getAttribute('href') || '';
      return /\/md5\/[0-9a-f]{32}/i.test(href) || /\/edition\//i.test(href);
    });
  }

  function decorateResults() {
    for (const a of resultAnchors()) {
      if (a.closest('#ks-topbar,#ks-panel')) continue;
      let box = a.parentElement;
      for (let i = 0; i < 5 && box && box.parentElement; i++) {
        const len = (box.innerText || '').trim().length;
        if (len >= 70 && len <= 3000) break;
        box = box.parentElement;
      }
      if (box && !box.classList.contains('ks-result')) box.classList.add('ks-result');
    }
  }

  function cards() {
    return [...document.querySelectorAll('.ks-result')].filter(el => el.offsetParent !== null);
  }

  function moveSelection(delta) {
    const list = cards();
    if (!list.length) return;
    list.forEach(el => el.classList.remove('ks-selected'));
    selectedIndex = selectedIndex < 0 ? (delta > 0 ? 0 : list.length - 1) : (selectedIndex + delta + list.length) % list.length;
    const el = list[selectedIndex];
    el.classList.add('ks-selected');
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function openSelection() {
    const list = cards();
    const el = list[selectedIndex];
    if (!el) return;
    const a = el.querySelector('a[href*="/md5/"],a[href*="/edition/"]') || el.querySelector('a[href]');
    if (a) a.click();
  }

  function bindKeys() {
    addEventListener('keydown', e => {
      const tag = (e.target && e.target.tagName || '').toLowerCase();
      const typing = ['input','textarea','select'].includes(tag) || e.target?.isContentEditable;
      if (e.key === 'Escape') {
        document.querySelector('#ks-panel')?.classList.remove('open');
        document.querySelector('#ks-settings-button')?.setAttribute('aria-expanded','false');
        return;
      }
      if (typing) return;
      if (e.key === '/') {
        e.preventDefault();
        document.querySelector('#ks-search input')?.focus();
      } else if (e.key === 'j') {
        e.preventDefault(); moveSelection(1);
      } else if (e.key === 'k') {
        e.preventDefault(); moveSelection(-1);
      } else if (e.key === 'Enter' && selectedIndex >= 0) {
        e.preventDefault(); openSelection();
      }
    });
  }

  function refresh() {
    buildUI();
    replaceBranding();
    decorateResults();
  }

  function start() {
    applySettings();
    refresh();
    bindKeys();
    let scheduled = false;
    new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => { scheduled = false; refresh(); });
    }).observe(document.documentElement, { subtree:true, childList:true, characterData:false });
  }

  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', start, { once:true });
  else start();
})();
