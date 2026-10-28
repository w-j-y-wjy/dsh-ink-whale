/*
 * dsh-ink-whale — 手写开屏引擎（共享源）。
 *
 * 这是一个普通脚本片段，没有 import / export：构建脚本把它和数据块
 * （DSHIW_FONTS / DSHIW_WHALE_PATH / DSHIW_WORDMARK_PATHS / DSHIW_WHALE_N /
 * DSHIW_WHALE_PTS）一起拼进浏览器半，或拼进独立演示页。它只负责画，不读
 * 配置、不写存储、不注册 slot：字体/文字/深浅都由调用方算好后传进来。
 *
 * 引擎是从项目原 template.html 里那套已验证的动画原样移植的：
 *   - 真实笔顺：每个字按笔画骨架逐笔写出，笔间有提笔停顿；
 *   - 每帧只重绘新写出的脏矩形，墨迹发光用叠层加宽描边而不是模糊滤镜；
 *   - 鲸鱼轮廓点、字标路径、7+1 套笔画数据都是构建期内嵌的，零网络。
 */
var DSHIW_THEMES = {
  dark: {
    css: {
      bg: '#000', sub: '#AEC1E2',
      'halo-bg': 'radial-gradient(circle at 50% 50%,rgba(62,104,255,.19) 0%,rgba(40,72,210,.075) 30%,rgba(20,40,120,.025) 48%,rgba(0,0,0,0) 66%)',
      hint: '#5d6f8f'
    },
    ink: { stops: [[0, '#F2F7FF'], [.55, '#DCE9FF'], [1, '#B4CBF5']], glow: '#6E9BFF', glowSteps: [[.17, .10], [.10, .15], [.045, .22]] },
    whale: {
      fill: [[0, '#B4CCFF'], [.42, '#7E9CFF'], [.78, '#5C77FA'], [1, '#4A60EA']],
      rimWide: '#5C8DFF',
      rim: [[0, '#EAF2FF'], [.5, '#A9C6FF'], [1, '#7C9BFF']]
    },
    word: [[0, '#FFFFFF'], [.62, '#EDF3FF'], [1, '#D3E0FF']],
    pen: { halo: ['96,142,255', '70,118,255', '50,80,220'], core: ['255,255,255', '224,238,255', '150,190,255'], dot: '255,255,255' },
    outline: { wide: '150,185,255', core: '242,248,255' },
    sample: '#B9CCEC'
  },
  light: {
    css: {
      bg: '#ffffff', sub: '#7f8287',
      'halo-bg': 'radial-gradient(circle at 50% 50%,rgba(57,100,254,.10) 0%,rgba(57,100,254,.045) 32%,rgba(57,100,254,.015) 50%,rgba(255,255,255,0) 68%)',
      hint: '#a2a4a6'
    },
    ink: { stops: [[0, '#4A4A52'], [.55, '#3C3C43'], [1, '#283142']], glow: '#C7D7FE', glowSteps: [[.12, .05], [.07, .06], [.03, .08]] },
    whale: {
      fill: [[0, '#B7C8FE'], [.42, '#679EFE'], [.78, '#5686FE'], [1, '#3964FE']],
      rimWide: '#B7C8FE',
      rim: [[0, '#EDF3FE'], [.5, '#93C5FD'], [1, '#3964FE']]
    },
    word: [[0, '#3964FE'], [.62, '#3964FE'], [1, '#5686FE']],
    pen: { halo: ['57,100,254', '103,158,254', '183,200,254'], core: ['57,100,254', '86,134,254', '183,200,254'], dot: '57,100,254' },
    outline: { wide: '103,158,254', core: '57,100,254' },
    sample: '#3C3C43'
  }
};

var DSHIW_FALLBACK_STACK = '"KaiTi","STKaiti","Kaiti SC","Segoe UI","Microsoft YaHei","Noto Sans SC",sans-serif';

/* 全部样式带 dshiw- 前缀，注入一次，卸载时移除。 */
/* 结束交接：只让鲸鱼缓慢推近，整屏随之渐隐；主界面不做位移动画，它就藏在
   开屏后面，靠这一层淡出自然浮出来。时长和缓动只在这里改。
   DSHIW_HANDOFF_BLUR > 0 时鲸鱼推近会带轻微失焦；全屏 / 分区模糊是最容易
   掉帧的一项，默认关掉，只保留纯 transform + opacity（走合成器，最稳）。 */
var DSHIW_HANDOFF_MS = 1500;
var DSHIW_HANDOFF_EASE = 'cubic-bezier(.45,0,.25,1)';
var DSHIW_HANDOFF_BLUR = 0;
var DSHIW_HANDOFF_CSS = (DSHIW_HANDOFF_MS / 1000) + 's ' + DSHIW_HANDOFF_EASE;
var DSHIW_WHALE_BLUR_IN = DSHIW_HANDOFF_BLUR > 0 ? ';filter:blur(0)' : '';
var DSHIW_WHALE_BLUR_OUT = DSHIW_HANDOFF_BLUR > 0 ? ';filter:blur(' + DSHIW_HANDOFF_BLUR + 'px)' : '';
var DSHIW_WHALE_WILL = DSHIW_HANDOFF_BLUR > 0 ? 'transform,filter' : 'transform';

var DSHIW_CSS = [
  '.dshiw-root{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;overflow:hidden;',
  'pointer-events:auto;z-index:2147483000;will-change:opacity;cursor:default;',
  'font-family:inherit;-webkit-font-smoothing:antialiased}',
  '.dshiw-root *{box-sizing:border-box}',
  '.dshiw-root--inline{position:absolute;inset:0;z-index:1}',
  '.dshiw-stage{position:relative;flex:none;width:1920px;height:1080px;overflow:hidden;transform-origin:50% 50%}',
  '.dshiw-halo{position:absolute;left:50%;top:46%;width:1250px;height:1250px;margin:-625px 0 0 -625px;border-radius:50%;',
  'opacity:0;will-change:transform,opacity}',
  '.dshiw-ink{position:absolute;left:0;top:0;width:1920px;height:1080px;will-change:opacity,transform}',
  '.dshiw-lockup{position:absolute;left:0;top:0;width:1920px;height:1080px;overflow:visible}',
  '.dshiw-caption{position:absolute;left:0;top:688px;width:1920px;text-align:center;font-size:29px;font-weight:300;',
  'font-family:"PingFang SC","Microsoft YaHei","Noto Sans SC",sans-serif;',
  'letter-spacing:.42em;text-indent:.42em;opacity:0;white-space:nowrap;will-change:opacity,transform}',
  '.dshiw-skip{position:absolute;left:0;right:0;bottom:34px;text-align:center;font-size:12px;letter-spacing:.18em;',
  'font-family:"PingFang SC","Microsoft YaHei","Noto Sans SC",sans-serif;',
  'opacity:0;pointer-events:none;transition:opacity .55s ease}',
  '.dshiw-skip.is-visible{opacity:.62}',
  /* 结束交接：只有鲸鱼这一个 SVG 分组做缩放/失焦，整屏只做 opacity 渐隐。
     鲸鱼单独包了一层 .dshiw-whale-zoom：外面那层 .dshiw-whale-anim 上跑着
     摆尾 / 起伏的 SVG transform 属性，CSS 变换会覆盖它；单独一层互不打架。
     不给任何宿主节点加 transform，主界面就静静地待在下面，由开屏淡出带出来。 */
  '.dshiw-root.dshiw-handoff{animation:dshiw-splash-out ' + (DSHIW_HANDOFF_MS / 1000) + 's linear forwards;pointer-events:none}',
  '@keyframes dshiw-splash-out{0%{opacity:1}22%{opacity:1}100%{opacity:0}}',
  '.dshiw-whale-zoom{transform-box:fill-box;transform-origin:50% 50%}',
  '.dshiw-root.dshiw-handoff .dshiw-whale-zoom{animation:dshiw-whale-zoom ' + DSHIW_HANDOFF_CSS + ' forwards;',
  'will-change:' + DSHIW_WHALE_WILL + '}',
  '@keyframes dshiw-whale-zoom{0%{transform:scale(1)' + DSHIW_WHALE_BLUR_IN + '}',
  '100%{transform:scale(1.25)' + DSHIW_WHALE_BLUR_OUT + '}}',
  '@media (prefers-reduced-motion: reduce){',
  '.dshiw-skip{transition:none}',
  '.dshiw-root.dshiw-handoff{animation:none;opacity:0;transition:opacity .24s ease}',
  '.dshiw-root.dshiw-handoff .dshiw-whale-zoom{animation:none}',
  '}'
].join('');

var DSHIW_UID = 0;

function dshiwClamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function dshiwLerp(a, b, t) { return a + (b - a) * t; }
function dshiwSmooth(a, b, x) { var t = dshiwClamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
function dshiwEaseOut(x) { return 1 - Math.pow(1 - x, 3); }
function dshiwEaseInOut(x) { return -(Math.cos(Math.PI * x) - 1) / 2; }
function dshiwNewBox() { return { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 }; }
function dshiwGrow(box, x, y, p) {
  if (x - p < box.x0) box.x0 = x - p;
  if (x + p > box.x1) box.x1 = x + p;
  if (y - p < box.y0) box.y0 = y - p;
  if (y + p > box.y1) box.y1 = y + p;
}

/* ---------------- 手写排版 ----------------
 * 字体是笔画数据库：glyph -> strokes of [x,y,brushWidth] points
 * （em 单位，y 向下，y=0 是基线）。
 */
function dshiwBorrowGlyph(ch, fonts, fontKeys) {
  for (var i = 0; i < fontKeys.length; i++) {
    var k = fontKeys[i];
    var g = fonts[k].g[ch];
    if (g) return { g: g, u: fonts[k].u };
  }
  return null;
}

function dshiwLayoutEm(text, fontKey, fonts, fontKeys) {
  var f = fonts[fontKey];
  var x = 0, minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  var items = [];
  for (var ci = 0; ci < text.length; ci++) {
    var ch = text[ci];
    if (ch === ' ') { x += 0.30; continue; }
    var g = f.g[ch], gu = f.u;
    if (!g) {
      var alt = dshiwBorrowGlyph(ch, fonts, fontKeys);
      if (alt) { g = alt.g; gu = alt.u; }
    }
    if (!g) {
      var cjk = ch.codePointAt(0) > 0x2e80;
      var fw = cjk ? 1.0 : 0.62, fh = cjk ? 1.0 : 0.78;
      items.push({ fb: ch, x: x, fw: fw, fh: fh });
      if (x < minX) minX = x;
      if (x + fw > maxX) maxX = x + fw;
      if (-fh * 0.95 < minY) minY = -fh * 0.95;
      if (0.12 > maxY) maxY = 0.12;
      x += fw;
      continue;
    }
    var inv = 1 / gu;
    for (var si = 0; si < g.s.length; si++) {
      var flat = g.s[si];
      var pts = [];
      for (var i = 0; i < flat.length; i += 3) {
        var X = x + flat[i] * inv, Y = flat[i + 1] * inv, Wd = Math.max(flat[i + 2] * inv, 0.008);
        pts.push([X, Y, Wd]);
        if (X < minX) minX = X;
        if (X > maxX) maxX = X;
        if (Y < minY) minY = Y;
        if (Y > maxY) maxY = Y;
      }
      items.push({ pts: pts });
    }
    x += g.w * inv;
  }
  if (minX > maxX) { minX = 0; maxX = Math.max(x, 0.3); minY = -0.8; maxY = 0.2; }
  return { items: items, width: x, minX: minX, maxX: maxX, minY: minY, maxY: maxY };
}

function dshiwDrawBandsStroked(c, pts) {
  var lx = pts[0][0], ly = pts[0][1];
  for (var i = 1; i < pts.length; i++) {
    c.lineWidth = Math.max(0.8, (pts[i][2] + pts[i - 1][2]) / 2);
    c.beginPath(); c.moveTo(lx, ly); c.lineTo(pts[i][0], pts[i][1]); c.stroke();
    lx = pts[i][0]; ly = pts[i][1];
  }
}

/**
 * 在任意 canvas 上画一行手写示例（设置页预览 / 字体 chip 用）。
 * 只画有笔画数据的字；缺字（中文等）会留白，避免用系统字体破坏手写观感。
 */
function dshiwDrawSample(canvas, text, fontKey, px, color, fitW, fitH) {
  var fonts = DSHIW_FONTS;
  var fontKeys = Object.keys(fonts);
  var f = fonts[fontKey] || fonts[fontKeys[0]];
  var key = fonts[fontKey] ? fontKey : fontKeys[0];
  var c = canvas.getContext('2d');
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, canvas.width, canvas.height);
  if (!text) return;
  var L = dshiwLayoutEm(text, key, fonts, fontKeys);
  var wEm = Math.max(0.02, L.maxX - L.minX), hEm = Math.max(0.02, L.maxY - L.minY);
  var s = px || Math.min(fitW ? fitW / wEm : 1e9, fitH ? fitH / hEm : 1e9);
  if (fitW && wEm * s > fitW) s = fitW / wEm;
  if (fitH && hEm * s > fitH) s = Math.min(s, fitH / hEm);
  var ox = (canvas.width - (L.minX + L.maxX) * s) / 2;
  var oy = (canvas.height - (L.minY + L.maxY) * s) / 2;
  c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = color || '#283142';
  for (var i = 0; i < L.items.length; i++) {
    var it = L.items[i];
    if (it.fb) continue;
    var pts = [];
    for (var j = 0; j < it.pts.length; j++) {
      var p = it.pts[j];
      pts.push([ox + p[0] * s, oy + p[1] * s, Math.max(p[2] * s, 0.8)]);
    }
    dshiwDrawBandsStroked(c, pts);
  }
  return { scale: s, width: wEm * s };
}

/**
 * 创建一次开屏实例。
 *
 * @param {HTMLElement} host 挂载点（会被清空一次，引擎把 stage 塞进去）
 * @param {object} options
 *   text      最终要写的文字（调用方已替换 {name}、已 trim）
 *   font      字体 key（DSHIW_FONTS 的键）
 *   theme     'dark' | 'light'
 *   caption   终帧副标题，空串表示不显示
 *   skipLabel 底部跳过提示文案
 *   hold      终帧停留秒数（默认 2.0）
 *   onDone    淡出结束后的回调
 * @returns {{start:Function,destroy:Function,skip:Function,seek:Function,info:Function}}
 */
function dshiwCreateSplash(host, options) {
  var opts = options || {};
  var fonts = DSHIW_FONTS;
  var fontKeys = Object.keys(fonts);
  var W = 1920, H = 1080;
  var DPR = Math.min(1.5, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
  var MAX_TEXT_W = 1400, MIN_FONT = 52;
  var FALLBACK_STACK = DSHIW_FALLBACK_STACK;
  var themeKey = DSHIW_THEMES[opts.theme] ? opts.theme : 'dark';
  var THEME = DSHIW_THEMES[themeKey];
  var inline = !!opts.inline;
  var fontKey = fonts[opts.font] ? opts.font : fontKeys[0];
  var TEXT = String(opts.text == null ? '' : opts.text).trim();
  if (!TEXT) TEXT = 'DeepSeek';
  var CAPTION = String(opts.caption == null ? '' : opts.caption);
  var HOLD = typeof opts.hold === 'number' && isFinite(opts.hold) ? opts.hold : 2.0;
  /* 写完字就收场：跳过鲸鱼描边、上色、字标与副标题，直接淡出。 */
  var SKIP_WHALE = !!opts.skipWhale;
  /* 播放倍速：只压缩墙钟时间，时间轴本身仍是原单位，seek/测试不受影响。 */
  var SPEED = typeof opts.speed === 'number' && isFinite(opts.speed) ? dshiwClamp(opts.speed, 0.25, 4) : 1;
  var reduce = false;
  try { reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { reduce = false; }

  /* ---------------- DOM ---------------- */
  var uid = 'dshiw' + (++DSHIW_UID);
  var gradFill = uid + '-wf', gradRim = uid + '-wr', gradWord = uid + '-wm';
  var root = document.createElement('div');
  root.className = 'dshiw-root';
  if (inline) root.className += ' dshiw-root--inline';
  root.setAttribute('data-theme', themeKey);
  root.setAttribute('role', 'presentation');
  var wordPaths = '';
  for (var wi = 0; wi < DSHIW_WORDMARK_PATHS.length; wi++) {
    wordPaths += '<path d="' + DSHIW_WORDMARK_PATHS[wi] + '"/>';
  }
  root.innerHTML =
    '<div class="dshiw-stage">' +
      '<div class="dshiw-halo"></div>' +
      '<svg class="dshiw-lockup" viewBox="0 0 1920 1080" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
        '<defs>' +
          '<linearGradient id="' + gradFill + '" x1="0" y1="2" x2="21" y2="21" gradientUnits="userSpaceOnUse">' +
            '<stop offset="0" stop-color="#B4CCFF"/><stop offset=".42" stop-color="#7E9CFF"/>' +
            '<stop offset=".78" stop-color="#5C77FA"/><stop offset="1" stop-color="#4A60EA"/>' +
          '</linearGradient>' +
          '<linearGradient id="' + gradRim + '" x1="0" y1="2" x2="18" y2="20" gradientUnits="userSpaceOnUse">' +
            '<stop offset="0" stop-color="#EAF2FF"/><stop offset=".5" stop-color="#A9C6FF"/><stop offset="1" stop-color="#7C9BFF"/>' +
          '</linearGradient>' +
          '<linearGradient id="' + gradWord + '" x1="0" y1="0" x2="0" y2="1">' +
            '<stop offset="0" stop-color="#FFFFFF"/><stop offset=".62" stop-color="#EDF3FF"/><stop offset="1" stop-color="#D3E0FF"/>' +
          '</linearGradient>' +
        '</defs>' +
        '<g class="dshiw-lockup-g">' +
          '<g class="dshiw-whale-root" transform="translate(596,380)">' +
            '<g class="dshiw-whale-zoom">' +
              '<g class="dshiw-whale-anim">' +
                '<g transform="scale(12.766) translate(-0.163,-1.75)">' +
                  '<path class="dshiw-whale-fill" d="' + DSHIW_WHALE_PATH + '" fill="url(#' + gradFill + ')" fill-opacity="0"/>' +
                  '<path class="dshiw-rim-wide" d="' + DSHIW_WHALE_PATH + '" fill="none" stroke="#5C8DFF" stroke-width=".58" stroke-linejoin="round" stroke-linecap="round" opacity="0"/>' +
                  '<path class="dshiw-rim-core" d="' + DSHIW_WHALE_PATH + '" fill="none" stroke="url(#' + gradRim + ')" stroke-width=".13" stroke-linejoin="round" stroke-linecap="round" opacity="0"/>' +
                '</g>' +
              '</g>' +
            '</g>' +
          '</g>' +
          '<g class="dshiw-word" opacity="0" transform="translate(988,466) scale(3)">' +
            '<g fill="url(#' + gradWord + ')" transform="translate(-31,0)">' + wordPaths + '</g>' +
          '</g>' +
        '</g>' +
      '</svg>' +
      '<canvas class="dshiw-ink"></canvas>' +
      '<div class="dshiw-caption"></div>' +
      '<div class="dshiw-skip" aria-hidden="true"></div>' +
    '</div>';
  host.appendChild(root);

  var stage = root.querySelector('.dshiw-stage');
  var halo = root.querySelector('.dshiw-halo');
  var canvas = root.querySelector('.dshiw-ink');
  var ctx = canvas.getContext('2d');
  var lockupG = root.querySelector('.dshiw-lockup-g');
  var whaleAnim = root.querySelector('.dshiw-whale-anim');
  var whaleFill = root.querySelector('.dshiw-whale-fill');
  var rimWide = root.querySelector('.dshiw-rim-wide');
  var rimCore = root.querySelector('.dshiw-rim-core');
  var wordG = root.querySelector('.dshiw-word');
  var whaleFillGrad = root.querySelector('#' + gradFill);
  var whaleRimGrad = root.querySelector('#' + gradRim);
  var wmGrad = root.querySelector('#' + gradWord);
  var captionEl = root.querySelector('.dshiw-caption');
  var skipEl = root.querySelector('.dshiw-skip');
  captionEl.textContent = CAPTION;
  skipEl.textContent = String(opts.skipLabel == null ? '点击或按任意键跳过' : opts.skipLabel);
  if (inline) skipEl.style.display = 'none';

  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);

  var WHALE_X = 596, WHALE_Y = 380, WHALE_W = 340, WHALE_S = WHALE_W / 26.634;
  var WM_X = 988, WM_Y = 466, WM_SCALE = 3;
  var CENTER_DX = 960 - (WHALE_X + WHALE_W / 2);

  /* ---------------- 主题 ---------------- */
  function setStops(grad, stops) {
    if (!grad) return;
    var kids = grad.querySelectorAll('stop');
    for (var i = 0; i < stops.length; i++) {
      if (kids[i]) kids[i].setAttribute('stop-color', stops[i][1]);
    }
  }
  root.style.background = THEME.css.bg;
  captionEl.style.color = THEME.css.sub;
  skipEl.style.color = THEME.css.hint;
  halo.style.background = THEME.css['halo-bg'];
  setStops(whaleFillGrad, THEME.whale.fill);
  setStops(whaleRimGrad, THEME.whale.rim);
  setStops(wmGrad, THEME.word);
  if (rimWide) rimWide.setAttribute('stroke', THEME.whale.rimWide);

  /* ---------------- 舞台缩放 ----------------
     全屏用 window 尺寸；内嵌预览用挂载点自己的尺寸，监听 ResizeObserver。 */
  var resizeObserver = null;
  function viewportSize() {
    if (inline) {
      return {
        w: root.clientWidth || host.clientWidth || 640,
        h: root.clientHeight || host.clientHeight || 360
      };
    }
    return { w: window.innerWidth, h: window.innerHeight };
  }
  function fit() {
    var size = viewportSize();
    var s = Math.min(size.w / W, size.h / H);
    stage.style.transform = 'scale(' + s + ')';
  }
  if (inline && typeof ResizeObserver === 'function') {
    resizeObserver = new ResizeObserver(fit);
    resizeObserver.observe(root);
  }
  window.addEventListener('resize', fit);
  fit();

  /* ---------------- 离屏画布 ---------------- */
  var ink = document.createElement('canvas');
  ink.width = canvas.width; ink.height = canvas.height;
  var inkCtx = ink.getContext('2d');
  var mask = document.createElement('canvas');
  mask.width = canvas.width; mask.height = canvas.height;
  var maskCtx = mask.getContext('2d');
  maskCtx.setTransform(DPR, 0, 0, DPR, 0, 0);

  var whalePts = null, whaleJumps = null;
  var strokes = null, stTotal = 0, stCount = 0, writeDur = 4, inkPx = 150;
  var revLen = null, maskReset = true, revealedCost = 0;
  /* buildInkCanvas 是初始化里最重的一步（实测单次约 245ms）。
     buildText 只做排版与笔画数据，真正画离屏墨迹推迟到首帧之后，
     这样开屏背景能先亮起来，用户不用对着空屏等。 */
  var inkReady = false, inkArgs = null;

  /* ---------------- 时间轴 ---------------- */
  var T0 = 0.78, W_START = 1.0, W_END = 6.1, PEN_OUT = 6.62, FADE_S = 7.62, FADE_E = 8.42,
      D_START = 8.28, D_END = 10.34, FILL_S = 10.4, FILL_E = 11.24, RIM_S = 10.96, RIM_E = 11.5,
      WORD_S = 11.05, WORD_E = 11.95, SUB_S = 12.08, SUB_E = 12.98, HOP_S = 12.14, HOP_E = 13.02,
      HALO_E = 13.2, HALO_T = 12.4, SWAY_T = 11.9, SWAY_E = 13.4, END = 16.2, STOP_T = 15;

  function applyTimeline() {
    var dur = dshiwClamp(writeDur, 2.6, 6.4);
    W_START = 1.0; W_END = W_START + dur;
    PEN_OUT = W_END + 0.52;
    FADE_S = W_END + 1.52; FADE_E = FADE_S + 0.8;
    D_START = FADE_E - 0.14; D_END = D_START + 2.06;
    FILL_S = D_END + 0.06; FILL_E = FILL_S + 0.84;
    RIM_S = FILL_E - 0.28; RIM_E = RIM_S + 0.54;
    WORD_S = FILL_E - 0.19; WORD_E = WORD_S + 0.9;
    SUB_S = WORD_E + 0.13; SUB_E = SUB_S + 0.9;
    HOP_S = SUB_S + 0.06; HOP_E = HOP_S + 0.88;
    HALO_T = SUB_S + 0.32; HALO_E = SUB_E + 0.22;
    SWAY_T = HOP_S - 0.24; SWAY_E = HOP_E + 0.38;
    T0 = W_START - 0.22;
    END = SUB_E + 3.2;
    /* 跳过鲸鱼时，时间轴在「字迹淡出」那一刻就到头，render 不会再进鲸鱼分支。 */
    STOP_T = SKIP_WHALE ? FADE_E + 0.06 : SUB_E + HOLD;
    END = Math.min(END, STOP_T + 0.4);
  }

  /* ---------------- 笔画构建 ---------------- */
  function newLayer() {
    var k = document.createElement('canvas');
    k.width = ink.width; k.height = ink.height;
    var kc = k.getContext('2d');
    kc.setTransform(DPR, 0, 0, DPR, 0, 0);
    kc.lineCap = 'round'; kc.lineJoin = 'round';
    return { c: k, ctx: kc };
  }

  function drawBandsWide(c, pts, extra) {
    var lx = pts[0][0], ly = pts[0][1];
    for (var i = 1; i < pts.length; i++) {
      c.lineWidth = Math.max(1.1, (pts[i][2] + pts[i - 1][2]) / 2 + extra);
      c.beginPath(); c.moveTo(lx, ly); c.lineTo(pts[i][0], pts[i][1]); c.stroke();
      lx = pts[i][0]; ly = pts[i][1];
    }
  }

  function buildInkCanvas(L, ox, oy, px, fbs) {
    var glow = newLayer(), core = newLayer();
    var steps = [];
    for (var si = 0; si < THEME.ink.glowSteps.length; si++) {
      steps.push([THEME.ink.glowSteps[si][0] * px, THEME.ink.glowSteps[si][1]]);
    }
    for (var s = 0; s < steps.length; s++) {
      glow.ctx.globalAlpha = steps[s][1];
      glow.ctx.strokeStyle = THEME.ink.glow;
      for (var i = 0; i < strokes.length; i++) if (!strokes[i].fb) drawBandsWide(glow.ctx, strokes[i].pts, steps[s][0]);
    }
    glow.ctx.globalAlpha = 1;
    core.ctx.strokeStyle = '#fff';
    for (var j = 0; j < strokes.length; j++) if (!strokes[j].fb) drawBandsWide(core.ctx, strokes[j].pts, 0);
    if (fbs.length) {
      /* 非拉丁字符（中文等）没有笔画数据，只能走系统字体 fillText。
         发光不能用 strokeText 描一圈：glowSteps 是给「细笔画带」加的宽度，
         落到实心字形轮廓上会变成一圈又厚又硬的边框——换一台电脑换了兜底
         字体，这圈边框的形状和粗细就跟着变，看着像多了几条不搭的线。
         这里改成投影高斯晕开，宽度只跟字号相关，和字体无关。 */
      var layerGlow = glow, layerCore = core;
      layerGlow.ctx.font = px + 'px ' + FALLBACK_STACK;
      layerGlow.ctx.textBaseline = 'alphabetic'; layerGlow.ctx.textAlign = 'left';
      layerCore.ctx.font = px + 'px ' + FALLBACK_STACK;
      layerCore.ctx.textBaseline = 'alphabetic'; layerCore.ctx.textAlign = 'left';
      layerCore.ctx.fillStyle = '#fff';
      layerGlow.ctx.fillStyle = THEME.ink.glow;
      layerGlow.ctx.shadowColor = THEME.ink.glow;
      var halo = [[0.10 * px, 0.26], [0.22 * px, 0.14]];
      for (var t = 0; t < halo.length; t++) {
        layerGlow.ctx.globalAlpha = halo[t][1];
        layerGlow.ctx.shadowBlur = halo[t][0];
        for (var f = 0; f < fbs.length; f++) layerGlow.ctx.fillText(fbs[f].ch, fbs[f].x, fbs[f].y);
      }
      layerGlow.ctx.globalAlpha = 1;
      layerGlow.ctx.shadowBlur = 0;
      layerGlow.ctx.shadowColor = 'transparent';
      for (var g = 0; g < fbs.length; g++) layerCore.ctx.fillText(fbs[g].ch, fbs[g].x, fbs[g].y);
    }
    inkCtx.setTransform(DPR, 0, 0, DPR, 0, 0);
    inkCtx.clearRect(0, 0, W, H);
    inkCtx.save();
    inkCtx.globalCompositeOperation = 'lighter';
    inkCtx.drawImage(glow.c, 0, 0, W, H);
    inkCtx.restore();
    inkCtx.save();
    inkCtx.drawImage(core.c, 0, 0, W, H);
    inkCtx.globalCompositeOperation = 'source-in';
    var grad = inkCtx.createLinearGradient(0, oy - px * 0.95, 0, oy + px * 0.3);
    for (var q = 0; q < THEME.ink.stops.length; q++) grad.addColorStop(THEME.ink.stops[q][0], THEME.ink.stops[q][1]);
    inkCtx.fillStyle = grad;
    inkCtx.fillRect(0, 0, W, H);
    inkCtx.restore();
  }

  function buildText() {
    var L = dshiwLayoutEm(TEXT, fontKey, fonts, fontKeys);
    var wEm = Math.max(0.02, L.maxX - L.minX);
    var px = 150;
    if (wEm * px > MAX_TEXT_W) px = Math.floor(MAX_TEXT_W / wEm);
    else if (wEm * px < 980) px = Math.min(200, Math.round(1100 / wEm));
    px = dshiwClamp(px, MIN_FONT, 210);
    if (wEm * px > MAX_TEXT_W * 1.02) {
      var base = TEXT;
      var n = base.length;
      while (n > 6) {
        n--;
        TEXT = base.slice(0, n) + '…';
        L = dshiwLayoutEm(TEXT, fontKey, fonts, fontKeys);
        wEm = Math.max(0.02, L.maxX - L.minX);
        px = dshiwClamp(Math.floor(MAX_TEXT_W / wEm), MIN_FONT, 210);
        if (wEm * px <= MAX_TEXT_W * 1.02) break;
      }
    }
    inkPx = px;
    var ox = (W - (L.minX + L.maxX) * px) / 2;
    var oy = 536 - ((L.minY + L.maxY) * px) / 2;
    var list = [], fbs = [], total = 0;
    for (var ii = 0; ii < L.items.length; ii++) {
      var it = L.items[ii];
      if (it.fb) {
        var w = px * it.fw, h = px * it.fh, fx = ox + it.x * px;
        list.push({ pts: [[fx, oy - h * 0.45, h], [fx + w, oy - h * 0.45, h]], len: w, fb: true });
        total += w;
        fbs.push({ ch: it.fb, x: fx, y: oy, px: px });
        continue;
      }
      var pts = [];
      for (var pi = 0; pi < it.pts.length; pi++) {
        var p = it.pts[pi];
        pts.push([ox + p[0] * px, oy + p[1] * px, p[2] * px]);
      }
      var len = 0;
      for (var li = 1; li < pts.length; li++) len += Math.hypot(pts[li][0] - pts[li - 1][0], pts[li][1] - pts[li - 1][1]);
      list.push({ pts: pts, len: len });
      total += len;
    }
    for (var bi = 0; bi < list.length; bi++) {
      var s = list[bi];
      var bb = dshiwNewBox();
      for (var bj = 0; bj < s.pts.length; bj++) dshiwGrow(bb, s.pts[bj][0], s.pts[bj][1], s.pts[bj][2] * 0.5 + 2);
      s.bb = bb;
    }
    strokes = list;
    revLen = new Float32Array(list.length);
    stTotal = total;
    stCount = list.length;
    writeDur = dshiwClamp(total / (px * 2.15) + stCount * 0.035, 2.6, 6.4);
    maskReset = true;
    inkArgs = { L: L, ox: ox, oy: oy, px: px, fbs: fbs };
    inkReady = false;
  }

  /* 首帧之后的重量级初始化：把笔画光晕 / 本体刷进离屏画布。 */
  function buildInk() {
    if (inkReady || !inkArgs) return;
    buildInkCanvas(inkArgs.L, inkArgs.ox, inkArgs.oy, inkArgs.px, inkArgs.fbs);
    inkReady = true;
  }

  /* ---------------- 逐帧显影 ---------------- */
  function revealU(t) {
    var u = dshiwClamp((t - W_START) / (W_END - W_START), 0, 1);
    return 0.16 * u + 0.84 * dshiwEaseInOut(u);
  }
  function revealCost(t) { return t < W_START - 0.02 ? 0 : revealU(t) * (stTotal + inkPx * 0.10 * stCount); }

  function rangeBox(pts, from, to, box) {
    var acc = 0;
    for (var i = 1; i < pts.length; i++) {
      var dx = pts[i][0] - pts[i - 1][0], dy = pts[i][1] - pts[i - 1][1];
      var seg = Math.hypot(dx, dy) || 1e-6;
      var s0 = acc, s1 = acc + seg; acc = s1;
      if (s1 <= from) continue;
      if (s0 >= to) break;
      var f0 = s0 <= from ? (from - s0) / seg : 0;
      var f1 = s1 >= to ? (to - s0) / seg : 1;
      var w = (pts[i][2] + pts[i - 1][2]) / 2 * 0.5 + 2;
      dshiwGrow(box, pts[i - 1][0] + dx * f0, pts[i - 1][1] + dy * f0, w);
      dshiwGrow(box, pts[i - 1][0] + dx * f1, pts[i - 1][1] + dy * f1, w);
    }
  }

  function drawBandsRange(c, pts, from, to) {
    var acc = 0;
    for (var i = 1; i < pts.length; i++) {
      var dx = pts[i][0] - pts[i - 1][0], dy = pts[i][1] - pts[i - 1][1];
      var seg = Math.hypot(dx, dy) || 1e-6;
      var s0 = acc, s1 = acc + seg; acc = s1;
      if (s1 <= from) continue;
      if (s0 >= to) break;
      var f0 = s0 <= from ? (from - s0) / seg : 0;
      var f1 = s1 >= to ? (to - s0) / seg : 1;
      c.lineWidth = Math.max(1.1, (pts[i][2] + pts[i - 1][2]) / 2);
      c.beginPath();
      c.moveTo(pts[i - 1][0] + dx * f0, pts[i - 1][1] + dy * f0);
      c.lineTo(pts[i - 1][0] + dx * f1, pts[i - 1][1] + dy * f1);
      c.stroke();
    }
  }

  function advanceReveal(from, to, box) {
    var lift = inkPx * 0.10;
    var acc = 0;
    for (var i = 0; i < strokes.length; i++) {
      var s = strokes[i], cost = s.len + lift;
      if (acc + cost <= from) { acc += cost; continue; }
      if (acc >= to) break;
      var a = Math.max(0, from - acc), b = Math.min(s.len, to - acc);
      if (b > a) {
        revLen[i] = Math.max(revLen[i], b);
        rangeBox(s.pts, a, b, box);
      }
      acc += cost;
    }
  }

  function paintRect(core) {
    if (core.x1 <= core.x0 || core.y1 <= core.y0) return;
    var pad = 46;
    var x = Math.max(0, Math.floor(core.x0 - pad)), y = Math.max(0, Math.floor(core.y0 - pad));
    var x1 = Math.min(W, Math.ceil(core.x1 + pad)), y1 = Math.min(H, Math.ceil(core.y1 + pad));
    var w = x1 - x, h = y1 - y;
    if (w <= 0 || h <= 0) return;
    maskCtx.setTransform(DPR, 0, 0, DPR, 0, 0);
    maskCtx.save();
    maskCtx.beginPath(); maskCtx.rect(x, y, w, h); maskCtx.clip();
    maskCtx.clearRect(x, y, w, h);
    maskCtx.lineCap = 'round'; maskCtx.lineJoin = 'round'; maskCtx.strokeStyle = '#fff';
    for (var i = 0; i < strokes.length; i++) {
      if (revLen[i] <= 0) continue;
      var bb = strokes[i].bb;
      if (bb.x1 < x || bb.x0 > x + w || bb.y1 < y || bb.y0 > y + h) continue;
      drawBandsRange(maskCtx, strokes[i].pts, 0, revLen[i]);
    }
    maskCtx.restore();
    ctx.save();
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.clearRect(x, y, w, h);
    ctx.drawImage(ink, x * DPR, y * DPR, w * DPR, h * DPR, x, y, w, h);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(mask, x * DPR, y * DPR, w * DPR, h * DPR, x, y, w, h);
    ctx.restore();
  }

  function resetInk() {
    maskCtx.setTransform(DPR, 0, 0, DPR, 0, 0);
    maskCtx.clearRect(0, 0, W, H);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (revLen) revLen.fill(0);
    revealedCost = 0;
    maskReset = false;
  }

  function drawText(t) {
    if (!strokes || !inkReady) return;
    if (maskReset) resetInk();
    var target = revealCost(t);
    if (target < revealedCost - 0.5) resetInk();
    if (target <= revealedCost) return;
    var box = dshiwNewBox();
    advanceReveal(revealedCost, target, box);
    revealedCost = target;
    paintRect(box);
  }

  /* ---------------- 鲸鱼路径 ---------------- */
  var WHALE_N = DSHIW_WHALE_N, WHALE_RAW = DSHIW_WHALE_PTS;
  function buildWhalePath() {
    var N = WHALE_N, pts = new Float32Array(N * 2), jump = new Uint8Array(N);
    for (var i = 0; i < N; i++) {
      var px = WHALE_RAW[i * 2], py = WHALE_RAW[i * 2 + 1];
      pts[i * 2] = WHALE_X + (px - 0.163) * WHALE_S;
      pts[i * 2 + 1] = WHALE_Y + (py - 1.75) * WHALE_S;
      if (i > 0) {
        var dx = pts[i * 2] - pts[i * 2 - 2], dy = pts[i * 2 + 1] - pts[i * 2 - 1];
        if (dx * dx + dy * dy > 16) jump[i] = 1;
      }
    }
    whalePts = pts; whaleJumps = jump;
    jump[0] = 1;
    var bodyMaxX = WHALE_X + 13 * WHALE_S;
    var k = 0, best = 1e9, bestX = 1e9;
    for (var j = 0; j < N; j++) {
      var y = pts[j * 2 + 1], x = pts[j * 2];
      if (x > bodyMaxX) continue;
      if (y < best - 0.5 || (Math.abs(y - best) <= 0.5 && x < bestX)) { best = y; bestX = x; k = j; }
    }
    var pts2 = new Float32Array(N * 2), jmp2 = new Uint8Array(N);
    for (var q = 0; q < N; q++) {
      var idx = (k + q) % N;
      pts2[q * 2] = pts[idx * 2];
      pts2[q * 2 + 1] = pts[idx * 2 + 1];
      jmp2[q] = q === 0 ? 1 : jump[idx];
    }
    whalePts = pts2; whaleJumps = jmp2;
  }

  /* ---------------- 绘制 ---------------- */
  function drawPen(x, y, alpha) {
    if (alpha <= 0.001) return;
    var P = THEME.pen;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var g = ctx.createRadialGradient(x, y, 0, x, y, 110);
    g.addColorStop(0, 'rgba(' + P.halo[0] + ',' + (.26 * alpha) + ')');
    g.addColorStop(.35, 'rgba(' + P.halo[1] + ',' + (.10 * alpha) + ')');
    g.addColorStop(1, 'rgba(' + P.halo[2] + ',0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 110, 0, 6.2832); ctx.fill();

    g = ctx.createRadialGradient(x, y, 0, x, y, 20);
    g.addColorStop(0, 'rgba(' + P.core[0] + ',' + (.95 * alpha) + ')');
    g.addColorStop(.3, 'rgba(' + P.core[1] + ',' + (.7 * alpha) + ')');
    g.addColorStop(1, 'rgba(' + P.core[2] + ',0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 20, 0, 6.2832); ctx.fill();

    ctx.fillStyle = 'rgba(' + P.dot + ',' + (.92 * alpha) + ')';
    ctx.beginPath(); ctx.arc(x, y, 2.1, 0, 6.2832); ctx.fill();
    ctx.restore();
  }

  function drawWhaleOutline(t, dx) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (t > RIM_E) return;
    ctx.translate(dx, 0);
    var u = dshiwClamp((t - D_START) / (D_END - D_START), 0, 1);
    var p = dshiwEaseInOut(u);
    var n = Math.max(2, Math.floor(p * (whalePts.length / 2 - 1))) + 1;
    var fade = 1 - dshiwSmooth(RIM_S, RIM_E, t);

    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    var passes = [[10, 0.14], [5.5, 0.30], [2.6, 0.85], [1.1, 1]];
    for (var pi = 0; pi < passes.length; pi++) {
      var w = passes[pi][0], a = passes[pi][1];
      ctx.beginPath();
      ctx.moveTo(whalePts[0], whalePts[1]);
      for (var i = 1; i < n; i++) {
        if (whaleJumps[i]) ctx.moveTo(whalePts[i * 2], whalePts[i * 2 + 1]);
        else ctx.lineTo(whalePts[i * 2], whalePts[i * 2 + 1]);
      }
      ctx.strokeStyle = 'rgba(' + (w < 1.2 ? THEME.outline.core : THEME.outline.wide) + ',' + (a * fade) + ')';
      ctx.lineWidth = w;
      ctx.stroke();
    }
    ctx.restore();

    if (t > D_START - 0.02 && t < D_END + 0.35) {
      var idx = Math.min(n - 1, Math.floor(p * (whalePts.length / 2 - 1)));
      var hx = whalePts[idx * 2], hy = whalePts[idx * 2 + 1];
      var pa = dshiwSmooth(D_START - 0.05, D_START + 0.24, t) * (1 - dshiwSmooth(D_END, D_END + 0.3, t));
      if (t > D_END) {
        var l = dshiwClamp((t - D_END) / 0.32, 0, 1);
        drawPen(hx + l * 8, hy - l * 6, 1 - l);
      } else drawPen(hx, hy, pa);
    }
  }

  /* ---------------- 鲸鱼运动 ---------------- */
  function whaleDx(t) { return CENTER_DX * (1 - dshiwSmooth(FILL_S + 0.1, FILL_S + 1.2, t)); }
  function whaleTransform(t) {
    var dx = whaleDx(t);
    aset(lockupG, 'transform', 'translate(' + dx.toFixed(2) + ',0)');
    var hop = 0, ang = 0, dy = 0;
    if (t > HOP_S) {
      var u = dshiwClamp((t - HOP_S) / (HOP_E - HOP_S), 0, 1);
      hop = -9 * Math.sin(Math.PI * u) * Math.sin(Math.PI * u);
    }
    if (t > SWAY_T) {
      var s = t - SWAY_T;
      var ramp = dshiwSmooth(SWAY_T, SWAY_E, t);
      ang = 1.05 * ramp * Math.sin(2 * Math.PI * s / 4.6);
      dy = 1.6 * ramp * Math.sin(2 * Math.PI * s / 4.6 + 0.7);
    }
    var cx = WHALE_W * 0.36, cy = WHALE_W * (19.6 / 26.634) * 0.66;
    aset(whaleAnim, 'transform', 'translate(0 ' + (hop + dy).toFixed(2) + ') rotate(' + ang.toFixed(3) + ' ' + cx.toFixed(1) + ' ' + cy.toFixed(1) + ')');
  }

  /* ---------------- 主渲染 ---------------- */
  var cleared = false;
  function sset(el, prop, val) { var k = '_s_' + prop; if (el[k] === val) return; el[k] = val; el.style[prop] = val; }
  function aset(el, attr, val) { var k = '_a_' + attr; if (el[k] === val) return; el[k] = val; el.setAttribute(attr, val); }

  function render(t) {
    /* 跳过鲸鱼时，字迹淡出之后就没有内容了：把时间钉在淡出末尾，
       免得 seek 到更后面又画出鲸鱼、字标与副标题。 */
    if (SKIP_WHALE && t >= FADE_E) t = FADE_E - 1e-4;
    if (t < FADE_E) {
      var f = dshiwSmooth(FADE_S, FADE_E, t);
      sset(canvas, 'opacity', String(1 - f));
      sset(canvas, 'transform', 'translateY(' + (-14 * f).toFixed(2) + 'px)');
      drawText(t);
      cleared = false;
    } else {
      sset(canvas, 'transform', 'translateY(0)');
      sset(canvas, 'opacity', '1');
      if (t < RIM_E + 0.1) { drawWhaleOutline(t, whaleDx(t)); cleared = false; }
      else if (!cleared) {
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        ctx.clearRect(0, 0, W, H);
        cleared = true;
      }
    }

    var fillP = dshiwEaseOut(dshiwClamp((t - FILL_S) / (FILL_E - FILL_S), 0, 1));
    aset(whaleFill, 'fill-opacity', fillP.toFixed(4));
    var rimP = dshiwSmooth(RIM_S, RIM_E, t);
    aset(rimWide, 'opacity', (0.22 * rimP).toFixed(3));
    aset(rimCore, 'opacity', (0.92 * rimP).toFixed(3));

    var wu = dshiwClamp((t - WORD_S) / (WORD_E - WORD_S), 0, 1);
    var we = dshiwEaseOut(wu);
    aset(wordG, 'opacity', we.toFixed(4));
    aset(wordG, 'transform', 'translate(' + (WM_X + 18 * (1 - we)).toFixed(2) + ',' + WM_Y + ') scale(' + WM_SCALE + ')');

    var su = dshiwClamp((t - SUB_S) / (SUB_E - SUB_S), 0, 1);
    var se = dshiwEaseOut(su);
    sset(captionEl, 'opacity', String(se));
    sset(captionEl, 'transform', 'translateY(' + (10 * (1 - se)).toFixed(2) + 'px)');
    sset(captionEl, 'letterSpacing', (0.62 - 0.2 * se).toFixed(3) + 'em');
    sset(captionEl, 'textIndent', (0.62 - 0.2 * se).toFixed(3) + 'em');

    if (t > FILL_S + 0.4) {
      var base = dshiwSmooth(FILL_S + 0.4, HALO_E, t);
      var hs = t - HALO_T;
      var breath = 0.5 + 0.5 * Math.sin(2 * Math.PI * hs / 5.4);
      var hAlpha = base * (0.62 + 0.16 * breath);
      var sc = 1 + 0.035 * (breath - 0.5) * 2 * base;
      sset(halo, 'opacity', hAlpha.toFixed(4));
      sset(halo, 'transform', 'scale(' + sc.toFixed(4) + ')');
    } else {
      sset(halo, 'opacity', '0');
    }

    whaleTransform(t);
  }

  /* ---------------- 时钟 / 生命周期 ---------------- */
  var startedAt = 0, running = false, raf = 0, lastT = 0, finished = false;
  var doneTimer = 0, skipTimer = 0, pausedAt = 0, prepared = false;
  var HANDOFF_MS = DSHIW_HANDOFF_MS;

  function prepare() {
    if (prepared) return;
    prepared = true;
    buildText();
    buildWhalePath();
    applyTimeline();
  }

  /**
   * 结束开屏：全屏模式下鲸鱼缓慢推近、轻微失焦，整屏淡出，让下面的主界面
   * 自然浮出来；内嵌预览与减少动态效果退回简单淡出。
   */
  function finish() {
    if (finished) return;
    finished = true;
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    skipEl.classList.remove('is-visible');
    if (inline || reduce || SKIP_WHALE) {
      /* 跳过鲸鱼时没有推近的对象，用普通淡出收场，免得空转 1.5 秒。 */
      var fade = reduce ? 260 : (SKIP_WHALE ? 420 : 520);
      root.style.transition = 'opacity ' + fade + 'ms ease';
      root.style.opacity = '0';
      doneTimer = setTimeout(function () {
        if (typeof opts.onDone === 'function') opts.onDone();
      }, fade + 60);
      return;
    }
    root.classList.add('dshiw-handoff');
    doneTimer = setTimeout(function () {
      if (typeof opts.onDone === 'function') opts.onDone();
    }, HANDOFF_MS + 80);
  }

  function tick(now) {
    if (!running) return;
    var t = (now - startedAt) / 1000 * SPEED;
    lastT = t;
    render(t);
    if (t >= STOP_T) { finish(); return; }
    raf = requestAnimationFrame(tick);
  }

  function start() {
    prepare();
    if (reduce) {
      buildInk();
      render(Math.min(SUB_E + 1.0, STOP_T));
      skipEl.classList.remove('is-visible');
      doneTimer = setTimeout(finish, 2600);
      return;
    }
    /* 首帧只画背景与锁标：背景先亮，重量级的离屏墨迹让给下一帧。
       起表时刻同步推到墨迹画好之后，否则前几百毫秒的字迹会被丢掉。 */
    render(0);
    raf = requestAnimationFrame(function () {
      buildInk();
      startedAt = performance.now();
      running = true;
      raf = requestAnimationFrame(tick);
    });
    skipTimer = setTimeout(function () { skipEl.classList.add('is-visible'); }, 1300);
  }

  function skip() {
    if (finished) return;
    if (reduce) { finish(); return; }
    /* 提前跳过时先落到终帧 logo，再走同一段交接动画，避免缩放的是半截字迹；
       跳过鲸鱼时没有可缩放的锁标，直接收场。 */
    if (!SKIP_WHALE && lastT < SUB_E) {
      if (raf) cancelAnimationFrame(raf);
      running = false;
      buildInk();
      render(SUB_E + 0.35);
    }
    finish();
  }

  function seek(t) {
    prepare();
    buildInk();
    if (raf) cancelAnimationFrame(raf);
    running = false;
    render(dshiwClamp(t, 0, END));
  }

  function onPointerDown(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (e && e.stopPropagation) e.stopPropagation();
    skip();
  }
  function onKeyDown(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') return;
    if (e.preventDefault) e.preventDefault();
    if (e.stopPropagation) e.stopPropagation();
    skip();
  }
  function onVisibility() {
    if (finished) return;
    if (document.hidden) {
      if (running) {
        running = false;
        pausedAt = performance.now();
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
      }
    } else if (!running && !reduce && startedAt) {
      startedAt += performance.now() - pausedAt;
      running = true;
      raf = requestAnimationFrame(tick);
    }
  }

  root.addEventListener('pointerdown', onPointerDown, true);
  if (!inline) {
    window.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('visibilitychange', onVisibility);
  }

  function destroy() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    clearTimeout(doneTimer);
    clearTimeout(skipTimer);
    root.removeEventListener('pointerdown', onPointerDown, true);
    if (!inline) {
      window.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('visibilitychange', onVisibility);
    }
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    window.removeEventListener('resize', fit);
    if (root.parentNode) root.parentNode.removeChild(root);
  }

  function info() {
    /* 时间轴由 prepare 推导，没播过也要给出真实值。 */
    prepare();
    return {
      text: TEXT, font: fontKey, theme: themeKey, strokes: stCount, px: inkPx,
      skipWhale: SKIP_WHALE, speed: SPEED,
      writeEnd: +W_END.toFixed(3), subEnd: +SUB_E.toFixed(3),
      stop: +STOP_T.toFixed(3), end: +(STOP_T + 0.4).toFixed(3)
    };
  }

  return { start: start, destroy: destroy, skip: skip, seek: seek, info: info };
}
