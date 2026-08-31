/* ============================================================
 * 摸鱼兽悬浮聊天窗 content_pet.js
 * Shadow DOM 注入当前网页，真·backdrop-filter 透视网页背景
 * ============================================================ */
(() => {
  'use strict';

  if (window.__offworkPetInjected) return;
  window.__offworkPetInjected = true;

  /* ---------- 摸鱼兽 SVG ---------- */
  const PET_BODY =
    '<ellipse cx="32" cy="36" rx="20" ry="19" fill="#FFD98E" stroke="#E8B45E" stroke-width="1.2"/>' +
    '<ellipse cx="14" cy="26" rx="6" ry="9" fill="#FFD98E" stroke="#E8B45E" stroke-width="1" transform="rotate(-18 14 26)"/>' +
    '<ellipse cx="50" cy="26" rx="6" ry="9" fill="#FFD98E" stroke="#E8B45E" stroke-width="1" transform="rotate(18 50 26)"/>' +
    '<ellipse cx="32" cy="39" rx="2.6" ry="2" fill="#4A3B32"/>' +
    '<ellipse cx="19" cy="41" rx="3" ry="1.8" fill="#FFA7A7" opacity="0.7"/>' +
    '<ellipse cx="45" cy="41" rx="3" ry="1.8" fill="#FFA7A7" opacity="0.7"/>';

  const PET_FACES = {
    idle:  '<ellipse cx="24" cy="32" rx="3.2" ry="4" fill="#4A3B32"/><ellipse cx="40" cy="32" rx="3.2" ry="4" fill="#4A3B32"/><circle cx="25.2" cy="30.6" r="1.3" fill="#fff"/><circle cx="41.2" cy="30.6" r="1.3" fill="#fff"/><path d="M27 43 Q32 47 37 43" stroke="#4A3B32" stroke-width="1.4" fill="none" stroke-linecap="round"/>',
    happy: '<path d="M21 32 Q24 28.5 27 32" stroke="#4A3B32" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M37 32 Q40 28.5 43 32" stroke="#4A3B32" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M27 45 Q32 49 37 45" stroke="#4A3B32" stroke-width="1.4" fill="none" stroke-linecap="round"/>',
    sleepy: '<path d="M22 33 Q24 31 26 33" stroke="#4A3B32" stroke-width="1.5" fill="none" stroke-linecap="round"/><path d="M38 33 Q40 31 42 33" stroke="#4A3B32" stroke-width="1.5" fill="none" stroke-linecap="round"/><path d="M28 44 Q32 46.5 36 44" stroke="#4A3B32" stroke-width="1.3" fill="none" stroke-linecap="round"/>',
    excited: '<circle cx="24" cy="32" r="4" fill="#4A3B32"/><circle cx="40" cy="32" r="4" fill="#4A3B32"/><circle cx="25.6" cy="30.2" r="1.5" fill="#fff"/><circle cx="41.6" cy="30.2" r="1.5" fill="#fff"/><path d="M27 44 Q32 48 37 44" stroke="#4A3B32" stroke-width="1.5" fill="none" stroke-linecap="round"/>',
  };

  const petSvg = (size, face) =>
    `<svg viewBox="0 0 64 64" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">${PET_BODY}${PET_FACES[face] || PET_FACES.idle}</svg>`;

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let cfg = null;
  let history = [];
  let busy = false;

  // 注入的 DOM 引用
  let host = null;
  let shadow = null;
  let panel = null;

  /* ---------- 创建 Shadow DOM 悬浮窗（首次） ---------- */
  function ensurePanel() {
    if (host && panel) return;

    host = document.createElement('div');
    host.setAttribute('data-offwork-pet', '');
    host.style.cssText = 'all: initial; position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 2147483647; pointer-events: none;';
    document.documentElement.appendChild(host);

    shadow = host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = `
      :host { all: initial; }
      .floating-window {
        position: fixed;
        left: 24px;
        top: 24px;
        width: 320px;
        max-height: 580px;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        border-radius: 26px;
        background: var(--island-bg, rgba(255, 255, 255, 0.55));
        backdrop-filter: var(--island-filter, blur(30px) saturate(180%));
        -webkit-backdrop-filter: var(--island-filter, blur(30px) saturate(180%));
        border: 0.5px solid var(--island-border, rgba(255, 255, 255, 0.7));
        box-shadow: var(--island-shadow, 0 24px 60px -12px rgba(0, 0, 0, 0.22),
                    0 2px 8px rgba(0, 0, 0, 0.05),
                    inset 0 1px 1px 0 rgba(255, 255, 255, 0.85));
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC",
                     "HarmonyOS Sans SC", "Segoe UI", system-ui, sans-serif;
        color: var(--island-text, #1d1d1f);
        pointer-events: auto;
        transition: opacity .3s cubic-bezier(0.16, 1, 0.3, 1), transform .3s cubic-bezier(0.16, 1, 0.3, 1);
        opacity: 1;
        transform: translateY(0) scale(1);
      }
      .floating-window.hidden {
        opacity: 0;
        transform: translateY(-10px) scale(0.97);
        pointer-events: none;
      }
      .floating-window * { box-sizing: border-box; }

      .topbar {
        display: flex; align-items: center; justify-content: space-between;
        padding: 14px 16px 10px; flex-shrink: 0;
        cursor: grab;
      }
      .topbar:active { cursor: grabbing; }
      .topbar-left { display: flex; align-items: center; gap: 9px; }
      .topbar-title {
        font-size: 14.5px; font-weight: 700; letter-spacing: -0.01em;
        display: flex; align-items: center; gap: 7px;
      }
      .online-dot {
        width: 8px; height: 8px; border-radius: 50%; background: #34C759;
        box-shadow: 0 0 0 3px rgba(52, 199, 89, 0.18);
        animation: pulse 1.8s ease-in-out infinite;
      }
      @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.45; } }
      .topbar-btn {
        border: none; background: rgba(120, 120, 128, 0.16);
        color: var(--island-text, #1d1d1f);
        border-radius: 10px; padding: 5px 11px;
        font-size: 12px; font-weight: 600;
        cursor: pointer; font-family: inherit;
        transition: background .15s ease, transform .1s ease;
      }
      .topbar-btn:hover { background: rgba(120, 120, 128, 0.24); }
      .topbar-btn:active { transform: scale(0.96); }
      .topbar-btn.primary { background: var(--island-accent, #0071e3); color: #fff; }
      .topbar-btn.primary:hover { filter: brightness(1.1); }

      .pet-stage {
        display: flex; flex-direction: column; align-items: center;
        padding: 8px 0 4px; flex-shrink: 0;
      }
      .pet-avatar-wrap {
        position: relative; width: 76px; height: 76px;
        border-radius: 50%;
        background: var(--tile-bg, rgba(255, 255, 255, 0.5));
        border: 0.5px solid var(--tile-border, rgba(255, 255, 255, 0.7));
        box-shadow: 0 10px 26px -6px rgba(0, 0, 0, 0.14), inset 0 1px 1px 0 rgba(255, 255, 255, 0.9);
        display: flex; align-items: center; justify-content: center;
        animation: floaty 3.2s ease-in-out infinite;
      }
      @keyframes floaty {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-4px); }
      }
      #pet-avatar { line-height: 0; }
      .pet-name { margin-top: 8px; font-size: 13px; font-weight: 700; }
      .pet-motto {
        margin-top: 3px; font-size: 11.5px;
        color: var(--island-sub, #86868b);
        max-width: 280px; text-align: center; line-height: 1.45;
        padding: 0 16px;
      }

      .chat-scroll {
        flex: 1; overflow-y: auto;
        padding: 10px 14px 12px;
        display: flex; flex-direction: column; gap: 10px;
        scroll-behavior: smooth; min-height: 80px;
      }
      .chat-scroll::-webkit-scrollbar { width: 4px; }
      .chat-scroll::-webkit-scrollbar-thumb { background: rgba(120,120,128,0.3); border-radius: 2px; }

      .msg { display: flex; gap: 8px; align-items: flex-end; max-width: 82%; }
      .msg.pet { align-self: flex-start; }
      .msg.user { align-self: flex-end; flex-direction: row-reverse; }

      .msg-avatar {
        width: 26px; height: 26px; border-radius: 50%;
        background: var(--tile-bg, rgba(255, 255, 255, 0.6));
        border: 0.5px solid var(--tile-border, rgba(255, 255, 255, 0.7));
        display: flex; align-items: center; justify-content: center;
        flex-shrink: 0; line-height: 0;
      }
      .msg.user .msg-avatar {
        background: var(--island-accent, rgba(0, 113, 227, 0.12));
        border-color: transparent;
        color: var(--island-accent, #0071e3);
        font-size: 12px; font-weight: 600;
      }

      .bubble {
        padding: 8px 13px; font-size: 13px; line-height: 1.5;
        border-radius: 16px; word-break: break-word;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.03);
      }
      .msg.pet .bubble {
        background: var(--tile-bg, rgba(255, 255, 255, 0.72));
        border: 0.5px solid var(--tile-border, rgba(255, 255, 255, 0.75));
        border-bottom-left-radius: 5px;
      }
      .msg.user .bubble {
        background: var(--island-accent, #0071e3);
        color: #fff;
        border-bottom-right-radius: 5px;
      }
      .bubble.typing {
        display: inline-flex; align-items: center; gap: 5px;
        min-width: 42px; justify-content: center;
      }
      .bubble.typing i {
        width: 5px; height: 5px; border-radius: 50%;
        background: var(--island-sub, #86868b);
        animation: bounce 1.2s infinite ease-in-out;
      }
      .bubble.typing i:nth-child(2) { animation-delay: 0.15s; }
      .bubble.typing i:nth-child(3) { animation-delay: 0.3s; }
      @keyframes bounce { 0%,80%,100% { transform: translateY(0); opacity: 0.5; } 40% { transform: translateY(-4px); opacity: 1; } }

      .input-bar {
        flex-shrink: 0; display: flex; gap: 8px;
        padding: 10px 14px 14px;
        border-top: 0.5px solid var(--hairline, rgba(0, 0, 0, 0.08));
      }
      .input-wrap {
        flex: 1; display: flex; align-items: center;
        background: var(--tile-bg, rgba(120, 120, 128, 0.14));
        border: 0.5px solid var(--tile-border, transparent);
        border-radius: 20px; padding: 0 15px;
        transition: box-shadow .2s ease, background .2s ease;
      }
      .input-wrap:focus-within {
        background: rgba(120, 120, 128, 0.18);
        box-shadow: 0 0 0 3px var(--island-accent-soft, rgba(0, 113, 227, 0.16));
      }
      #chat-input {
        flex: 1; border: none; outline: none; background: transparent;
        font-size: 13.5px; font-family: inherit;
        color: var(--island-text, #1d1d1f);
        padding: 10px 0;
      }
      #chat-input::placeholder { color: var(--island-sub, #86868b); }
      #send-btn {
        border: none;
        background: var(--island-accent, #0071e3);
        color: #fff; border-radius: 20px;
        padding: 0 18px; font-size: 13px; font-weight: 700;
        cursor: pointer; font-family: inherit; flex-shrink: 0;
        transition: transform .1s ease, filter .15s ease;
      }
      #send-btn:hover { filter: brightness(1.1); }
      #send-btn:active { transform: scale(0.95); }
      #send-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    `;
    shadow.appendChild(style);

    panel = document.createElement('div');
    panel.className = 'floating-window hidden';
    panel.innerHTML = `
      <div class="topbar" id="drag-bar">
        <div class="topbar-left">
          <span class="online-dot"></span>
          <span class="topbar-title">摸鱼兽聊天室 🐾</span>
        </div>
        <div style="display:flex;gap:6px;align-items:center;">
          <button class="topbar-btn" id="reset-btn" title="清空聊天记录">新话题</button>
          <button class="topbar-btn primary" id="close-btn" title="关闭">✕</button>
        </div>
      </div>
      <div class="pet-stage">
        <div class="pet-avatar-wrap">
          <div id="pet-avatar"></div>
        </div>
        <div class="pet-name">摸鱼兽</div>
        <div class="pet-motto" id="pet-motto">正在加载台词…</div>
      </div>
      <div class="chat-scroll" id="chat-scroll"></div>
      <div class="input-bar">
        <div class="input-wrap">
          <input id="chat-input" type="text" maxlength="200" placeholder="和摸鱼兽说点什么…（Enter 发送）" autocomplete="off">
        </div>
        <button id="send-btn">发送</button>
      </div>
    `;
    shadow.appendChild(panel);

    bindEvents();
    initData();
  }

  function $(id) { return shadow && shadow.getElementById(id); }

  /* ---------- 毛玻璃通透度：跟随设置里的「卡片玻璃」滑块 ---------- */
  function applyGlass() {
    if (!host || !cfg) return;
    let isDark = false;
    try {
      if (typeof THEME !== 'undefined' && THEME.resolveTheme) {
        isDark = !!THEME.resolveTheme(cfg).isDark;
      }
    } catch {}

    const raw = cfg.glassOpacity;
    const opacity = typeof raw === 'number' ? Math.max(0, Math.min(1, raw / 100)) : 0.65;
    const blurPx = Math.round(opacity * 28);
    const filterVal = blurPx > 0
      ? `blur(${blurPx}px) saturate(${100 + Math.round(opacity * 90)}%)`
      : 'none';
    const bgRgb = isDark ? '28, 28, 32' : '255, 255, 255';

    // 主体：完全跟随滑块（0% 时彻底透明、关闭模糊 → 真·空气悬浮）
    host.style.setProperty('--island-bg', opacity > 0 ? `rgba(${bgRgb}, ${opacity})` : 'transparent');
    host.style.setProperty('--island-filter', filterVal);
    host.style.setProperty('--island-border', opacity > 0
      ? (isDark
          ? `rgba(255,255,255,${Math.max(0.04, opacity * 0.16)})`
          : `rgba(255,255,255,${Math.max(0.18, opacity * 0.75)})`)
      : (isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)'));
    host.style.setProperty('--island-shadow', opacity > 0
      ? `0 24px 60px -12px rgba(0,0,0,${Math.min(0.28, opacity * 0.32)}), 0 2px 8px rgba(0,0,0,0.05), inset 0 1px 1px 0 rgba(255,255,255,${opacity * 0.85})`
      : '0 12px 32px -8px rgba(0, 0, 0, 0.14)');

    // 气泡/输入框：跟随滑块但保留最低 32% 底，保证聊天文字始终可读
    const tileOpacity = Math.max(0.32, opacity * 0.6).toFixed(2);
    host.style.setProperty('--tile-bg', `rgba(${bgRgb}, ${tileOpacity})`);
    host.style.setProperty('--tile-border', opacity > 0
      ? (isDark
          ? `rgba(255,255,255,${Math.max(0.06, opacity * 0.16)})`
          : `rgba(255,255,255,${Math.max(0.25, opacity * 0.6)})`)
      : (isDark ? 'rgba(255, 255, 255, 0.16)' : 'rgba(255, 255, 255, 0.45)'));
  }

  /* ---------- 表情 ---------- */
  function petFace(kind) {
    const el = $('pet-avatar');
    if (el) el.innerHTML = petSvg(64, kind);
  }

  /* ---------- 情境上下文（与 content.js / pet.js 对齐） ---------- */
  function buildContext() {
    const now = new Date();
    const dow = now.getDay();
    const h = now.getHours(), m = now.getMinutes();
    const curMin = h * 60 + m;
    const [eh, em] = String((cfg && cfg.end) || '18:00').split(':').map(Number);
    const endMin = (eh || 18) * 60 + (em || 0);
    const snap = CORE.snapshot(now, cfg || {});
    const desc = [];
    desc.push('星期' + '日一二三四五六'[dow]);
    desc.push(`当前时间 ${h}:${String(m).padStart(2, '0')}`);
    desc.push(`距下班剩余 ${snap.countdown !== null ? Math.ceil(snap.countdown / 60) : 0} 分钟`);
    desc.push(`今日状态：${snap.status.label}`);
    if (snap.cards && snap.cards.payday) desc.push(`距发薪还有 ${snap.cards.payday.value} 天`);
    if (snap.dayInfo && snap.dayInfo.kind === 'holiday') desc.push('今天是法定节假日');
    if (snap.dayInfo && snap.dayInfo.kind === 'makeup') desc.push('今天是调休补班日');
    if (snap.dayInfo && snap.dayInfo.kind === 'weekend') desc.push('今天是周末');
    if (snap.cards && snap.cards.friday && snap.cards.friday.value === 0) desc.push('今天就是周五！');
    return {
      dow, curMin, endMin,
      friday: dow === 5,
      holiday: snap.dayInfo && snap.dayInfo.kind === 'holiday',
      makeup: snap.dayInfo && snap.dayInfo.kind === 'makeup',
      weekend: snap.dayInfo && snap.dayInfo.kind === 'weekend',
      payday: !!(snap.cards && snap.cards.payday && snap.cards.payday.value === 0),
      after: snap.status.key === 'after',
      before_work: snap.status.key === 'before',
      almost: snap.countdown !== null && snap.countdown <= 1800,
      morning: curMin < 11 * 60,
      noon: curMin >= 11 * 60 && curMin < 14 * 60,
      afternoon: curMin >= 14 * 60 && curMin < endMin,
      desc: desc.join('；'),
    };
  }

  /* ---------- 气泡 ---------- */
  function appendMsg(role, text, typing) {
    const scroll = $('chat-scroll');
    const div = document.createElement('div');
    div.className = 'msg ' + role;
    const avatar = role === 'pet'
      ? `<div class="msg-avatar">${petSvg(32, 'idle')}</div>`
      : '<div class="msg-avatar">我</div>';
    const bubble = typing
      ? '<div class="bubble typing"><i></i><i></i><i></i></div>'
      : `<div class="bubble">${esc(text)}</div>`;
    div.innerHTML = avatar + bubble;
    scroll.appendChild(div);
    scroll.scrollTop = scroll.scrollHeight;
    return div;
  }
  function setBubbleText(msgEl, text) {
    const b = msgEl && msgEl.querySelector('.bubble');
    if (b) b.outerHTML = `<div class="bubble">${esc(text)}</div>`;
  }
  function setBusy(v) {
    busy = v;
    const btn = $('send-btn');
    if (btn) btn.disabled = v;
  }

  /* ---------- 核心对话 ---------- */
  function ask(userText) {
    if (busy) return;
    setBusy(true);
    if (userText) {
      history.push({ role: 'user', content: userText });
      appendMsg('user', userText);
    }
    const typingMsg = appendMsg('pet', '', true);
    petFace('excited');
    const finish = (text, face) => {
      setBubbleText(typingMsg, text);
      const motto = $('pet-motto');
      if (motto) motto.textContent = '「' + text + '」';
      if (userText) history.push({ role: 'assistant', content: text });
      history = history.slice(-20);
      petFace(face);
      setBusy(false);
    };
    try {
      chrome.runtime.sendMessage({
        type: 'pet-say',
        userText: userText || '',
        context: { desc: buildContext().desc, history },
      }, (resp) => {
        const ok = resp && resp.ok && resp.text;
        const text = ok ? resp.text : '摸鱼兽脑子卡壳了，再说一遍？';
        const face = /下班|自由|周末|放假|开心/.test(text) ? 'happy' : 'idle';
        finish(text, face);
      });
    } catch {
      finish('摸鱼兽暂时无法应答', 'idle');
    }
  }

  function newTopic() {
    history = [];
    const scroll = $('chat-scroll');
    if (scroll) scroll.innerHTML = '';
    const motto = $('pet-motto');
    if (motto) motto.textContent = '摸鱼兽重新开机中…';
    ask(null);
  }

  /* ---------- 拖拽（顶栏，避开输入/按钮） ---------- */
  function setupDrag() {
    const bar = $('drag-bar');
    let dragging = false, sx = 0, sy = 0, ox = 24, oy = 24;
    bar.addEventListener('mousedown', (e) => {
      const t = e.target;
      if (t && t.closest && (t.closest('button') || t.closest('input'))) return;
      dragging = true;
      sx = e.clientX; sy = e.clientY;
      const rect = panel.getBoundingClientRect();
      ox = rect.left; oy = rect.top;
      panel.style.transition = 'none';
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      e.preventDefault();
    });
    function onMove(e) {
      if (!dragging) return;
      let left = ox + (e.clientX - sx);
      let top = oy + (e.clientY - sy);
      const W = window.innerWidth, H = window.innerHeight;
      const w = panel.offsetWidth, h = panel.offsetHeight;
      left = Math.max(8, Math.min(W - w - 8, left));
      top = Math.max(8, Math.min(H - h - 8, top));
      panel.style.left = left + 'px';
      panel.style.top = top + 'px';
      panel.style.right = 'auto';
    }
    function onUp() {
      if (!dragging) return;
      dragging = false;
      panel.style.transition = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
  }

  /* ---------- 事件绑定 ---------- */
  function bindEvents() {
    setupDrag();
    const send = $('send-btn');
    const input = $('chat-input');
    const doSend = () => {
      const v = (input.value || '').trim();
      if (!v) return;
      input.value = '';
      ask(v);
    };
    send.addEventListener('click', doSend);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doSend();
    });
    $('reset-btn').addEventListener('click', newTopic);
    $('close-btn').addEventListener('click', () => hidePanel(true));
  }

  /* ---------- 初始化数据 / 开场白 ---------- */
  async function initData() {
    // 保护：极少数场景 CORE 可能未就绪（如仅注入本文件），等它就绪
    let tries = 0;
    while ((typeof CORE === 'undefined' || typeof CORE.loadConfig !== 'function') && tries < 20) {
      await new Promise(r => setTimeout(r, 100));
      tries++;
    }
    try {
      cfg = await CORE.loadConfig();
      if (typeof THEME !== 'undefined' && THEME.applyToDOM) {
        THEME.applyToDOM(cfg, host);
      }
      applyGlass();
    } catch {}
    petFace('idle');
    appendMsg('pet', '嗨，我是摸鱼兽！今天也一起熬到下班吗？');
    ask(null);
  }

  /* ---------- 显隐 ---------- */
  function showPanel() {
    ensurePanel();
    panel.classList.remove('hidden');
    // 重新拉最新配置（皮肤 + 通透度跟随）
    CORE.loadConfig().then(c => {
      cfg = c;
      if (typeof THEME !== 'undefined' && THEME.applyToDOM) THEME.applyToDOM(c, host);
      applyGlass();
    });
  }
  function hidePanel(dispose) {
    if (!panel) return;
    panel.classList.add('hidden');
    if (dispose) {
      setTimeout(() => {
        if (host && host.parentNode) host.parentNode.removeChild(host);
        host = null; shadow = null; panel = null;
      }, 320);
    }
  }
  function togglePanel() {
    if (!panel || panel.classList.contains('hidden')) showPanel();
    else hidePanel(true);
  }

  /* ---------- 主题实时同步 ---------- */
  chrome.storage && chrome.storage.onChanged && chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area === 'sync' && host) {
      try {
        cfg = await CORE.loadConfig();
        if (typeof THEME !== 'undefined' && THEME.applyToDOM) THEME.applyToDOM(cfg, host);
        applyGlass();
      } catch {}
    }
  });

  /* ---------- 监听来自 Background / Popup 的消息 ---------- */
  chrome.runtime.onMessage.addListener((req, _sender, sendResponse) => {
    if (!req) return;
    if (req.action === 'show-pet-widget') { showPanel(); sendResponse({ ok: true }); return true; }
    if (req.action === 'hide-pet-widget') { hidePanel(true); sendResponse({ ok: true }); return true; }
    if (req.action === 'toggle-pet-widget') {
      if (!panel || panel.classList.contains('hidden')) showPanel();
      else hidePanel(true);
      sendResponse({ ok: true }); return true;
    }
  });

})();