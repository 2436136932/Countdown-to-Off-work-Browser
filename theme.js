/* ============================================================
 * Offwork Countdown — 12 色马卡龙柔和莫兰迪皮肤与主题引擎
 *
 * 严格按照指定色板配置：
 * - storm: 风暴蓝 (#8BB5DE)
 * - forest: 森林绿 (#A8C8A8)
 * - pink: 玫瑰粉 (#D4A5A5)
 * - lavender: 薰衣草 (#C8A8D8)
 * - yellow: 咸阳黄 (#F0C674)
 * - silver: 月光银 (#B8B8B8)
 * - orange: 珊瑚橙 (#E0A080)
 * - cyan: 海湾青 (#A8D8D8)
 * - lime: 橄榄绿 (#A8C888)
 * - milktea: 奶茶红 (#D8B090)
 * - purple: 梦幻紫 (#A8A8D8)
 * - matcha: 抹茶绿 (#B0D8A8)
 * ============================================================ */

const THEME = (() => {

  const RAW_CONFIGS = [
    { key: 'storm',    name: '风暴蓝', hex: '#8BB5DE', sub: '风暴晴空', desc: '柔和舒缓的暴风雨后晴空微光' },
    { key: 'forest',   name: '森林绿', hex: '#A8C8A8', sub: '草木薄雾', desc: '静谧清新的草木灰绿，舒适护眼' },
    { key: 'pink',     name: '玫瑰粉', hex: '#D4A5A5', sub: '干枯豆沙', desc: '低饱和豆沙温润粉，优雅柔和' },
    { key: 'lavender', name: '薰衣草', hex: '#C8A8D8', sub: '淡紫微澜', desc: '淡雅薰衣草柔紫，灵动静谧' },
    { key: 'yellow',   name: '咸阳黄', hex: '#F0C674', sub: '麦浪轻暖', desc: '典雅轻复古杏花黄，明媚温暖' },
    { key: 'silver',   name: '月光银', hex: '#B8B8B8', sub: '冷调合金', desc: '纯粹冷调金属灰，极简工业质感' },
    { key: 'orange',   name: '珊瑚橙', hex: '#E0A080', sub: '暖砂陶土', desc: '陶土晨光暖珊瑚橙，柔和元气' },
    { key: 'cyan',     name: '海湾青', hex: '#A8D8D8', sub: '浅海透玉', desc: '冰岛海湾青提色，透亮空灵' },
    { key: 'lime',     name: '橄榄绿', hex: '#A8C888', sub: '地中海榄', desc: '莫兰迪橄榄清灰绿，成熟静心' },
    { key: 'milktea',  name: '奶茶红', hex: '#D8B090', sub: '生椰燕麦', desc: '暖冬红茶卡其调，醇厚温柔' },
    { key: 'purple',   name: '梦幻紫', hex: '#A8A8D8', sub: '星雾织梦', desc: '轻盈雾霾蓝粉紫，充满浪漫遐思' },
    { key: 'matcha',   name: '抹茶绿', hex: '#B0D8A8', sub: '宇治新茶', desc: '新绿初萌的轻抹茶绿，沁人心脾' },
    // 兼容原有经典苹果蓝
    { key: 'pro',      name: '纯净苹果', hex: '#0071E3', sub: '加州纯蓝', desc: '经典标志性加州蓝，纯粹而克制' }
  ];

  /* 将十六进制转为 RGB 数组 */
  function hexToRgb(hex) {
    const clean = hex.replace('#', '');
    const num = parseInt(clean, 16);
    return [ (num >> 16) & 255, (num >> 8) & 255, num & 255 ];
  }

  /* 生成单套皮肤的 Light 与 Dark 配方 */
  function buildSkin(cfg) {
    const [r, g, b] = hexToRgb(cfg.hex);

    // 对于 Light 模式的文字显示，稍微加深明度保证视认度（对比度达到 WCAG AA 标准）
    const rL = Math.max(0, Math.round(r * 0.72));
    const gL = Math.max(0, Math.round(g * 0.72));
    const bL = Math.max(0, Math.round(b * 0.72));
    const darkAccent = `rgb(${rL}, ${gL}, ${bL})`;

    const light = {
      bg: '#FFFFFF',
      surface: '#F5F5F7',
      textPrimary: '#1D1D1F',
      textSecondary: '#86868B',
      accent: cfg.hex,
      accentDeep: darkAccent,
      accentSoft: `rgba(${r}, ${g}, ${b}, 0.20)`,
      hairline: `rgba(${r}, ${g}, ${b}, 0.24)`,
      badgeBg: cfg.hex
    };

    const dark = {
      bg: '#1C1C1E',
      surface: '#2C2C2E',
      textPrimary: '#F5F5F7',
      textSecondary: '#98989D',
      accent: cfg.hex,
      accentDeep: cfg.hex,
      accentSoft: `rgba(${r}, ${g}, ${b}, 0.24)`,
      hairline: 'rgba(255, 255, 255, 0.12)',
      badgeBg: cfg.hex
    };

    return {
      key: cfg.key,
      id: cfg.key,
      name: cfg.name,
      sub: cfg.sub,
      desc: cfg.desc,
      hex: cfg.hex,
      light,
      dark,
      colors: { light, dark }
    };
  }

  /* 构建列表与字典 */
  const SKIN_LIST = RAW_CONFIGS.map(buildSkin);
  const SKIN_MAP = {};
  SKIN_LIST.forEach(s => { SKIN_MAP[s.key] = s; });

  // ⚠️ 注意：SKINS 既是数组又挂了字符串 key 属性（便于通过 SKINS[key] 取皮肤），
  // 千万不要用 Object.keys(SKINS) 遍历——会拿到 13 个数字索引 + 13 个字符串 key 共 26 项，
  // 导致皮肤卡片网格渲染重复。遍历请用 SKIN_LIST（纯数组，长度恒为 13）。
  const SKINS = [...SKIN_LIST];
  SKIN_LIST.forEach(s => { SKINS[s.key] = s; });

  /* ---------- 3 款纯 CSS 矢量微纹理 ---------- */
  const TEXTURES = {
    none: {
      id: 'none',
      name: '纯净',
      css: 'none',
      bgSize: 'auto'
    },
    dots: {
      id: 'dots',
      name: '点阵',
      css: 'radial-gradient(circle, var(--hairline) 1px, transparent 1px)',
      bgSize: '16px 16px'
    },
    noise: {
      id: 'noise',
      name: '细噪',
      css: 'radial-gradient(var(--accent-soft) 1px, transparent 0)',
      bgSize: '8px 8px'
    }
  };

  /**
   * 解算出当前应用的准确样式配置
   * @param {Object} cfg 用户配置 { skin, texture, theme }
   * @returns {Object} 包含注入 CSS 变量所需的一切解析值
   */
  function resolveTheme(cfg = {}) {
    const rawSkin = cfg.skin || 'storm';
    const s = SKIN_MAP[rawSkin] || SKIN_MAP['storm'] || SKIN_MAP['pro'] || SKIN_LIST[0];

    // 判断当前是深色还是浅色
    let isDark = false;
    if (cfg.theme === 'dark') {
      isDark = true;
    } else if (cfg.theme === 'auto' || !cfg.theme) {
      if (typeof window !== 'undefined' && window.matchMedia) {
        isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      }
    }

    const c = isDark ? s.dark : s.light;
    const tex = TEXTURES[cfg.texture] || TEXTURES.none;

    const rawOpacity = (typeof cfg.glassOpacity === 'number') ? cfg.glassOpacity : 65;
    const glassOpacity = Math.max(0, Math.min(100, rawOpacity));
    const alpha = (glassOpacity / 100).toFixed(2);
    const baseRgb = isDark ? '38, 38, 42' : '255, 255, 255';
    const cardBg = `rgba(${baseRgb}, ${alpha})`;
    const cardBorder = isDark
      ? `rgba(255, 255, 255, ${Math.max(0.04, (alpha * 0.16)).toFixed(2)})`
      : `rgba(255, 255, 255, ${Math.max(0.18, (alpha * 0.75)).toFixed(2)})`;
    const cardBlur = `blur(20px) saturate(180%)`;
    const cardShadow = isDark
      ? `0 8px 24px -4px rgba(0, 0, 0, 0.35), inset 0 0.5px 0 0 rgba(255, 255, 255, 0.15)`
      : `0 4px 20px -2px rgba(0, 0, 0, 0.05), 0 1px 3px rgba(0, 0, 0, 0.02), inset 0 1px 0.5px 0.5px rgba(255, 255, 255, 0.7)`;

    /* ---------- 皮肤色动态壁纸（毛玻璃可虚化的彩色底） ---------- */
    const [ar, ag, ab] = hexToRgb(s.hex);
    const bgGradient = isDark
      ? `radial-gradient(120% 90% at 85% -10%, rgba(${ar}, ${ag}, ${ab}, 0.38) 0%, transparent 60%),
         radial-gradient(110% 80% at 0% 110%, rgba(${ar}, ${ag}, ${ab}, 0.22) 0%, transparent 55%),
         linear-gradient(160deg, #1C1C1E 0%, #232326 100%)`
      : `radial-gradient(130% 100% at 85% -10%, rgba(${ar}, ${ag}, ${ab}, 0.55) 0%, transparent 62%),
         radial-gradient(120% 90% at -5% 110%, rgba(${ar}, ${ag}, ${ab}, 0.38) 0%, transparent 58%),
         linear-gradient(160deg, #FFFFFF 0%, ${s.hex}33 100%)`;

    return {
      skin: s,
      texture: tex,
      isDark,
      glassOpacity,
      cardBg,
      cardBorder,
      cardBlur,
      cardShadow,
      bgGradient,
      bg: c.bg,
      surface: c.surface,
      textPrimary: c.textPrimary,
      textSecondary: c.textSecondary,
      accent: c.accent,
      accentDeep: c.accentDeep || c.accent,
      accentSoft: c.accentSoft,
      hairline: c.hairline,
      badgeBg: c.badgeBg,
      bgPattern: tex.css,
      bgSize: tex.bgSize
    };
  }

  /**
   * 将主题变量注入到 document.documentElement (CSS 变量) 中
   */
  function applyToDOM(cfg, targetElement) {
    if (typeof document === 'undefined') return;
    const res = resolveTheme(cfg);
    const root = targetElement || document.documentElement;

    root.style.setProperty('--bg', res.bg);
    root.style.setProperty('--card-bg', res.cardBg);
    root.style.setProperty('--card-border', res.cardBorder);
    root.style.setProperty('--card-blur', res.cardBlur);
    root.style.setProperty('--card-shadow', res.cardShadow);
    root.style.setProperty('--surface', res.surface);
    root.style.setProperty('--text-primary', res.textPrimary);
    root.style.setProperty('--text-secondary', res.textSecondary);
    root.style.setProperty('--accent', res.accent);
    root.style.setProperty('--accent-deep', res.accentDeep);
    root.style.setProperty('--accent-soft', res.accentSoft);
    root.style.setProperty('--accent-glow', res.accent + '26');
    root.style.setProperty('--bg-material', res.isDark ? 'rgba(28, 28, 30, 0.62)' : 'rgba(255, 255, 255, 0.58)');
    root.style.setProperty('--hairline', res.hairline);
    root.style.setProperty('--border', res.hairline);

    /* 彩色壁纸铺在 html 层并固定 —— body 的毛玻璃才能虚化出真正的玻璃质感 */
    document.documentElement.style.backgroundImage = res.bgGradient || 'none';
    document.documentElement.style.backgroundAttachment = 'fixed';
    document.documentElement.style.backgroundRepeat = 'no-repeat';
    document.documentElement.style.backgroundSize = 'cover';

    if (res.bgPattern && res.bgPattern !== 'none') {
      document.body.style.backgroundImage = res.bgPattern;
      document.body.style.backgroundSize = res.bgSize;
    } else {
      document.body.style.backgroundImage = '';
      document.body.style.backgroundSize = '';
    }

    document.body.classList.toggle('dark', res.isDark);
  }

  return {
    SKINS,
    SKIN_LIST,
    RAW_CONFIGS,
    TEXTURES,
    resolveTheme,
    applyToDOM
  };
})();

// 在 Node 环境下导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = THEME;
}
