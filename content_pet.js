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
  // 五子棋/象棋棋盘与棋子的透明度（0.35~1，跟随玻璃透明度联动：面板越透明棋子越淡，保底能看清）
  let gameAlpha = 1;

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
        max-height: 92vh;
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
        display: flex; align-items: center; justify-content: flex-end;
        padding: 8px 10px 6px; flex-shrink: 0;
        cursor: grab;
      }
      .topbar:active { cursor: grabbing; }
      /* 摸鱼：装饰性标题（摸鱼兽聊天室 + 在线点）隐藏，太显眼 */
      .topbar-left { display: none; }
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
      .topbar-btn.primary {
        background: var(--island-accent-soft, rgba(70,120,220,0.18));
        border-color: var(--island-accent-line, rgba(70,120,220,0.35));
        color: var(--island-text, #1d1d1f); font-weight: 600;
      }
      .topbar-btn.primary:hover { background: var(--island-accent-line, rgba(70,120,220,0.35)); }
      /* 当前视图高亮：淡蓝底（跟随玻璃）而非实心亮蓝 */
      .topbar-btn.on {
        background: var(--island-accent-soft, rgba(70,120,220,0.18));
        border-color: var(--island-accent-line, rgba(70,120,220,0.35));
        color: var(--island-text, #1d1d1f); font-weight: 600;
      }
      .topbar-btn.on:hover { filter: brightness(1.1); }

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
      /* 摸鱼："摸鱼兽"品牌名隐藏，太显眼（台词气泡保留，那是聊天内容） */
      .pet-name { display: none; }
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
      .src-tag {
        font-size: 10px;
        line-height: 1.3;
        color: var(--island-sub, #86868b);
        opacity: 0.75;
        margin: 2px 0 0 4px;
        align-self: flex-start;
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

      /* 五子棋对战 */
      .gomoku-view {
        flex: 1; display: flex; flex-direction: column; align-items: center;
        gap: 10px; padding: 6px 14px 12px; overflow: hidden;
        border-top: 0.5px solid var(--hairline, rgba(0,0,0,0.08));
      }
      .gomoku-bar {
        width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 8px;
      }
      .gomoku-status { font-size: 12.5px; font-weight: 600; color: var(--island-text, #1d1d1f); white-space: nowrap; }
      /* 赢棋文字：跟普通状态条同色，不再主色高亮——低调免被老板看出在玩 */
      .gomoku-status.win { color: var(--island-text, #1d1d1f); }
      .gomoku-actions { display: flex; gap: 6px; flex-shrink: 0; }
      .gomoku-canvas-wrap {
        position: relative;
        border-radius: 16px;
        background: var(--tile-bg, rgba(255,255,255,0.35));
        border: 0.5px solid var(--tile-border, rgba(255,255,255,0.55));
        box-shadow: inset 0 1px 1px 0 rgba(255,255,255,0.5);
        padding: 10px;
      }
      #gomoku-canvas { display: block; cursor: pointer; }
      #gomoku-canvas.waiting { cursor: default; }
      .gomoku-hint { font-size: 10.5px; color: var(--island-sub, #86868b); line-height: 1.4; text-align: center; }

      /* 引擎/难度小按钮 */
      .chip-mini {
        appearance: none; border: 0.5px solid var(--tile-border, rgba(0,0,0,0.1));
        background: var(--tile-bg, rgba(255,255,255,0.4));
        color: var(--island-text, #1d1d1f);
        font-family: inherit; font-size: 10.5px; line-height: 1;
        padding: 4px 8px; border-radius: 999px; cursor: pointer;
        transition: all .15s ease;
      }
      .chip-mini:hover { border-color: var(--island-accent, #0071e3); color: var(--island-accent, #0071e3); }
      /* 选中态：淡蓝半透明底（跟随玻璃透明度）+ 文字色，避免实心亮蓝太扎眼 */
      .chip-mini.on {
        background: var(--island-accent-soft, rgba(70,120,220,0.18));
        border-color: var(--island-accent-line, rgba(70,120,220,0.35));
        color: var(--island-text, #1d1d1f); font-weight: 600;
      }
      .chip-mini:disabled { opacity: 0.5; cursor: not-allowed; }

      /* 中国象棋 */
      .xiangqi-view {
        flex: 1; display: flex; flex-direction: column; align-items: center;
        gap: 8px; padding: 6px 12px 12px; overflow: auto;
        border-top: 0.5px solid var(--hairline, rgba(0,0,0,0.08));
      }
      .xiangqi-bar {
        width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 8px;
      }
      .xiangqi-status { font-size: 12.5px; font-weight: 600; color: var(--island-text, #1d1d1f); white-space: nowrap; }
      /* 同上：赢棋不主色高亮 */
      .xiangqi-status.win { color: var(--island-text, #1d1d1f); }
      .xiangqi-actions { display: flex; gap: 6px; flex-shrink: 0; }
      .xiangqi-canvas-wrap {
        position: relative; border-radius: 14px; line-height: 0;
        background: var(--tile-bg, rgba(255,255,255,0.35));
        border: 0.5px solid var(--tile-border, rgba(255,255,255,0.55));
        box-shadow: inset 0 1px 1px 0 rgba(255,255,255,0.5);
        padding: 8px;
      }
      #xiangqi-canvas { display: block; cursor: pointer; touch-action: none; }
      .xiangqi-hint { font-size: 10.5px; color: var(--island-sub, #86868b); line-height: 1.4; text-align: center; }
      .xq-side-row { display: flex; gap: 4px; align-items: center; }

      /* 悬浮窗四角拖拽缩放手柄（右下角） */
      .resize-handle {
        position: absolute; right: 1px; bottom: 1px; width: 16px; height: 16px;
        cursor: nwse-resize; z-index: 30; border-radius: 0 0 12px 0;
        background:
          linear-gradient(135deg, transparent 0 46%, var(--island-sub, #86868b) 46% 54%, transparent 54% 70%, var(--island-sub, #86868b) 70% 78%, transparent 78%);
        opacity: 0.45;
      }
      .resize-handle:hover { opacity: 0.9; }
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
          <button class="topbar-btn on" id="view-chat-btn" title="聊天">💬</button>
          <button class="topbar-btn" id="view-gomoku-btn" title="和摸鱼兽下五子棋">♟</button>
          <button class="topbar-btn" id="view-xiangqi-btn" title="和摸鱼兽下象棋">♞</button>
          <button class="topbar-btn" id="reset-btn" title="清空聊天记录">新话题</button>
          <button class="topbar-btn primary" id="close-btn" title="关闭">✕</button>
        </div>
      </div>
      <div class="pet-stage" id="pet-stage">
        <div class="pet-avatar-wrap">
          <div id="pet-avatar"></div>
        </div>
        <div class="pet-name">摸鱼兽</div>
        <div class="pet-motto" id="pet-motto">正在加载台词…</div>
      </div>
      <div class="chat-scroll" id="chat-scroll"></div>
      <div class="input-bar" id="input-bar">
        <div class="input-wrap">
          <input id="chat-input" type="text" maxlength="200" placeholder="和摸鱼兽说点什么…（Enter 发送）" autocomplete="off">
        </div>
        <button id="send-btn">发送</button>
      </div>
      <div class="gomoku-view" id="gomoku-view" style="display:none">
        <div class="gomoku-bar">
          <span class="gomoku-status" id="gomoku-status">五子棋 · 你执黑先行</span>
          <div class="gomoku-actions">
            <button class="topbar-btn" id="gomoku-undo" title="悔棋">悔棋</button>
            <button class="topbar-btn" id="gomoku-restart" title="重开">重开</button>
          </div>
        </div>
        <div class="gomoku-bar">
          <div style="display:flex;gap:4px;align-items:center">
            <span style="font-size:10px;opacity:.7">引擎</span>
            <button class="chip-mini on" data-mode="local" id="gm-mode-local">本地</button>
            <button class="chip-mini" data-mode="llm" id="gm-mode-llm">大模型</button>
          </div>
          <div style="display:flex;gap:4px;align-items:center">
            <span style="font-size:10px;opacity:.7">难度</span>
            <button class="chip-mini" data-diff="easy" id="gm-diff-easy">简单</button>
            <button class="chip-mini on" data-diff="medium" id="gm-diff-medium">中等</button>
            <button class="chip-mini" data-diff="hard" id="gm-diff-hard">困难</button>
          </div>
        </div>
        <div class="gomoku-canvas-wrap">
          <canvas id="gomoku-canvas" width="276" height="276"></canvas>
        </div>
        <div class="gomoku-hint" id="gomoku-hint">点击棋盘落子（你执黑 ♟ · 摸鱼兽执白 ⚪）</div>
      </div>
      <div class="resize-handle" id="resize-handle"></div>
      <div class="xiangqi-view" id="xiangqi-view" style="display:none">
        <div class="xiangqi-bar">
          <span class="xiangqi-status" id="xiangqi-status">象棋 · 你执红先行</span>
          <div class="xiangqi-actions">
            <button class="topbar-btn" id="xiangqi-undo" title="悔棋">悔棋</button>
            <button class="topbar-btn" id="xiangqi-restart" title="重开">重开</button>
          </div>
        </div>
        <div class="xiangqi-bar">
          <div class="xq-side-row">
            <span style="font-size:10px;opacity:.7">先后手</span>
            <button class="chip-mini on" data-xqside="r" id="xq-side-r">执红先</button>
            <button class="chip-mini" data-xqside="b" id="xq-side-b">执黑后</button>
          </div>
          <div style="display:flex;gap:4px;align-items:center">
            <span style="font-size:10px;opacity:.7">引擎</span>
            <button class="chip-mini on" data-xqmode="local" id="xq-mode-local">本地</button>
            <button class="chip-mini" data-xqmode="llm" id="xq-mode-llm">大模型</button>
          </div>
        </div>
        <div class="xiangqi-bar">
          <div style="display:flex;gap:4px;align-items:center">
            <span style="font-size:10px;opacity:.7">难度</span>
            <button class="chip-mini" data-xqdiff="easy" id="xq-diff-easy">简单</button>
            <button class="chip-mini on" data-xqdiff="medium" id="xq-diff-medium">中等</button>
            <button class="chip-mini" data-xqdiff="hard" id="xq-diff-hard">困难</button>
          </div>
        </div>
        <div class="xiangqi-canvas-wrap">
          <canvas id="xiangqi-canvas" width="252" height="280"></canvas>
        </div>
        <div class="xiangqi-hint" id="xiangqi-hint">点己方棋子选中，再点目标格落子（你执红 ♔ · 摸鱼兽执黑 ♚）</div>
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
    // 个性皮肤主色（如风暴蓝 #8BB5DE / 玫瑰粉 #D4A5A5 / 抹茶绿 #B0D8A8），用于选中态；取不到则兜底中性蓝
    let accentRgb = '70, 120, 220';
    try {
      if (typeof THEME !== 'undefined' && THEME.resolveTheme) {
        const tr = THEME.resolveTheme(cfg);
        isDark = !!(tr && tr.isDark);
        const a = (tr && tr.accent) ? String(tr.accent) : '';
        const hex = a.replace('#', '');
        if (/^[0-9a-fA-F]{6}$/.test(hex)) {
          accentRgb = hex.match(/../g).map(x => parseInt(x, 16)).join(', ');
        }
      }
    } catch {}

    const raw = cfg.glassOpacity;
    const opacity = typeof raw === 'number' ? Math.max(0, Math.min(1, raw / 100)) : 0.65;
    const blurPx = Math.round(opacity * 28);
    const filterVal = blurPx > 0
      ? `blur(${blurPx}px) saturate(${100 + Math.round(opacity * 90)}%)`
      : 'none';
    // 五子棋/象棋棋子透明度跟玻璃联动：面板越透明→棋子越淡；摸鱼保底 0.15（几乎隐形）
    gameAlpha = Math.round((0.15 + 0.85 * opacity) * 100) / 100;
    // 文字透明度跟玻璃联动：主文字（标题/状态/按钮）保底 0.22，次要(hint) 0.10；强调色不淡（功能色）
    const textAlpha = Math.round((0.22 + 0.78 * opacity) * 100) / 100;
    const subAlpha = Math.round((0.10 + 0.55 * opacity) * 100) / 100;
    const textBase = isDark ? '255, 255, 255' : '24, 24, 28';
    host.style.setProperty('--island-text', `rgba(${textBase}, ${textAlpha})`);
    host.style.setProperty('--island-sub', `rgba(${textBase}, ${subAlpha})`);
    // 自定义玻璃底色：选中则用用户色，否则跟随主题白/黑（纯透明玻璃）
    const bgRgb = (cfg.glassColor && /^#[0-9a-fA-F]{6}$/.test(cfg.glassColor))
      ? cfg.glassColor.slice(1).match(/../g).map(x => parseInt(x, 16)).join(', ')
      : (isDark ? '28, 28, 32' : '255, 255, 255');

    // 选中态（执红先/本地/中等 chip、视图切换按钮）：用当前个性皮肤的主色，跟随玻璃透明度
    const accentSoft = Math.max(0.06, 0.26 * opacity).toFixed(3);
    const accentLine = Math.max(0.10, 0.50 * opacity).toFixed(3);
    host.style.setProperty('--island-accent-soft', `rgba(${accentRgb}, ${accentSoft})`);
    host.style.setProperty('--island-accent-line', `rgba(${accentRgb}, ${accentLine})`);

    // 主体：完全跟随滑块（0% 时彻底透明、关闭模糊 → 真·空气悬浮）
    host.style.setProperty('--island-bg', opacity > 0 ? `rgba(${bgRgb}, ${opacity})` : 'transparent');
    host.style.setProperty('--island-filter', filterVal);
    host.style.setProperty('--island-border', opacity > 0
      ? (isDark
          ? `rgba(255,255,255,${Math.max(0.02, opacity * 0.16)})`
          : `rgba(255,255,255,${Math.max(0.08, opacity * 0.75)})`)
      : (isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)'));
    host.style.setProperty('--island-shadow', opacity > 0
      ? `0 24px 60px -12px rgba(0,0,0,${Math.min(0.28, opacity * 0.32)}), 0 2px 8px rgba(0,0,0,${0.02 * opacity}), inset 0 1px 1px 0 rgba(255,255,255,${opacity * 0.85})`
      : '0 6px 16px -8px rgba(0, 0, 0, 0.04)');

    // 气泡/输入框：摸鱼模式降低保底，整体跟玻璃一起淡（保底 0.10 仍保留可读余地）
    const tileOpacity = Math.max(0.10, opacity * 0.6).toFixed(2);
    host.style.setProperty('--tile-bg', `rgba(${bgRgb}, ${tileOpacity})`);
    host.style.setProperty('--tile-border', opacity > 0
      ? (isDark
          ? `rgba(255,255,255,${Math.max(0.02, opacity * 0.16)})`
          : `rgba(255,255,255,${Math.max(0.10, opacity * 0.6)})`)
      : (isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.20)'));
    // 透明度变化 → 让当前显示的游戏棋盘/棋子立即套用新透明度
    try {
      const gv = $('gomoku-view'), xv = $('xiangqi-view');
      if (gv && gv.style.display === 'flex' && gmBoard) gmDraw();
      if (xv && xv.style.display === 'flex' && xqBoard) { xqSizeCanvas(); xqRender(); }
    } catch {}
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
  function setBubbleText(msgEl, text, source, error) {
    const b = msgEl && msgEl.querySelector('.bubble');
    if (b) b.outerHTML = `<div class="bubble">${esc(text)}</div>`;
    // 来源标记：本地兜底时提示原因（人设/大模型未参与）
    const old = msgEl && msgEl.querySelector('.src-tag');
    if (old) old.remove();
    if (source === 'local' && msgEl) {
      const tag = document.createElement('div');
      tag.className = 'src-tag';
      tag.textContent = '内置应答 · ' + (error ? error : '未走大模型');
      msgEl.appendChild(tag);
    }
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
    const finish = (text, face, source, error) => {
      setBubbleText(typingMsg, text, source, error);
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
        finish(text, face, ok ? resp.source : undefined, ok ? resp.error : undefined);
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

    /* 五子棋：视图切换 / 棋盘交互 / 引擎与难度 / 悔棋重开 */
    $('view-chat-btn').addEventListener('click', () => switchView('chat'));
    $('view-gomoku-btn').addEventListener('click', () => switchView('gomoku'));
    $('view-xiangqi-btn').addEventListener('click', () => switchView('xiangqi'));
    $('gomoku-undo').addEventListener('click', gmUndo);
    $('gomoku-restart').addEventListener('click', gmRestart);
    $('gomoku-canvas').addEventListener('click', gmOnClick);
    ['gm-mode-local', 'gm-mode-llm'].forEach(id => {
      $(id).addEventListener('click', () => gmSetMode($(id).dataset.mode));
    });
    ['gm-diff-easy', 'gm-diff-medium', 'gm-diff-hard'].forEach(id => {
      $(id).addEventListener('click', () => gmSetDiff($(id).dataset.diff));
    });

    /* 中国象棋：视图 / 落子 / 引擎 / 难度 / 先后手 / 悔棋重开 */
    $('xiangqi-undo').addEventListener('click', xqUndo);
    $('xiangqi-restart').addEventListener('click', () => xqInit(xqPlayer));
    $('xiangqi-canvas').addEventListener('click', xqClick);
    ['xq-mode-local', 'xq-mode-llm'].forEach(id => {
      $(id).addEventListener('click', () => xqSetMode($(id).dataset.xqmode));
    });
    ['xq-diff-easy', 'xq-diff-medium', 'xq-diff-hard'].forEach(id => {
      $(id).addEventListener('click', () => xqSetDiff($(id).dataset.xqdiff));
    });
    ['xq-side-r', 'xq-side-b'].forEach(id => {
      $(id).addEventListener('click', () => xqSetPlayer($(id).dataset.xqside));
    });
    setupResize();
  }

  /* ============================================================
   * 五子棋：15×15 棋盘 · 本地 AI（简单/中等/困难）· 大模型走棋 · 悔棋
   * ============================================================ */
  const GM_N = 15;                 // 棋盘规格 15×15
  const GM_CELL = 18;              // 格距
  const GM_PAD = 12;               // 边距
  const GM_EMPTY = 0, GM_BLACK = 1, GM_WHITE = 2;
  const GM_DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];
  const GM_COLS = 'ABCDEFGHIJKLMNO';

  let gmBoard = null;              // 棋盘二维数组
  let gmHistory = [];              // 落子记录，用于悔棋
  let gmTurn = GM_BLACK;           // 当前该谁走（玩家执黑）
  let gmOver = false;
  let gmBusy = false;              // AI 思考中
  let gmMode = 'local';            // local | llm
  let gmDiff = 'medium';           // easy | medium | hard
  let gmLast = null;               // 最后一手，用于标记

  function gmInit() {
    gmBoard = Array.from({ length: GM_N }, () => Array(GM_N).fill(GM_EMPTY));
    gmHistory = [];
    gmTurn = GM_BLACK;
    gmOver = false;
    gmBusy = false;
    gmLast = null;
    gmDraw();
    gmSetStatus('五子棋 · 你执黑先行', false);
    gmHint('点击棋盘落子（你执黑 ⚫ · 摸鱼兽执白 ⚪）');
  }

  /* ---------- 绘制 ---------- */
  function gmDraw() {
    if (!gmBoard) return;
    const canvas = $('gomoku-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const size = canvas.width;
    ctx.clearRect(0, 0, size, size);
    // 整体透明度跟随玻璃（棋盘+棋子一起淡，保底看清能下）
    ctx.globalAlpha = gameAlpha;

    // 半透明底，透出毛玻璃
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(0, 0, size, size);

    // 网格
    ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    ctx.lineWidth = 1;
    const last = GM_PAD + (GM_N - 1) * GM_CELL;
    for (let i = 0; i < GM_N; i++) {
      const p = GM_PAD + i * GM_CELL;
      ctx.beginPath(); ctx.moveTo(GM_PAD, p); ctx.lineTo(last, p); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(p, GM_PAD); ctx.lineTo(p, last); ctx.stroke();
    }

    // 星位
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    [[3, 3], [3, 11], [11, 3], [11, 11], [7, 7]].forEach(([sr, sc]) => {
      ctx.beginPath();
      ctx.arc(GM_PAD + sc * GM_CELL, GM_PAD + sr * GM_CELL, 2.6, 0, Math.PI * 2);
      ctx.fill();
    });

    // 棋子
    for (let r = 0; r < GM_N; r++) {
      for (let c = 0; c < GM_N; c++) {
        const v = gmBoard[r][c];
        if (!v) continue;
        const cx = GM_PAD + c * GM_CELL, cy = GM_PAD + r * GM_CELL;
        const rad = GM_CELL * 0.44;
        const g = ctx.createRadialGradient(cx - rad * 0.32, cy - rad * 0.32, rad * 0.15, cx, cy, rad);
        if (v === GM_BLACK) { g.addColorStop(0, '#4a4a4d'); g.addColorStop(1, '#0b0b0d'); }
        else { g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#c7c7cc'); }
        ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2);
        ctx.fillStyle = g; ctx.fill();
        ctx.strokeStyle = v === GM_BLACK ? 'rgba(0,0,0,0.5)' : 'rgba(120,120,128,0.55)';
        ctx.lineWidth = 0.8; ctx.stroke();
      }
    }

    // 最后一手标记
    if (gmLast && gmBoard[gmLast.r] && gmBoard[gmLast.r][gmLast.c]) {
      const cx = GM_PAD + gmLast.c * GM_CELL, cy = GM_PAD + gmLast.r * GM_CELL;
      ctx.strokeStyle = gmBoard[gmLast.r][gmLast.c] === GM_BLACK ? '#fff' : '#111';
      ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1; // 恢复，避免影响后续绘制
  }

  /* ---------- 工具 ---------- */
  function gmPointFromEvent(e) {
    const canvas = $('gomoku-canvas');
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const c = Math.round((e.clientX - rect.left - GM_PAD) / GM_CELL);
    const r = Math.round((e.clientY - rect.top - GM_PAD) / GM_CELL);
    if (r < 0 || r >= GM_N || c < 0 || c >= GM_N) return null;
    return { r, c };
  }

  function gmCheckWin(board, r, c, player) {
    for (const [dr, dc] of GM_DIRS) {
      let cnt = 1;
      for (let i = 1; i < 5; i++) {
        const nr = r + dr * i, nc = c + dc * i;
        if (nr < 0 || nr >= GM_N || nc < 0 || nc >= GM_N || board[nr][nc] !== player) break;
        cnt++;
      }
      for (let i = 1; i < 5; i++) {
        const nr = r - dr * i, nc = c - dc * i;
        if (nr < 0 || nr >= GM_N || nc < 0 || nc >= GM_N || board[nr][nc] !== player) break;
        cnt++;
      }
      if (cnt >= 5) return true;
    }
    return false;
  }

  /* ---------- 棋型评估（本地 AI 用） ---------- */
  function gmLineInfo(board, r, c, dr, dc, player) {
    let cnt = 1, openEnds = 0;
    for (let i = 1; i <= 4; i++) {
      const nr = r + dr * i, nc = c + dc * i;
      if (nr < 0 || nr >= GM_N || nc < 0 || nc >= GM_N) break;
      const v = board[nr][nc];
      if (v === player) cnt++;
      else { if (v === GM_EMPTY) openEnds++; break; }
    }
    for (let i = 1; i <= 4; i++) {
      const nr = r - dr * i, nc = c - dc * i;
      if (nr < 0 || nr >= GM_N || nc < 0 || nc >= GM_N) break;
      const v = board[nr][nc];
      if (v === player) cnt++;
      else { if (v === GM_EMPTY) openEnds++; break; }
    }
    return { cnt, openEnds };
  }

  // 假设 player 落在 (r,c) 形成的棋型价值
  function gmPointScore(board, r, c, player) {
    let total = 0;
    for (const [dr, dc] of GM_DIRS) {
      const { cnt, openEnds } = gmLineInfo(board, r, c, dr, dc, player);
      if (cnt >= 5) total += 1000000;
      else if (cnt === 4) total += openEnds === 2 ? 100000 : (openEnds === 1 ? 20000 : 0);
      else if (cnt === 3) total += openEnds === 2 ? 8000 : (openEnds === 1 ? 1200 : 0);
      else if (cnt === 2) total += openEnds === 2 ? 600 : (openEnds === 1 ? 120 : 0);
      else if (cnt === 1) total += openEnds === 2 ? 60 : (openEnds === 1 ? 12 : 0);
    }
    return total;
  }

  // 候选点：已有棋子周围 2 格内的空位
  function gmCandidates(board) {
    const set = new Set();
    let hasStone = false;
    for (let r = 0; r < GM_N; r++) {
      for (let c = 0; c < GM_N; c++) {
        if (board[r][c] === GM_EMPTY) continue;
        hasStone = true;
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const nr = r + dr, nc = c + dc;
            if (nr < 0 || nr >= GM_N || nc < 0 || nc >= GM_N) continue;
            if (board[nr][nc] === GM_EMPTY) set.add(nr * GM_N + nc);
          }
        }
      }
    }
    if (!hasStone) set.add(7 * GM_N + 7);
    return [...set].map(k => ({ r: Math.floor(k / GM_N), c: k % GM_N }));
  }

  /* ---------- 本地 AI（三档难度） ---------- */
  function gmAIMoveLocal() {
    const cands = gmCandidates(gmBoard);
    if (!cands.length) return null;
    const ai = GM_WHITE, human = GM_BLACK;

    if (gmDiff === 'easy') {
      // 简单：偏进攻 + 随机扰动，防守较弱
      let best = null, bestScore = -Infinity;
      for (const p of cands) {
        const s = gmPointScore(gmBoard, p.r, p.c, ai) + Math.random() * 400;
        if (s > bestScore) { bestScore = s; best = p; }
      }
      return best;
    }

    if (gmDiff === 'medium') {
      // 中等：进攻 + 防守并重
      let best = null, bestScore = -Infinity;
      for (const p of cands) {
        const s = gmPointScore(gmBoard, p.r, p.c, ai) + gmPointScore(gmBoard, p.r, p.c, human) * 0.9;
        if (s > bestScore) { bestScore = s; best = p; }
      }
      return best;
    }

    // 困难：取评分前 8，再做一层「对手最佳回应」筛选
    const scored = cands.map(p => ({
      p,
      s: gmPointScore(gmBoard, p.r, p.c, ai) + gmPointScore(gmBoard, p.r, p.c, human) * 0.95,
    })).sort((a, b) => b.s - a.s).slice(0, 8);

    let best = null, bestScore = -Infinity;
    for (const item of scored) {
      const { r, c } = item.p;
      gmBoard[r][c] = ai;
      let oppBest = 0;
      for (const op of gmCandidates(gmBoard)) {
        const ov = gmPointScore(gmBoard, op.r, op.c, human) + gmPointScore(gmBoard, op.r, op.c, ai) * 0.5;
        if (ov > oppBest) oppBest = ov;
      }
      gmBoard[r][c] = GM_EMPTY;
      const s = item.s - oppBest * 0.35;
      if (s > bestScore) { bestScore = s; best = item.p; }
    }
    return best || (scored[0] && scored[0].p) || null;
  }

  /* ---------- 大模型走棋 ---------- */
  function gmBoardToString() {
    return gmBoard.map(row => row.join('')).join(';');
  }

  function gmParseCoord(text) {
    if (!text) return null;
    const m = String(text).toUpperCase().match(/([A-O])\s*(\d{1,2})/);
    if (!m) return null;
    const c = GM_COLS.indexOf(m[1]);
    const r = parseInt(m[2], 10) - 1;
    if (r < 0 || r >= GM_N || c < 0) return null;
    return { r, c };
  }

  function gmPlayAI() {
    if (gmOver || gmBusy) return;
    gmBusy = true;
    gmSetStatus(gmMode === 'llm' ? '摸鱼兽（大模型）思考中…' : '摸鱼兽思考中…', false);
    const canvas = $('gomoku-canvas');
    if (canvas) canvas.classList.add('waiting');

    const finishWith = (move, note) => {
      gmBusy = false;
      if (canvas) canvas.classList.remove('waiting');
      if (note) gmHint(note);
      if (!move) { gmOver = true; gmSetStatus('无处可下，平局', true); return; }
      gmPlace(move.r, move.c, GM_WHITE);
    };

    if (gmMode === 'llm') {
      const cfgP = (typeof CORE !== 'undefined' && CORE.loadConfig) ? CORE.loadConfig() : Promise.resolve(null);
      cfgP.then(c => {
        if (!c || !c.llmUrl || !c.llmKey || !c.petEnabled) {
          finishWith(gmAIMoveLocal(), '未配置大模型，已自动用本地引擎');
          return;
        }
        try {
          chrome.runtime.sendMessage({
            type: 'gomoku-move',
            board: gmBoardToString(),
            size: GM_N,
          }, (resp) => {
            const p = resp && resp.ok ? gmParseCoord(resp.move) : null;
            if (p && gmBoard[p.r][p.c] === GM_EMPTY) {
              finishWith(p, '大模型落子：' + GM_COLS[p.c] + (p.r + 1));
            } else {
              finishWith(gmAIMoveLocal(), (resp && resp.error ? ('大模型失败：' + resp.error) : '大模型坐标无效') + '，已用本地引擎兜底');
            }
          });
        } catch {
          finishWith(gmAIMoveLocal(), '大模型调用异常，已用本地引擎兜底');
        }
      }).catch(() => finishWith(gmAIMoveLocal()));
      return;
    }

    setTimeout(() => finishWith(gmAIMoveLocal()), 280);
  }

  /* ---------- 落子与回合 ---------- */
  function gmPlace(r, c, player) {
    if (gmOver || !gmBoard) return;
    if (gmBoard[r][c] !== GM_EMPTY) return;
    gmBoard[r][c] = player;
    gmHistory.push({ r, c, p: player });
    gmLast = { r, c };
    gmDraw();

    if (gmCheckWin(gmBoard, r, c, player)) {
      gmOver = true;
      if (player === GM_BLACK) {
        gmSetStatus('🎉 你赢了！摸鱼兽不服', true);
        gmPetSay('呜…你赢了，这局不算，再来！', 'sleepy');
        gmHint('你赢了 🎉 点「重开」再来一局，或「悔棋」复盘');
      } else {
        gmSetStatus('😏 摸鱼兽赢了', true);
        gmPetSay('嘿嘿，我赢啦～要不要再来一局？', 'happy');
        gmHint('摸鱼兽赢了 😏 点「重开」复仇，或「悔棋」重想');
      }
      return;
    }

    let empty = 0;
    for (let i = 0; i < GM_N; i++) for (let j = 0; j < GM_N; j++) if (gmBoard[i][j] === GM_EMPTY) empty++;
    if (empty === 0) { gmOver = true; gmSetStatus('平局！要不要再来一局？', true); return; }

    if (player === GM_BLACK) {
      gmTurn = GM_WHITE;
      gmPlayAI();
    } else {
      gmTurn = GM_BLACK;
      gmSetStatus('轮到你 · 点击落子', false);
    }
  }

  function gmOnClick(e) {
    if (gmOver || gmBusy || !gmBoard) return;
    if (gmTurn !== GM_BLACK) return;
    const p = gmPointFromEvent(e);
    if (!p || gmBoard[p.r][p.c] !== GM_EMPTY) return;
    gmPlace(p.r, p.c, GM_BLACK);
  }

  /* ---------- 悔棋 / 重开 ---------- */
  function gmUndo() {
    if (!gmHistory.length || gmBusy) return;
    // 若最后一手是 AI，则连同玩家上一手一起撤，保证回合仍归玩家
    const last = gmHistory[gmHistory.length - 1];
    const steps = (last.p === GM_WHITE && gmHistory.length >= 2) ? 2 : 1;
    for (let i = 0; i < steps; i++) {
      const m = gmHistory.pop();
      if (m) gmBoard[m.r][m.c] = GM_EMPTY;
    }
    gmLast = gmHistory.length
      ? { r: gmHistory[gmHistory.length - 1].r, c: gmHistory[gmHistory.length - 1].c }
      : null;
    gmOver = false;
    gmTurn = GM_BLACK;
    gmDraw();
    gmSetStatus('已悔棋 · 轮到你', false);
    gmHint('悔棋成功，重新落子吧～');
  }

  function gmRestart() {
    gmInit();
    gmPetSay('新的一局，这次我可要认真了！', 'excited');
  }

  /* ---------- 视图切换（聊天 / 五子棋 / 象棋） ---------- */
  function switchView(view) {
    const isGomoku = view === 'gomoku';
    const isXq = view === 'xiangqi';
    const isGame = isGomoku || isXq;
    const chat = $('chat-scroll'), bar = $('input-bar'), ps = $('pet-stage');
    if (chat) chat.style.display = isGame ? 'none' : '';
    if (bar) bar.style.display = isGame ? 'none' : '';
    if (ps) ps.style.display = isGame ? 'none' : ''; // 游戏视图下隐藏摸鱼兽卡片，避免抢戏
    const gv = $('gomoku-view');
    if (gv) gv.style.display = isGomoku ? 'flex' : 'none';
    const xv = $('xiangqi-view');
    if (xv) xv.style.display = isXq ? 'flex' : 'none';
    $('view-chat-btn').classList.toggle('on', !isGame);
    $('view-gomoku-btn').classList.toggle('on', isGomoku);
    $('view-xiangqi-btn').classList.toggle('on', isXq);
    if (isGomoku) {
      if (!gmBoard) gmInit();
      else gmDraw();
    }
    if (isXq) {
      if (!xqBoard) xqInit(xqPlayer);
      else { xqSizeCanvas(); xqRender(); }
    }
  }

  function gmSetMode(mode) {
    gmMode = mode;
    $('gm-mode-local').classList.toggle('on', mode === 'local');
    $('gm-mode-llm').classList.toggle('on', mode === 'llm');
    gmHint(mode === 'llm'
      ? '大模型走棋：每次落子调用你配置的 API（较慢、消耗 token），失败自动兜底本地'
      : '本地引擎：秒回、免费、离线可用');
  }

  function gmSetDiff(diff) {
    gmDiff = diff;
    $('gm-diff-easy').classList.toggle('on', diff === 'easy');
    $('gm-diff-medium').classList.toggle('on', diff === 'medium');
    $('gm-diff-hard').classList.toggle('on', diff === 'hard');
  }

  function gmSetStatus(text, isWin) {
    const el = $('gomoku-status');
    if (el) { el.textContent = text; el.classList.toggle('win', !!isWin); }
  }

  function gmHint(text) {
    const el = $('gomoku-hint');
    if (el) el.textContent = text;
  }

  // 让摸鱼兽说话（气泡区）
  function gmPetSay(text, face) {
    const motto = $('pet-motto');
    if (motto) motto.textContent = '「' + text + '」';
    try { petFace(face || 'idle'); } catch {}
  }

  /* ============================================================
   * 中国象棋：9×10 棋盘 · 本地规则引擎(XQ) · 大模型走棋 · 悔棋/重开/和棋
   * 引擎来自同隔离世界的 window.XQ（由 xiangqi.js content_script 注入）。
   * ============================================================ */
  const XQ = (typeof window !== 'undefined' && window.XQ) ? window.XQ : null;
  const XQ_LETTERS = 'ABCDEFGHI';
  function xqCoord(r, c) { return XQ_LETTERS[c] + (r + 1); }
  function xqMoveStr(m) { return xqCoord(m.fr, m.fc) + xqCoord(m.tr, m.tc); }

  let xqBoard = null;
  let xqTurn = 'r';        // 当前该谁走（红先）
  let xqPlayer = 'r';      // 人类执子：'r' 红（默认先手）/ 'b' 黑
  let xqOver = false;
  let xqBusy = false;
  let xqMode = 'local';    // local | llm
  let xqDiff = 'medium';    // easy | medium | hard
  let xqHistory = [];      // 悔棋快照（落子前的棋盘 + 当时轮到谁）
  let xqRep = {};          // 局面重复计数（boardKey -> 次数）
  let xqNoCapture = 0;     // 连续无吃子手数（和棋判定）
  let xqSelected = null;   // 当前选中的己方棋子 {r,c}
  let xqDests = [];        // 选中棋子的合法落点 [{r,c}]
  let xqLast = null;       // 最后一手，用于标记
  let xqCell = 28, xqPad = 14;

  function xqInit(player) {
    if (!XQ) { xqStatus('象棋引擎未加载', false); xqHint('请刷新扩展后重试'); return; }
    xqPlayer = player || 'r';
    xqBoard = XQ.initialBoard();
    xqTurn = 'r';
    xqOver = false; xqBusy = false;
    xqHistory = []; xqNoCapture = 0; xqSelected = null; xqDests = []; xqLast = null;
    xqRep = {}; const k0 = XQ.boardKey(xqBoard, 'r'); xqRep[k0] = 1;
    xqSizeCanvas();
    xqRender();
    xqStatus(xqPlayer === 'r' ? '象棋 · 你执红先行' : '象棋 · 你执黑，摸鱼兽先走', false);
    xqHint('点己方棋子选中，再点目标格落子');
    if (xqPlayer === 'b') xqPlayAI();   // 执黑则 AI（红）先走
  }

  /* ---------- 画布自适应（随悬浮窗缩放重算格距） ---------- */
  function xqAvailW() {
    const wrap = $('xiangqi-canvas-wrap');
    if (!wrap) return 252;
    return Math.max(200, wrap.clientWidth - 16);
  }
  function xqSizeCanvas() {
    if (!XQ) return;
    const avail = xqAvailW();
    xqCell = Math.max(16, Math.min(34, Math.floor((avail - 2 * xqPad) / 8)));
    const cv = $('xiangqi-canvas');
    if (cv) { cv.width = xqPad * 2 + 8 * xqCell; cv.height = xqPad * 2 + 9 * xqCell; }
  }

  /* ---------- 绘制棋盘 ---------- */
  function xqRender() {
    if (!xqBoard) return;
    const cv = $('xiangqi-canvas'); if (!cv) return;
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    const C = xqCell, P = xqPad;
    ctx.clearRect(0, 0, W, H);
    // 整体透明度跟随玻璃（棋盘+棋子一起淡，保底看清能下）
    ctx.globalAlpha = gameAlpha;
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = 'rgba(0,0,0,0.38)'; ctx.lineWidth = 1;
    // 横线（10 条）
    for (let r = 0; r < 10; r++) {
      const y = P + r * C;
      ctx.beginPath(); ctx.moveTo(P, y); ctx.lineTo(P + 8 * C, y); ctx.stroke();
    }
    // 竖线：边线贯通，内线在楚河汉界断开
    for (let c = 0; c < 9; c++) {
      const x = P + c * C;
      if (c === 0 || c === 8) {
        ctx.beginPath(); ctx.moveTo(x, P); ctx.lineTo(x, P + 9 * C); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.moveTo(x, P); ctx.lineTo(x, P + 4 * C); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x, P + 5 * C); ctx.lineTo(x, P + 9 * C); ctx.stroke();
      }
    }
    // 九宫斜线
    ctx.beginPath();
    ctx.moveTo(P + 3 * C, P); ctx.lineTo(P + 5 * C, P + 2 * C);
    ctx.moveTo(P + 5 * C, P); ctx.lineTo(P + 3 * C, P + 2 * C);
    ctx.moveTo(P + 3 * C, P + 7 * C); ctx.lineTo(P + 5 * C, P + 9 * C);
    ctx.moveTo(P + 5 * C, P + 7 * C); ctx.lineTo(P + 3 * C, P + 9 * C);
    ctx.stroke();
    // 楚河汉界
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.font = 'italic ' + Math.round(C * 0.5) + 'px serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('楚 河', P + 2 * C, P + 4.5 * C);
    ctx.fillText('漢 界', P + 6 * C, P + 4.5 * C);

    // 选中标记 + 合法落点（柔化为低调灰蓝，像网页 hover 提示而不是游戏高亮）
    if (xqSelected) {
      ctx.strokeStyle = 'rgba(70,120,220,0.55)'; ctx.lineWidth = 1.2;
      ctx.strokeRect(P + xqSelected.c * C - C * 0.5 + 1, P + xqSelected.r * C - C * 0.5 + 1, C - 2, C - 2);
    }
    if (xqSelected && xqDests.length) {
      ctx.strokeStyle = 'rgba(70,120,220,0.45)'; ctx.lineWidth = 1.2;
      for (const d of xqDests) {
        ctx.beginPath(); ctx.arc(P + d.c * C, P + d.r * C, C * 0.14, 0, Math.PI * 2); ctx.stroke();
      }
    }
    // 棋子
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 9; c++) {
        const p = xqBoard[r][c]; if (!p) continue;
        const x = P + c * C, y = P + r * C, rad = C * 0.42;
        const g = ctx.createRadialGradient(x - rad * 0.3, y - rad * 0.3, rad * 0.1, x, y, rad);
        if (p.c === 'r') { g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#ffe2e2'); }
        else { g.addColorStop(0, '#f3f3f5'); g.addColorStop(1, '#cdcdd5'); }
        ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = p.c === 'r' ? 'rgba(170,60,50,0.55)' : 'rgba(40,40,60,0.55)';
        ctx.stroke();
        ctx.fillStyle = p.c === 'r' ? '#a04545' : '#1d1d1f';
        ctx.font = '700 ' + Math.round(C * 0.5) + 'px "PingFang SC","Microsoft YaHei",serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(XQ.CN[p.c][p.t], x, y + 1);
      }
    }
    // 最后一手标记（柔化蓝圈）
    if (xqLast) {
      const x = P + xqLast.c * C, y = P + xqLast.r * C;
      ctx.strokeStyle = 'rgba(70,120,220,0.45)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(x, y, C * 0.46, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1; // 恢复，避免影响后续绘制
  }

  /* ---------- 坐标换算 / 点击落子 ---------- */
  function xqPointFromEvent(e) {
    const cv = $('xiangqi-canvas'); if (!cv) return null;
    const rect = cv.getBoundingClientRect();
    const c = Math.round((e.clientX - rect.left - xqPad) / xqCell);
    const r = Math.round((e.clientY - rect.top - xqPad) / xqCell);
    if (r < 0 || r > 9 || c < 0 || c > 8) return null;
    return { r, c };
  }
  function xqClick(e) {
    if (xqOver || xqBusy || !xqBoard) return;
    if (xqTurn !== xqPlayer) return;       // 不是你的回合
    const p = xqPointFromEvent(e); if (!p) return;
    const piece = xqBoard[p.r][p.c];
    if (xqSelected) {
      const mv = xqDests.find(d => d.r === p.r && d.c === p.c);
      if (mv) { xqDoMove({ fr: xqSelected.r, fc: xqSelected.c, tr: p.r, tc: p.c }); return; }
    }
    if (piece && piece.c === xqPlayer) {
      xqSelected = { r: p.r, c: p.c };
      xqDests = XQ.legalMoves(xqBoard, xqPlayer)
        .filter(m => m.fr === p.r && m.fc === p.c)
        .map(m => ({ r: m.tr, c: m.tc }));
      xqRender();
    } else {
      xqSelected = null; xqDests = []; xqRender();
    }
  }

  /* ---------- 执行一步棋 ---------- */
  function xqDoMove(move) {
    xqSelected = null; xqDests = [];
    const capBefore = xqBoard[move.tr][move.tc];
    const pre = { board: XQ.cloneBoard(xqBoard), turn: xqTurn };
    xqBoard = XQ.applyMove(xqBoard, move);
    xqHistory.push(pre);
    xqLast = { r: move.tr, c: move.tc };
    xqNoCapture = capBefore ? 0 : (xqNoCapture + 1);
    xqRender();

    const opp = (xqTurn === 'r') ? 'b' : 'r';
    const oppMoves = XQ.legalMoves(xqBoard, opp);
    if (oppMoves.length === 0) {
      xqOver = true;
      const youWin = (opp !== xqPlayer);
      xqStatus(youWin ? '🎉 将死！你赢了！' : '😏 你被将死了', true);
      xqPetSay(youWin ? '好家伙，你赢了！这局我服了～' : '将死你啦～再来一局？', youWin ? 'sleepy' : 'happy');
      xqHint(youWin ? '你赢了 🎉 点「重开」再来，或「悔棋」复盘' : '摸鱼兽赢了 😏 点「重开」复仇，或「悔棋」重想');
      return;
    }
    const key = XQ.boardKey(xqBoard, opp);
    xqRep[key] = (xqRep[key] || 0) + 1;
    if (xqRep[key] >= 3) { xqOver = true; xqStatus('三次重复局面 · 和棋', true); xqHint('和棋：同一局面出现三次'); return; }
    if (xqNoCapture >= 60) { xqOver = true; xqStatus('60 回合无吃子 · 和棋', true); xqHint('和棋：长时间无吃子'); return; }

    xqTurn = opp;
    if (xqTurn === xqPlayer) xqStatus('轮到你 · 点己方棋子落子', false);
    else xqPlayAI();
  }

  /* ---------- 本地 AI ---------- */
  function xqLocalMove() {
    if (!xqBoard) return null;
    return XQ.search(xqBoard, xqTurn, xqDiff);
  }

  /* ---------- 大模型走棋 ---------- */
  function xqPlayAI() {
    if (xqOver || xqBusy || !xqBoard) return;
    xqBusy = true;
    xqStatus(xqMode === 'llm' ? '摸鱼兽（大模型）思考中…' : '摸鱼兽思考中…', false);
    const cv = $('xiangqi-canvas'); if (cv) cv.style.cursor = 'default';
    const ai = xqTurn;
    const finishWith = (move, note) => {
      xqBusy = false; if (cv) cv.style.cursor = 'pointer';
      if (note) xqHint(note);
      if (!move) { xqOver = true; xqStatus('摸鱼兽无子可动 · 你赢了！', true); return; }
      xqDoMove({ fr: move.fr, fc: move.fc, tr: move.tr, tc: move.tc });
    };
    if (xqMode === 'llm') {
      const cfgP = (typeof CORE !== 'undefined' && CORE.loadConfig) ? CORE.loadConfig() : Promise.resolve(null);
      cfgP.then(c => {
        if (!c || !c.llmUrl || !c.llmKey || !c.petEnabled) {
          finishWith(xqLocalMove(), '未配置大模型，已自动用本地引擎'); return;
        }
        try {
          const legal = XQ.legalMoves(xqBoard, ai);
          const moveList = legal.map(xqMoveStr);
          chrome.runtime.sendMessage({
            type: 'xiangqi-move',
            board: XQ.toStr(xqBoard),
            moves: moveList,
            color: ai,
          }, (resp) => {
            let mv = null;
            if (resp && resp.ok && resp.move) {
              const m = XQ.parseCoord(resp.move);
              if (m && xqBoard[m.fr] && xqBoard[m.fr][m.fc] &&
                  xqBoard[m.fr][m.fc].c === ai &&
                  XQ.legalMoves(xqBoard, ai).some(l => l.fr === m.fr && l.fc === m.fc && l.tr === m.tr && l.tc === m.tc)) {
                mv = m;
              }
            }
            if (mv) finishWith(mv, '大模型走：' + xqMoveStr(mv));
            else finishWith(xqLocalMove(), (resp && resp.error ? ('大模型失败：' + resp.error) : '大模型未返回合法棋') + '，已用本地引擎兜底');
          });
        } catch { finishWith(xqLocalMove(), '大模型调用异常，已用本地引擎兜底'); }
      }).catch(() => finishWith(xqLocalMove()));
      return;
    }
    setTimeout(() => finishWith(xqLocalMove()), 300);
  }

  /* ---------- 悔棋 / 重开 / 设置 ---------- */
  function xqUndo() {
    if (!xqHistory.length || xqBusy) return;
    const lastPre = xqHistory[xqHistory.length - 1];
    // 若最后一手是 AI 走的，则连同玩家上一手一起撤，保证回合仍归玩家
    const steps = (lastPre.turn !== xqPlayer && xqHistory.length >= 2) ? 2 : 1;
    for (let i = 0; i < steps; i++) {
      const h = xqHistory.pop(); if (!h) break;
      xqBoard = XQ.cloneBoard(h.board); xqTurn = h.turn;
    }
    xqSelected = null; xqDests = []; xqLast = null;
    xqNoCapture = 0; xqRep = {}; const k0 = XQ.boardKey(xqBoard, xqTurn); xqRep[k0] = 1;
    xqOver = false; xqBusy = false;
    xqRender();
    xqStatus('已悔棋 · 轮到' + (xqTurn === xqPlayer ? '你' : '摸鱼兽'), false);
    xqHint('悔棋成功，重新走吧～');
  }
  function xqSetMode(m) {
    xqMode = m;
    $('xq-mode-local').classList.toggle('on', m === 'local');
    $('xq-mode-llm').classList.toggle('on', m === 'llm');
    xqHint(m === 'llm'
      ? '大模型走棋：每次调用你配置的 API（较慢、耗 token），失败自动兜底本地'
      : '本地引擎：秒回、免费、离线可用');
  }
  function xqSetDiff(d) {
    xqDiff = d;
    $('xq-diff-easy').classList.toggle('on', d === 'easy');
    $('xq-diff-medium').classList.toggle('on', d === 'medium');
    $('xq-diff-hard').classList.toggle('on', d === 'hard');
  }
  function xqSetPlayer(s) {
    xqPlayer = s;
    $('xq-side-r').classList.toggle('on', s === 'r');
    $('xq-side-b').classList.toggle('on', s === 'b');
    xqInit(s);
  }
  function xqStatus(t, win) {
    const el = $('xiangqi-status');
    if (el) { el.textContent = t; el.classList.toggle('win', !!win); }
  }
  function xqHint(t) {
    const el = $('xiangqi-hint');
    if (el) el.textContent = t;
  }
  function xqPetSay(t, face) {
    const m = $('pet-motto');
    if (m) m.textContent = '「' + t + '」';
    try { petFace(face || 'idle'); } catch {}
  }

  /* ---------- 悬浮窗缩放（右下角手柄） ---------- */
  function setupResize() {
    const handle = $('resize-handle');
    if (!handle) return;
    let resizing = false, sx = 0, sy = 0, sw = 0, sh = 0;
    handle.addEventListener('mousedown', (e) => {
      resizing = true; sx = e.clientX; sy = e.clientY;
      sw = panel.offsetWidth; sh = panel.offsetHeight;
      panel.style.transition = 'none';
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      e.preventDefault(); e.stopPropagation();
    });
    function onMove(e) {
      if (!resizing) return;
      const W = window.innerWidth, H = window.innerHeight;
      const w = Math.max(280, Math.min(W - 16, sw + (e.clientX - sx)));
      const h = Math.max(360, Math.min(H - 16, sh + (e.clientY - sy)));
      panel.style.width = w + 'px'; panel.style.height = h + 'px';
      if ($('xiangqi-view').style.display !== 'none') { xqSizeCanvas(); xqRender(); }
    }
    function onUp() {
      if (!resizing) return;
      resizing = false; panel.style.transition = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
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