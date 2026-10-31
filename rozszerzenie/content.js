// Live MIC × eufy — działa tylko w portalu eufy osadzonym w Live MIC.
// Na polecenie Live MIC: skanuje nazwy kamer, klika kamerę po nazwie, uruchamia podgląd,
// powiększa obraz na całą ramkę (kiosk) i ustawia głośność.
(() => {
  if (window.top === window) return;
  const ALLOWED = ['https://antos-python.github.io', 'http://localhost:8765', 'http://127.0.0.1:8765'];
  let origin = null, want = '', kiosk = true, audio = { muted: false, volume: 0.8 };
  let tries = 0, timer = 0, lastState = '', kStyle = null, queued = false;

  const send = (d) => origin && parent.postMessage({ lm: 'evt', ...d }, origin);
  const status = (msg, state, level) => send({ op: 'status', msg, state, level });
  const norm = (s) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  };
  const isLogin = () => /login/i.test(location.pathname) || !!document.querySelector('input[type=password]');

  function leaves() {
    return [...document.querySelectorAll('body *')].filter((el) =>
      !el.children.length && !['SCRIPT', 'STYLE', 'OPTION'].includes(el.tagName)
      && el.textContent && el.textContent.trim().length <= 40 && visible(el));
  }
  const SKIP = /^(live|na żywo|history|historia|devices?|urządzenia|cameras?|kamery|settings|ustawienia|account|konto|log ?out|wyloguj|all|wszystkie|online|offline|home|away|disarmed|\d+%?|[-–|•·:]+)$/i;
  function scan() {
    const names = new Set();
    for (const el of leaves()) {
      const t = el.textContent.trim();
      if (t.length < 2 || SKIP.test(t)) continue;
      if (el.closest('[class*="device" i],[class*="camera" i],[class*="cam-" i],[class*="station" i],[class*="item" i],[class*="card" i],li')) names.add(t);
    }
    return [...names].slice(0, 40);
  }
  function fire(el) {
    const t = el.closest('a,button,[role=button],[role=tab],[role=option],li,[class*="item" i],[class*="card" i],[class*="device" i]') || el;
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
      t.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
    }
    return t;
  }
  function findName(name) {
    const n = norm(name), all = leaves();
    return all.find((el) => norm(el.textContent) === n) || all.find((el) => norm(el.textContent).includes(n));
  }
  const bigMedia = () => [...document.querySelectorAll('video,canvas')].filter(visible)
    .sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0];
  const playing = (m) => m && (m.tagName === 'CANVAS' ? m.clientWidth > 200 : m.readyState >= 2 && !m.paused);
  function clickPlay() {
    const btn = [...document.querySelectorAll('[class*="play" i],[aria-label*="play" i],[title*="play" i],[class*="start" i]')].find(visible);
    if (btn) fire(btn);
  }

  function applyKiosk() {
    if (!kStyle) {
      kStyle = document.createElement('style');
      kStyle.textContent = `[data-lm-kiosk]{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;
        max-width:none!important;max-height:none!important;z-index:2147483647!important;object-fit:contain!important;
        background:#000!important;margin:0!important;transform:none!important}
        html.lm-k,html.lm-k body{overflow:hidden!important;background:#000!important}`;
      document.documentElement.appendChild(kStyle);
    }
    const m = kiosk ? bigMedia() : null;
    document.querySelectorAll('[data-lm-kiosk]').forEach((el) => el !== m && el.removeAttribute('data-lm-kiosk'));
    document.documentElement.classList.toggle('lm-k', !!m);
    if (m && !m.hasAttribute('data-lm-kiosk')) m.setAttribute('data-lm-kiosk', '');
  }
  function applyAudio() {
    document.querySelectorAll('video').forEach((v) => { v.muted = audio.muted; v.volume = Math.max(0, Math.min(1, audio.volume)); });
  }

  function step() {
    clearTimeout(timer);
    if (isLogin()) { status('portal wymaga logowania', 'ZALOGUJ', 'warn'); timer = setTimeout(step, 3000); return; }
    const m = bigMedia();
    if (playing(m)) {
      applyKiosk(); applyAudio();
      if (lastState !== 'LIVE') { lastState = 'LIVE'; status(`obraz na żywo${want ? ' · ' + want : ''}`, 'LIVE', 'ok'); }
      timer = setTimeout(step, 3000);
      return;
    }
    lastState = '';
    if (++tries > 30) { status(`nie udało się uruchomić podglądu${want ? ` „${want}”` : ''} — wpisz: kiosk off i kliknij ręcznie`, 'RĘCZNIE', 'err'); return; }
    if (want && (tries === 1 || tries % 6 === 0)) {
      const el = findName(want);
      if (el) { fire(el); status(`wybieram „${want}”…`, 'WYBÓR'); }
      else status(`szukam „${want}” na stronie…`, 'SZUKAM');
    } else clickPlay();
    timer = setTimeout(step, 1000);
  }

  addEventListener('message', (e) => {
    if (!ALLOWED.includes(e.origin) || e.data?.lm !== 'cmd') return;
    origin = e.origin;
    const d = e.data;
    if (d.op === 'ping') send({ op: 'hello', path: location.pathname, login: isLogin(), version: 1 });
    else if (d.op === 'scan') send({ op: 'list', names: scan() });
    else if (d.op === 'select') { want = d.name || ''; tries = 0; lastState = ''; step(); }
    else if (d.op === 'audio') { audio = { muted: !!d.muted, volume: +d.volume }; applyAudio(); }
    else if (d.op === 'kiosk') { kiosk = !!d.on; applyKiosk(); }
    else if (d.op === 'reload') location.reload();
  });

  // nowe elementy (np. odtwarzacz po wybraniu kamery) też dostają kiosk i dźwięk
  new MutationObserver(() => {
    if (!origin || queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; applyAudio(); applyKiosk(); });
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
