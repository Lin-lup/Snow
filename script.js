let currentIdx = 0;
const slides = document.querySelectorAll('.page-slide');
const dockBtns = document.querySelectorAll('.dock-btn');
const hintEl = document.getElementById('scroll-hint');
const totalSlides = slides.length;

// 页面进入/退出时的元素级联浮现动画
function refreshStagger(slidesList) {
  slidesList.forEach((slide) => {
    const items = slide.querySelectorAll('.section-head, .hero-avatar-wrap, .hero-title, .hero-sub, .glass-box, .tags-row, .parallax-frame, .envelope-stage');
    items.forEach((el, i) => {
      el.style.transitionDelay = '';
      el.style.animation = 'none';
      void el.offsetWidth;
      el.style.animation = '';
    });
  });
}
refreshStagger(slides);

function goToSlide(newIdx) {
  if (newIdx < 0 || newIdx >= totalSlides || newIdx === currentIdx) return;
  slides[currentIdx].classList.remove('active');
  dockBtns[currentIdx].classList.remove('active');
  currentIdx = newIdx;
  slides[currentIdx].classList.add('active');
  dockBtns[currentIdx].classList.add('active');
  hintEl.style.opacity = (currentIdx === totalSlides - 1) ? '0' : '0.6';
}

// 键盘方向键支持（桌面端）
window.addEventListener('keydown', (e) => {
  if (introOpen()) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === 'PageDown') {
    if (currentIdx < totalSlides - 1) goToSlide(currentIdx + 1);
  } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'PageUp') {
    if (currentIdx > 0) goToSlide(currentIdx - 1);
  }
});

let startY = 0;
let startX = 0;
let startAtTop = true;
let startAtBottom = true;

function slideScrollState(slide) {
  const scrollable = slide.scrollHeight > slide.clientHeight + 1;
  return {
    scrollable,
    atTop: slide.scrollTop <= 0,
    atBottom: slide.scrollTop + slide.clientHeight >= slide.scrollHeight - 1
  };
}

// 开屏信封未拆完之前，锁定翻页手势
function introOpen() { return !!document.getElementById('intro-cover'); }

window.addEventListener('touchstart', (e) => {
  startY = e.touches[0].clientY;
  startX = e.touches[0].clientX;
  const st = slideScrollState(slides[currentIdx]);
  startAtTop = st.atTop;
  startAtBottom = st.atBottom;
}, { passive: true });

window.addEventListener('touchend', (e) => {
  if (introOpen()) return;
  const dy = startY - e.changedTouches[0].clientY;
  const dx = startX - e.changedTouches[0].clientX;
  if (Math.abs(dy) > 45 && Math.abs(dy) > Math.abs(dx)) {
    // 页内内容还能往该方向滚动时优先滚内容，到边后才翻页
    if (dy > 0 && currentIdx < totalSlides - 1) {
      if (!startAtBottom) return;
      goToSlide(currentIdx + 1);
    } else if (dy < 0 && currentIdx > 0) {
      if (!startAtTop) return;
      goToSlide(currentIdx - 1);
    }
  }
}, { passive: true });

let wheelCooldown = false;
window.addEventListener('wheel', (e) => {
  if (introOpen()) return;
  if (wheelCooldown) return;
  const st = slideScrollState(slides[currentIdx]);
  if (st.scrollable) {
    if (e.deltaY > 0 && !st.atBottom) return;
    if (e.deltaY < 0 && !st.atTop) return;
  }
  if (Math.abs(e.deltaY) > 25) {
    wheelCooldown = true;
    if (e.deltaY > 0 && currentIdx < totalSlides - 1) {
      goToSlide(currentIdx + 1);
    } else if (e.deltaY < 0 && currentIdx > 0) {
      goToSlide(currentIdx - 1);
    }
    setTimeout(() => { wheelCooldown = false; }, 600);
  }
}, { passive: true });

/* ==========================================
   持续降雪：远景层（内容之后）+ 近景层（内容之上，负责积雪）
   积雪面一打开就带着已经堆好的薄雪层（不靠雪花一点一点攒），
   雪层跟随元素真实轮廓，边缘是不规则噪声曲线，风把它压向一侧；
   按住拖动可以把它划掉，划下来的雪碎成雪屑飘落。
   ========================================== */
const backCanvas = document.getElementById('snow-canvas');
const frontCanvas = document.getElementById('snow-front');
const bCtx = backCanvas.getContext('2d');
const fCtx = frontCanvas.getContext('2d');
let sW, sH;
// 位图和元素盒必须锁在同一个 CSS 尺寸上，否则浏览器会缩放画布：
// 手机上可视区比 vh 矮一截，靠 vh 撑开会让积雪整层往下错开，越靠屏幕底部偏得越多。
function fitOverlayCanvas(cv, w, h) {
  cv.width = w;
  cv.height = h;
  cv.style.width = `${w}px`;
  cv.style.height = `${h}px`;
}
function resizeSnow() {
  sW = window.innerWidth;
  sH = window.innerHeight;
  fitOverlayCanvas(backCanvas, sW, sH);
  fitOverlayCanvas(frontCanvas, sW, sH);
  buildDrift();
}
window.addEventListener('resize', resizeSnow);

let windPhase = Math.random() * 1000;
function windAt(y) {
  // 缓慢摆动的高空气流：雪不是直直落下来的
  const t = windPhase * 0.004;
  return Math.sin(t) * 0.42 + Math.sin(t * 2.3 + y * 0.0015) * 0.2;
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 一维分形噪声：雪檐的起伏靠它，才不会出现规律重复的波浪
function makeNoise(n, seed, cells) {
  const rnd = mulberry32(seed);
  const layers = cells.map((cell) => {
    const len = Math.ceil(n / cell) + 3;
    const g = new Float32Array(len);
    for (let i = 0; i < len; i++) g[i] = rnd();
    return { g, cell };
  });
  const wgt = [0.46, 0.33, 0.21];
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let v = 0;
    for (let k = 0; k < layers.length; k++) {
      const t = i / layers[k].cell;
      const idx = Math.floor(t);
      const f = t - idx;
      const a = layers[k].g[idx];
      const b = layers[k].g[idx + 1];
      v += wgt[k] * (a + (b - a) * (f * f * (3 - 2 * f)));
    }
    out[i] = v;
  }
  return out;
}

// 中点二次贝塞尔平滑：把采样点连成自然曲线而不是折线
function smoothTo(ctx, pts) {
  ctx.lineTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) {
    ctx.quadraticCurveTo(pts[i].x, pts[i].y,
      (pts[i].x + pts[i + 1].x) / 2, (pts[i].y + pts[i + 1].y) / 2);
  }
  const L = pts[pts.length - 1];
  ctx.lineTo(L.x, L.y);
}

/* ---------- 积雪面 ---------- */
const MAX_CAP = 8;
const snowStore = new Map(); // element -> { n, h, cap, cont, noise, seed }
const sloughAt = new WeakMap(); // element -> 上次掉雪屑的时间
let surfaces = [];

function parseRadius(part, span) {
  if (!part) return 0;
  const v = parseFloat(part);
  if (!isFinite(v)) return 0;
  return /%/.test(part) ? (v / 100) * span : v;
}

// 顶边轮廓：圆角处顶边会向下弯，圆形（border-radius 50%）整条边都是弧
function buildContour(w, hEl, rx, ry, n) {
  const cont = new Float32Array(n);
  const step = w / (n - 1);
  if (rx < 0.5) return cont;
  for (let i = 0; i < n; i++) {
    const u = i * step;
    let d = -1;
    if (u < rx) d = rx - u;
    else if (u > w - rx) d = u - (w - rx);
    cont[i] = d < 0 ? 0 : ry * (1 - Math.sqrt(Math.max(0, 1 - (d / rx) * (d / rx))));
  }
  return cont;
}

function surfaceState(el, w, hEl) {
  const n = Math.max(14, Math.min(84, Math.round(w / 5)));
  const rw = Math.round(w);
  let st = snowStore.get(el);
  if (st && st.n === n && st.w === rw) return st;

  const cs = getComputedStyle(el);
  const parts = (cs.borderTopLeftRadius || '0').trim().split(/\s+/);
  const rx = Math.min(parseRadius(parts[0], w) || 0, w / 2);
  const ry = Math.min(parseRadius(parts[1] || parts[0], hEl) || 0, hEl / 2);
  const seed = st ? st.seed : ((Math.random() * 1e9) | 0);
  const fresh = !st;
  // 噪声的周期单位是"采样点"，不是像素：按元素宽度换算会得到上百点的周期，
  // 结果整条雪檐退化成一道平滑缓坡（就是那种不像雪的雾堆感）
  const noise = makeNoise(n, seed, [n / 3.4, n / 8.5, n / 21].map((v) => Math.max(1.7, v)));
  // 高频碎边噪声：让雪檐边缘是松散的碎块感，而不是光滑弧线
  const micro = makeNoise(n, (seed ^ 0x9e37) | 0, [2.6, 1.4]);
  // 覆盖掩膜：薄雪不是一条连续的白带，得断成一块一块
  const patch = makeNoise(n, (seed ^ 0x51ab) | 0, [n / 8, n / 19].map((v) => Math.max(1.6, v)));
  // 颗粒噪声：真雪表面是碎的，撒点雪粒才不会像贴了张白纸
  const grain = makeNoise(n, (seed ^ 0x2f19) | 0, [1.7, 1.0]);
  const cont = buildContour(w, hEl, rx, ry, n);
  // 风把雪压向一侧：另一侧基本是干净的（right=右边厚，left=左边厚）
  const side = el.dataset.snowSide === 'left' ? -1 : el.dataset.snowSide === 'right' ? 1 : 0;

  const next = { n, w: rw, h: new Float32Array(n), cap: new Float32Array(n), cont, noise, micro, patch, grain, side, seed };
  if (st) {
    // 尺寸变化时按比例搬一遍旧积雪，避免缩放窗口后雪层突变
    for (let i = 0; i < n; i++) {
      const src = (i / (n - 1)) * (st.n - 1);
      const lo = Math.floor(src), hi = Math.min(st.n - 1, lo + 1);
      next.h[i] = st.h[lo] + (st.h[hi] - st.h[lo]) * (src - lo);
    }
  }

  // 能挂多厚：先按雪的自然安息角（约 22°~28°，逐点带噪声）判断挂不挂得住，
  // 弧面一陡就直接收掉；再乘一层覆盖掩膜，让薄雪断成一块一块而不是一整条
  const step = w / (n - 1);
  const maxCap = Math.max(3.5, Math.min(MAX_CAP, rw * 0.035));
  for (let i = 0; i < n; i++) {
    const a = cont[Math.max(0, i - 1)];
    const b = cont[Math.min(n - 1, i + 1)];
    const angle = Math.atan(Math.abs(b - a) / (2 * step || 1));
    const rest = Math.max(0, Math.min(1, (0.38 * (0.8 + 0.5 * noise[i]) - angle) / 0.12));
    const cover = Math.max(0, Math.min(1, (patch[i] - 0.1) * 2.4));
    let drift = 1;
    if (side) {
      const t = side > 0 ? i / (n - 1) : 1 - i / (n - 1);
      const e = Math.max(0, Math.min(1, (t - 0.5) / 0.38));
      drift = Math.max(0, Math.min(1, e * e * (3 - 2 * e) + (noise[i] - 0.5) * 0.1));
    }
    next.cap[i] = maxCap * (0.68 + 0.5 * noise[i]) * rest * cover * drift;
  }
  // 雪层是"打开就已经在那儿"的，不靠雪花一点点堆出来
  if (fresh) {
    for (let i = 0; i < n; i++) next.h[i] = next.cap[i] * (0.72 + 0.28 * noise[i]);
  }
  snowStore.set(el, next);
  return next;
}

function collectSurfaces() {
  const list = [];
  document.querySelectorAll('.snow-surface').forEach((el) => {
    const slide = el.closest('.page-slide');
    if (slide && !slide.classList.contains('active')) return;
    const r = el.getBoundingClientRect();
    if (r.width < 24 || r.height < 12) return;
    if (r.bottom < -20 || r.top > sH + 20) return;
    list.push({ el, st: surfaceState(el, r.width, r.height), x: r.left, y: r.top, w: r.width });
  });
  surfaces = list;
}

function sampleAt(s, x) {
  const { n, cont, h, cap } = s.st;
  const f = ((x - s.x) / s.w) * (n - 1);
  const lo = Math.max(0, Math.min(n - 1, Math.floor(f)));
  const hi = Math.max(0, Math.min(n - 1, lo + 1));
  const t = f - lo;
  return {
    i: lo,
    cont: cont[lo] + (cont[hi] - cont[lo]) * t,
    h: h[lo] + (h[hi] - h[lo]) * t,
    cap: cap[lo] + (cap[hi] - cap[lo]) * t
  };
}

// 雪不化，摊平也刻意压到极低：
// 扩散一旦开大，分形噪声就会被抹成一条规整的直线，那正是"假雪"的来源
function settleSurfaces() {
  for (const s of surfaces) {
    const { n, h, cap } = s.st;
    let prev = h[0];
    for (let i = 1; i < n - 1; i++) {
      const lap = (prev + h[i + 1]) - 2 * h[i];
      h[i] = Math.min(cap[i], h[i] + lap * 0.0012);
      prev = h[i];
    }
  }
}

// 雪是水平堆出来的，不会照抄圆面/弧面的轮廓：
// 有雪的地方把自身弧度压掉七成，雪顶才不会被圆形的弧度带成一个月牙
function topRise(cont, h) {
  return cont * 0.7 * Math.min(1, h / 3.5);
}

function drawCap(s) {
  const { n, h } = s.st;
  const step = s.w / (n - 1);
  // 薄雪是一块一块的，不是连成一整条：按连续有雪的区段分开画
  let run = null;
  for (let i = 0; i <= n; i++) {
    if (i < n && h[i] > 0.35) { if (!run) run = []; run.push(i); continue; }
    if (run && run.length > 1) drawPatch(s, run, step);
    run = null;
  }
}

function drawPatch(s, idx, step) {
  const { n, h, cont, micro, grain } = s.st;
  const L = idx.length - 1;

  // 圆面上的雪是一片平口雪帽，下缘不跟着元素轮廓往下弯：
  // 取"轮廓"和"雪线"里更低的那条，中间近乎水平，两端自己收薄
  let cMax = 0, peak = 0;
  for (const i of idx) {
    if (cont[i] > cMax) cMax = cont[i];
    if (h[i] > peak) peak = h[i];
  }
  const line = cMax * 0.82;
  s.st.line = line;

  // 两端收成缓坡而不是直口：坡长按雪的自然安息角（约 28°）算，
  // 迎风那头本来就薄，坡给得长；背风那头厚，收得干脆些
  const ramp = Math.max(1.2, Math.min(L / 2, (peak * 1.9) / step + 0.5));
  const sd = s.st.side;
  const rL = ramp * (sd < 0 ? 1.5 : sd > 0 ? 0.72 : 1);
  const rR = ramp * (sd > 0 ? 1.5 : sd < 0 ? 0.72 : 1);

  const top = [];
  const bot = [];
  for (let k = 0; k <= L; k++) {
    const i = idx[k];
    const x = s.x + i * step;
    const t = Math.min(1, Math.min((k + 0.4) / rL, (L - k + 0.4) / rR));
    const shape = t * t * (3 - 2 * t);
    const hh = h[i] * (0.08 + 0.92 * shape);
    // 雪越厚碎边越明显，薄到边缘时自然收干净
    const crumb = (micro[i] - 0.42) * 3.6 * Math.min(1, hh / 2.2);
    // 每一块的两端探出边缘并往下垂，像屋檐口的雪舌
    const edge = k === 0 ? -1 : k === L ? 1 : 0;
    const lean = edge * step * 0.5 * Math.min(1, h[i] / 3);
    const droop = edge ? h[i] * 0.45 : 0;
    const lump = (micro[(i + 4) % n] - 0.5) * 2.8;
    const by = s.y + Math.max(cont[i], line + lump) + 1.2 + droop;
    top.push({ x: x + lean, y: Math.min(s.y + cont[i] - topRise(cont[i], hh) - hh - crumb, by - 0.6) });
    bot.push({ x: x + lean, y: by });
  }

  fCtx.save();
  fCtx.beginPath();
  fCtx.moveTo(bot[0].x, bot[0].y);
  smoothTo(fCtx, top);
  smoothTo(fCtx, bot.slice().reverse());
  fCtx.closePath();

  const g = fCtx.createLinearGradient(0, s.y + cont[idx[0]] - peak, 0, s.y + 3);
  g.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
  g.addColorStop(0.6, 'rgba(250, 250, 250, 0.88)');
  g.addColorStop(1, 'rgba(235, 235, 235, 0.8)');
  fCtx.fillStyle = g;
  fCtx.shadowColor = 'rgba(0, 0, 0, 0.55)';
  fCtx.shadowBlur = 5;
  fCtx.shadowOffsetY = 1.5;
  fCtx.fill();
  fCtx.restore();

  // 顶面一道高光，边缘就不显得像贴了张纸
  fCtx.save();
  fCtx.beginPath();
  fCtx.moveTo(top[0].x, top[0].y);
  smoothTo(fCtx, top);
  fCtx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
  fCtx.lineWidth = 0.9;
  fCtx.stroke();
  // 撒雪粒：薄雪的质感来自这些碎的亮点，不是靠一条光滑轮廓
  for (let k = 0; k <= L; k++) {
    const gr = grain[idx[k]];
    if (gr < 0.4) continue;
    fCtx.beginPath();
    fCtx.arc(top[k].x + (gr - 0.6) * step * 1.4, top[k].y - (gr - 0.3) * 3.4,
      0.45 + gr * 1.15, 0, Math.PI * 2);
    fCtx.fillStyle = `rgba(255, 255, 255, ${0.3 + gr * 0.6})`;
    fCtx.fill();
  }
  fCtx.restore();
}

/* ---------- 零星滑落的小雪屑 ---------- */
const chunks = [];
function spawnCrumb(s, i) {
  const { n, h, cont, micro } = s.st;
  const now = performance.now();
  if (now - (sloughAt.get(s.el) || 0) < 90) return false;
  const step = s.w / (n - 1);
  const i0 = Math.max(0, i - 1);
  const i1 = Math.min(n - 1, i + 1);
  const top = [];
  const bot = [];
  let vol = 0;
  for (let k = i0; k <= i1; k++) {
    if (h[k] < 0.5) continue;
    vol += h[k];
    const crumb = (micro[k] - 0.42) * 3.6 * Math.min(1, h[k] / 2.2);
    // 与 drawPatch 用同一套顶边公式，雪屑脱落前后的轮廓才对得上
    top.push({ x: (k - i0) * step, y: cont[k] - topRise(cont[k], h[k]) - h[k] - crumb });
    bot.push({
      x: (k - i0) * step,
      y: Math.max(cont[k], s.st.line || 0) + 1.8 + h[k] * 0.5 + (micro[(k + 5) % n] - 0.5) * 1.6
    });
    h[k] *= 0.22;
  }
  if (top.length < 2 || vol < 1) return false;
  let y0 = 0, y1 = 0;
  for (const p of top) if (p.y < y0) y0 = p.y;
  for (const p of bot) if (p.y > y1) y1 = p.y;
  chunks.push({
    x: s.x + i0 * step,
    y: s.y,
    w: (i1 - i0) * step,
    top, bot, y0, y1,
    vx: (Math.random() - 0.5) * 0.45,
    vy: 0.04,
    rot: 0,
    rotV: (Math.random() - 0.5) * 0.05,
    alpha: 1
  });
  sloughAt.set(s.el, now);
  return true;
}

function updateChunks() {
  for (let i = chunks.length - 1; i >= 0; i--) {
    const c = chunks[i];
    // 小雪屑很轻：落得慢、被风带着飘、走一小段就化掉
    c.vy = Math.min(c.vy + 0.05, 1.5);
    c.y += c.vy;
    c.x += c.vx + windAt(c.y) * 1.1;
    c.rot += c.rotV;
    c.alpha -= 0.011;
    if (c.y > sH - 40) c.alpha -= 0.07;
    if (c.alpha <= 0 || c.y > sH + 60) {
      addToDrift(c.x + c.w / 2, 0.4);
      spawnPuff(c.x + c.w / 2, Math.min(sH - 6, c.y), 4);
      chunks.splice(i, 1);
      continue;
    }
    fCtx.save();
    fCtx.translate(c.x, c.y);
    fCtx.rotate(c.rot);
    fCtx.globalAlpha = Math.max(0, Math.min(1, c.alpha));
    fCtx.beginPath();
    fCtx.moveTo(c.bot[0].x, c.bot[0].y);
    smoothTo(fCtx, c.top);
    smoothTo(fCtx, c.bot.slice().reverse());
    fCtx.closePath();
    const g = fCtx.createLinearGradient(0, c.y0, 0, c.y1);
    g.addColorStop(0, 'rgba(255, 255, 255, 0.97)');
    g.addColorStop(0.6, 'rgba(249, 249, 249, 0.92)');
    g.addColorStop(1, 'rgba(222, 222, 222, 0.9)');
    fCtx.fillStyle = g;
    fCtx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    fCtx.shadowBlur = 4;
    fCtx.shadowOffsetY = 1.5;
    fCtx.fill();
    // 断裂面勾一道冷色边，雪屑才不会糊成一团白
    fCtx.beginPath();
    fCtx.moveTo(c.bot[0].x, c.bot[0].y);
    smoothTo(fCtx, c.bot.slice().reverse());
    fCtx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    fCtx.lineWidth = 0.8;
    fCtx.shadowColor = 'transparent';
    fCtx.stroke();
    fCtx.restore();
  }
}

/* ---------- 屏幕底部的地面积雪 ---------- */
let drift = null;
let driftNoise = null;
function buildDrift() {
  const n = Math.max(28, Math.min(96, Math.round(sW / 14)));
  const old = drift;
  const h = new Float32Array(n);
  if (old) {
    for (let i = 0; i < n; i++) {
      const src = (i / (n - 1)) * (old.n - 1);
      const lo = Math.floor(src), hi = Math.min(old.n - 1, lo + 1);
      h[i] = old.h[lo] + (old.h[hi] - old.h[lo]) * (src - lo);
    }
  }
  drift = { n, h };
  driftNoise = makeNoise(n, (driftNoise ? 7 : 7) | 0, [n / 3, n / 8, n / 22]);
}
const MAX_DRIFT = 30;
function addToDrift(x, amount) {
  const { n, h } = drift;
  const center = Math.round((x / sW) * (n - 1));
  const spread = [0.25, 0.55, 1, 0.55, 0.25];
  for (let d = -2; d <= 2; d++) {
    const i = center + d;
    if (i < 0 || i >= n) continue;
    const ceiling = MAX_DRIFT * (0.45 + 0.85 * driftNoise[i]);
    h[i] = Math.min(ceiling, h[i] + amount * spread[d + 2]);
  }
}
function drawDrift() {
  const { n, h } = drift;
  const step = sW / (n - 1);
  const pts = [];
  for (let i = 0; i < n; i++) pts.push({ x: i * step, y: sH - h[i] });
  fCtx.save();
  fCtx.beginPath();
  fCtx.moveTo(0, sH);
  smoothTo(fCtx, pts);
  fCtx.lineTo(sW, sH);
  fCtx.closePath();
  const g = fCtx.createLinearGradient(0, sH - MAX_DRIFT, 0, sH);
  g.addColorStop(0, 'rgba(255, 255, 255, 0.98)');
  g.addColorStop(1, 'rgba(230, 230, 230, 0.95)');
  fCtx.fillStyle = g;
  fCtx.shadowColor = 'rgba(0, 0, 0, 0.55)';
  fCtx.shadowBlur = 10;
  fCtx.fill();
  fCtx.restore();
}

/* ---------- 被抖落的雪粉 ---------- */
const puffs = [];
function spawnPuff(x, y, count) {
  for (let i = 0; i < count; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
    const sp = Math.random() * 2.4 + 0.6;
    puffs.push({
      x: x + (Math.random() - 0.5) * 26,
      y: y + (Math.random() - 0.5) * 6,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      r: Math.random() * 2 + 0.8,
      alpha: 1
    });
  }
}
function updatePuffs() {
  for (let i = puffs.length - 1; i >= 0; i--) {
    const p = puffs[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.055;
    p.vx *= 0.985;
    p.alpha -= 0.022;
    if (p.alpha <= 0) { puffs.splice(i, 1); continue; }
    fCtx.beginPath();
    fCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    fCtx.fillStyle = `rgba(255, 255, 255, ${p.alpha})`;
    fCtx.strokeStyle = `rgba(255, 255, 255, ${p.alpha * 0.55})`;
    fCtx.lineWidth = 0.6;
    fCtx.fill();
    fCtx.stroke();
  }
}

/* ---------- 雪花本体 ---------- */
const mouse = { x: -999, y: -999 };
window.addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });
window.addEventListener('touchmove', (e) => {
  if (e.touches.length) { mouse.x = e.touches[0].clientX; mouse.y = e.touches[0].clientY; }
}, { passive: true });

class Flake {
  constructor(front) {
    this.front = front;
    this.reset(true);
    this.y = Math.random() * sH;
  }
  reset(initial) {
    const f = this.front;
    this.x = Math.random() * (sW + 120) - 60;
    this.y = initial ? Math.random() * -sH : -8;
    this.r = f ? Math.random() * 2 + 1.7 : Math.random() * 1.1 + 0.7;
    this.speed = f ? Math.random() * 0.7 + 0.55 : Math.random() * 0.35 + 0.22;
    this.alpha = f ? Math.random() * 0.25 + 0.7 : Math.random() * 0.25 + 0.35;
    this.sway = Math.random() * Math.PI * 2;
    this.swaySpeed = Math.random() * 0.018 + 0.008;
    this.swayAmp = Math.random() * 0.7 + 0.35;
  }
  update() {
    this.sway += this.swaySpeed;
    this.y += this.speed;
    this.x += windAt(this.y) + Math.sin(this.sway) * this.swayAmp * 0.35;

    // 手划过，雪被带偏一点
    const dx = this.x - mouse.x, dy = this.y - mouse.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < 4900 && d2 > 0.01) {
      const d = Math.sqrt(d2);
      const push = (1 - d / 70) * 0.9;
      this.x += (dx / d) * push;
      this.y += (dy / d) * push * 0.35;
    }

    if (this.y - this.r > sH) {
      if (this.front && this.x > 0 && this.x < sW) addToDrift(this.x, 0.16);
      this.reset(false);
    }
    if (this.x < -80 || this.x > sW + 80) this.reset(false);
  }
  draw(ctx) {
    const a = this.alpha;
    if (!this.front) {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(205, 210, 220, ${a})`;
      ctx.fill();
      return;
    }
    // 近景雪粒：外圈灰蓝光晕 + 浅雪蓝雪心 + 一点白高光，白底上才不会看成一圈气泡
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r * 1.7, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(205, 210, 220, ${a * 0.28})`;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(1, a * 1.05)})`;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(this.x - this.r * 0.28, this.y - this.r * 0.28, this.r * 0.45, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 255, 255, ${a})`;
    ctx.fill();
  }
}

const backFlakes = [];
const frontFlakes = [];
function seedFlakes() {
  backFlakes.length = 0;
  frontFlakes.length = 0;
  const area = sW * sH;
  const density = Math.min(1.35, Math.max(0.55, area / (1280 * 720)));
  const backN = Math.round(90 * density);
  const frontN = Math.round(82 * density);
  for (let i = 0; i < backN; i++) backFlakes.push(new Flake(false));
  for (let i = 0; i < frontN; i++) frontFlakes.push(new Flake(true));
}

resizeSnow();
seedFlakes();
collectSurfaces();

// 雪层从一开始就按最终厚度画好，只是先画成全透明；
// 等开屏信封拆完、入场动画跑完（近景画布层级比遮罩高，早画会盖在信封上闪）再淡入
const CAP_FADE = 52; // 淡入帧数
let capAlpha = 0;
let capArmed = false;
function renderSnow() {
  windPhase += 1;
  // 每帧重取位置：手机滑动内容时是连续甩动的，隔几帧才采样会让雪层甩在卡片后面
  collectSurfaces();
  settleSurfaces();

  if (!capArmed && document.readyState === 'complete' && !introOpen()) capArmed = true;
  if (capArmed && capAlpha < 1) capAlpha = Math.min(1, capAlpha + 1 / CAP_FADE);

  bCtx.clearRect(0, 0, sW, sH);
  for (const f of backFlakes) { f.update(); f.draw(bCtx); }

  fCtx.clearRect(0, 0, sW, sH);
  for (const f of frontFlakes) { f.update(); f.draw(fCtx); }
  if (capAlpha > 0.002) {
    fCtx.save();
    fCtx.globalAlpha = capAlpha;
    drawDrift();
    for (const s of surfaces) drawCap(s);
    updateChunks();
    updatePuffs();
    fCtx.restore();
  }

  requestAnimationFrame(renderSnow);
}
renderSnow();

/* ---------- 用手把雪层划掉 ---------- */
const WIPE_R = 4; // 手掌宽：以落点为中心向两侧各扫 4 个采样点
function wipeAt(x, y) {
  let hit = null;
  let hitSm = null;
  for (const s of surfaces) {
    if (x < s.x - 6 || x > s.x + s.w + 6) continue;
    const sm = sampleAt(s, x);
    const snowTop = s.y + sm.cont - sm.h;
    // 手指扫到的是"雪 + 卡片上沿"这一条，往下再多给一点容错
    if (y < snowTop - 34 || y > s.y + sm.cont + 26) continue;
    if (sm.h < 0.25) continue;
    // 先抠下一小块雪屑再抹平，不然手上已经没雪可带了
    spawnCrumb(s, sm.i);
    const st = s.st;
    let removed = 0;
    for (let d = -WIPE_R; d <= WIPE_R; d++) {
      const i = sm.i + d;
      if (i < 0 || i >= st.n) continue;
      const cut = st.h[i] * (1 - (Math.abs(d) / (WIPE_R + 1)) * 0.6);
      if (cut < 0.05) continue;
      st.h[i] = Math.max(0, st.h[i] - cut);
      removed += cut;
    }
    if (removed > 0.8) {
      hit = s;
      hitSm = sm;
    }
  }
  if (!hit) return;
  const now = performance.now();
  if (now - lastPuff > 55) {
    lastPuff = now;
    spawnPuff(x, hit.y + hitSm.cont - hitSm.h, 2);
  }
}

let wiping = false;
let lastPuff = 0;
window.addEventListener('pointerdown', (e) => {
  if (introOpen()) return; // 开屏那一下不算擦雪
  wiping = true;
  wipeAt(e.clientX, e.clientY);
}, { passive: true, capture: true });
window.addEventListener('pointermove', (e) => {
  if (wiping) wipeAt(e.clientX, e.clientY);
}, { passive: true, capture: true });
window.addEventListener('pointerup', () => { wiping = false; }, { passive: true });
window.addEventListener('pointercancel', () => { wiping = false; }, { passive: true });

/* ==========================================
   点击涟漪 / 鼠标雪晶拖尾 / 双击雪晶绽放
   ========================================== */
const clickCanvas = document.getElementById('click-canvas');
const cCtx = clickCanvas.getContext('2d');
let ripples = [];
function resizeClick() {
  fitOverlayCanvas(clickCanvas, window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', resizeClick);
// 手机地址栏收起/展开时 resize 不一定触发，雪层会跟着可视区跳一下才对得上
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', () => {
    resizeSnow();
    resizeClick();
  });
}
resizeClick();

class SnowRipple {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.radius = 2;
    this.maxRadius = Math.random() * 28 + 42;
    this.alpha = 0.85;
    this.growRate = 2.2;
    this.sparks = [];
    for (let i = 0; i < 7; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * 2.8 + 1.2;
      this.sparks.push({
        x: this.x, y: this.y,
        vx: Math.cos(angle) * dist,
        vy: Math.sin(angle) * dist,
        size: Math.random() * 2 + 1,
        alpha: 1
      });
    }
  }
  update() {
    this.radius += this.growRate;
    this.alpha -= 0.022;
    this.sparks.forEach(s => {
      s.x += s.vx;
      s.y += s.vy;
      s.vy += 0.03;
      s.alpha -= 0.028;
    });
  }
  draw() {
    if (this.alpha > 0) {
      cCtx.beginPath();
      cCtx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      cCtx.strokeStyle = `rgba(91, 131, 232, ${this.alpha * 0.75})`;
      cCtx.lineWidth = 1.4;
      cCtx.stroke();
      cCtx.beginPath();
      cCtx.arc(this.x, this.y, this.radius * 0.35, 0, Math.PI * 2);
      cCtx.fillStyle = `rgba(255, 255, 255, ${this.alpha * 0.6})`;
      cCtx.fill();
    }
    this.sparks.forEach(s => {
      if (s.alpha > 0) {
        cCtx.beginPath();
        cCtx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        cCtx.fillStyle = `rgba(255, 255, 255, ${s.alpha})`;
        cCtx.strokeStyle = `rgba(91, 131, 232, ${s.alpha * 0.7})`;
        cCtx.lineWidth = 0.7;
        cCtx.fill();
        cCtx.stroke();
      }
    });
  }
}
function spawnRipple(x, y) { ripples.push(new SnowRipple(x, y)); }
window.addEventListener('click', (e) => spawnRipple(e.clientX, e.clientY));
window.addEventListener('touchstart', (e) => {
  if (e.touches.length > 0) spawnRipple(e.touches[0].clientX, e.touches[0].clientY);
}, { passive: true });

function renderRipples() {
  for (let i = ripples.length - 1; i >= 0; i--) {
    ripples[i].update();
    ripples[i].draw();
    if (ripples[i].alpha <= 0) ripples.splice(i, 1);
  }
}

/* ==========================================
   交互特效 1：桌面端鼠标雪晶拖尾
   ========================================== */
const isTouchDevice = 'ontouchstart' in window;
const stardust = [];
if (!isTouchDevice) {
  window.addEventListener('mousemove', (e) => {
    if (Math.random() < 0.5) {
      stardust.push({
        x: e.clientX + (Math.random() - 0.5) * 8,
        y: e.clientY + (Math.random() - 0.5) * 8,
        vx: (Math.random() - 0.5) * 0.6,
        vy: Math.random() * 0.45 + 0.1,
        size: Math.random() * 2 + 0.6,
        alpha: 0.85,
        decay: 0.02
      });
    }
  });
}

/* ==========================================
   交互特效 2：双击 / 双触 雪晶绽放 + 上浮文字
   ========================================== */
const crystals = [];
const quoteLabels = [];

function spawnCrystalBurst(x, y) {
  for (let i = 0; i < 9; i++) {
    const angle = (Math.PI * 2 / 9) * i + Math.random() * 0.4;
    const speed = Math.random() * 2.2 + 1.4;
    crystals.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 1.2,
      size: Math.random() * 7 + 8,
      alpha: 1,
      decay: 0.012 + Math.random() * 0.008,
      rot: Math.random() * Math.PI,
      rotSpeed: (Math.random() - 0.5) * 0.06
    });
  }
  spawnPuff(x, y, 14);
  quoteLabels.push({ x, y: y - 30, text: 'aisuru', alpha: 1 });
}

function drawCrystal(ctx, x, y, size, rot, alpha) {
  const r = size / 2;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.strokeStyle = `rgba(150, 180, 255, ${alpha})`;
  ctx.lineWidth = 1.3;
  ctx.lineCap = 'round';
  ctx.shadowColor = `rgba(255, 255, 255, ${alpha * 0.9})`;
  ctx.shadowBlur = 5;
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i;
    const cx = Math.cos(a), cy = Math.sin(a);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(cx * r, cy * r);
    const bx = cx * r * 0.6, by = cy * r * 0.6;
    for (const side of [-1, 1]) {
      const ba = a + side * 0.62;
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + Math.cos(ba) * r * 0.3, by + Math.sin(ba) * r * 0.3);
    }
    ctx.stroke();
  }
  ctx.restore();
}

// 双触（移动端）检测
let lastTapTime = 0;
let lastTapX = 0, lastTapY = 0;
window.addEventListener('touchend', (e) => {
  const t = e.changedTouches[0];
  const now = Date.now();
  if (now - lastTapTime < 320 && Math.abs(t.clientX - lastTapX) < 60 && Math.abs(t.clientY - lastTapY) < 60) {
    spawnCrystalBurst(t.clientX, t.clientY);
    lastTapTime = 0;
  } else {
    lastTapTime = now;
    lastTapX = t.clientX;
    lastTapY = t.clientY;
  }
}, { passive: true });
window.addEventListener('dblclick', (e) => spawnCrystalBurst(e.clientX, e.clientY));

/* ==========================================
   交互特效 3：环境音（风雪声 + 偶发风铃）开关
   使用 Web Audio API 程序化生成，无需外部音频文件
   ========================================== */
let audioCtx = null;
let windAudioNodes = null;
let soundOn = false;

function toggleAmbientSound() {
  const btn = document.getElementById('sound-toggle');
  if (!soundOn) {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    buildWindSound();
    soundOn = true;
    if (btn) btn.classList.add('on');
  } else {
    if (windAudioNodes) {
      windAudioNodes.master.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.8);
      const nodes = windAudioNodes;
      setTimeout(() => { try { nodes.src.stop(); } catch (err) {} }, 900);
      windAudioNodes = null;
    }
    soundOn = false;
    if (btn) btn.classList.remove('on');
  }
}

function buildWindSound() {
  const bufferSize = audioCtx.sampleRate * 2;
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * 0.35;
  }
  const src = audioCtx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;

  const lowpass = audioCtx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 420;
  lowpass.Q.value = 0.7;

  // 风的起伏：让低通截止频率缓慢摆动，听起来像一阵一阵的风雪
  const lfo = audioCtx.createOscillator();
  const lfoGain = audioCtx.createGain();
  lfo.type = 'sine';
  lfo.frequency.value = 0.09;
  lfoGain.gain.value = 230;
  lfo.connect(lfoGain);
  lfoGain.connect(lowpass.frequency);
  lfo.start();

  const master = audioCtx.createGain();
  master.gain.value = 0;
  master.gain.linearRampToValueAtTime(0.13, audioCtx.currentTime + 1.5);

  src.connect(lowpass);
  lowpass.connect(master);
  master.connect(audioCtx.destination);
  src.start();

  windAudioNodes = { src, master, lfo };
  scheduleChime();
}

function scheduleChime() {
  if (!soundOn) return;
  const delay = 6000 + Math.random() * 10000;
  setTimeout(() => {
    if (!soundOn || !audioCtx) return;
    const freq = [523.25, 587.33, 659.25, 783.99, 880][Math.floor(Math.random() * 5)];
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0.05, audioCtx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 3);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 3.2);
    scheduleChime();
  }, delay);
}

const soundBtn = document.getElementById('sound-toggle');
if (soundBtn) soundBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleAmbientSound(); });

/* ==========================================
   交互特效 5：风格页关键词胶囊点选高亮
   ========================================== */
document.querySelectorAll('.tone-chip').forEach((chip) => {
  chip.addEventListener('click', (e) => {
    e.stopPropagation();
    chip.classList.toggle('lit');
  });
});

/* ==========================================
   交互特效 6：视差大图卡 3D 倾斜 + 鼠标跟随扫光
   桌面端跟随鼠标，移动端跟随陀螺仪
   ========================================== */
const parallaxCard = document.getElementById('parallax-card');
const parallaxInner = parallaxCard ? parallaxCard.querySelector('.parallax-inner') : null;
const parallaxShine = document.getElementById('parallax-shine');

let parallaxTargetRX = 0, parallaxTargetRY = 0;
let parallaxCurRX = 0, parallaxCurRY = 0;
let parallaxTargetShineX = 30, parallaxTargetShineAlpha = 0;
let parallaxCurShineX = 30, parallaxCurShineAlpha = 0;

function updateParallaxFrame() {
  if (parallaxInner) {
    parallaxCurRX += (parallaxTargetRX - parallaxCurRX) * 0.12;
    parallaxCurRY += (parallaxTargetRY - parallaxCurRY) * 0.12;
    parallaxInner.style.transform =
      `rotateX(${parallaxCurRX.toFixed(2)}deg) rotateY(${parallaxCurRY.toFixed(2)}deg)`;
  }
  if (parallaxShine) {
    parallaxCurShineX += (parallaxTargetShineX - parallaxCurShineX) * 0.16;
    parallaxCurShineAlpha += (parallaxTargetShineAlpha - parallaxCurShineAlpha) * 0.12;
    parallaxShine.style.left = parallaxCurShineX.toFixed(1) + '%';
    parallaxShine.style.opacity = parallaxCurShineAlpha.toFixed(2);
  }
  requestAnimationFrame(updateParallaxFrame);
}

function parallaxPointer(nx, ny) {
  // nx, ny 均为 -1 ~ 1 的归一化坐标
  parallaxTargetRY = nx * 9;   // 左右倾斜
  parallaxTargetRX = -ny * 7;  // 上下倾斜
  // 扫光跟随：水平位置映射到 5% ~ 95%
  parallaxTargetShineX = 5 + ((nx + 1) / 2) * 90;
  parallaxTargetShineAlpha = 0.85;
}

if (parallaxCard) {
  if (!isTouchDevice) {
    // 桌面端：鼠标在整页范围内即可驱动（以卡片为中心计算方向）
    window.addEventListener('mousemove', (e) => {
      const rect = parallaxCard.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const maxDist = 380;
      let dx = (e.clientX - cx) / maxDist;
      let dy = (e.clientY - cy) / maxDist;
      dx = Math.max(-1, Math.min(1, dx));
      dy = Math.max(-1, Math.min(1, dy));
      parallaxPointer(dx, dy);
    });
    window.addEventListener('mouseout', (e) => {
      if (!e.relatedTarget) {
        parallaxTargetRX = 0; parallaxTargetRY = 0;
        parallaxTargetShineAlpha = 0;
      }
    });
  } else {
    // 移动端：陀螺仪驱动（设备倾斜 = 卡片倾斜）
    window.addEventListener('deviceorientation', (e) => {
      if (e.gamma === null || e.beta === null) return;
      const gx = Math.max(-1, Math.min(1, e.gamma / 30));
      const gy = Math.max(-1, Math.min(1, (e.beta - 45) / 30));
      parallaxPointer(gx, gy);
    });
  }
}
updateParallaxFrame();

/* ==========================================
   交互特效 7：设备自动识别（电脑端横屏布局 / 手机端竖屏布局）
   + 手动横竖屏切换按钮（优先级高于自动识别）
   ========================================== */
let layoutManualOverride = null; // null = 自动；true = 强制横屏；false = 强制竖屏

function applyDeviceMode() {
  const autoPC = !isTouchDevice && window.innerWidth >= 760;
  const isPC = layoutManualOverride === null ? autoPC : layoutManualOverride;
  document.body.classList.toggle('pc-mode', isPC);
  const ltBtn = document.getElementById('layout-toggle');
  if (ltBtn) {
    ltBtn.title = isPC ? '切换为竖屏布局' : '切换为横屏布局';
    ltBtn.setAttribute('aria-label', ltBtn.title);
  }
}
applyDeviceMode();
window.addEventListener('resize', applyDeviceMode);

const layoutToggle = document.getElementById('layout-toggle');
if (layoutToggle) {
  layoutToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    layoutManualOverride = !document.body.classList.contains('pc-mode');
    applyDeviceMode();
  });
}

/* ==========================================
   统一渲染循环：涟漪 / 雪晶拖尾 / 雪晶绽放 / 诗签
   ========================================== */
function renderExtras() {
  cCtx.clearRect(0, 0, clickCanvas.width, clickCanvas.height);

  renderRipples();

  // 鼠标雪晶拖尾
  for (let i = stardust.length - 1; i >= 0; i--) {
    const s = stardust[i];
    s.x += s.vx;
    s.y += s.vy;
    s.vy += 0.012;
    s.alpha -= s.decay;
    if (s.alpha <= 0) { stardust.splice(i, 1); continue; }
    cCtx.beginPath();
    cCtx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
    cCtx.fillStyle = `rgba(255, 255, 255, ${Math.min(1, s.alpha)})`;
    cCtx.strokeStyle = `rgba(91, 131, 232, ${s.alpha * 0.7})`;
    cCtx.lineWidth = 0.7;
    cCtx.fill();
    cCtx.stroke();
  }

  // 雪晶粒子
  for (let i = crystals.length - 1; i >= 0; i--) {
    const h = crystals[i];
    h.x += h.vx;
    h.y += h.vy;
    h.vy += 0.035;
    h.vx *= 0.99;
    h.rot += h.rotSpeed;
    h.alpha -= h.decay;
    if (h.alpha <= 0) { crystals.splice(i, 1); continue; }
    drawCrystal(cCtx, h.x, h.y, h.size, h.rot, Math.max(0, h.alpha));
  }

  // 上浮文字
  for (let i = quoteLabels.length - 1; i >= 0; i--) {
    const q = quoteLabels[i];
    q.y -= 0.55;
    q.alpha -= 0.008;
    if (q.alpha <= 0) { quoteLabels.splice(i, 1); continue; }
    cCtx.font = '500 15px "Noto Serif SC", serif';
    cCtx.textAlign = 'center';
    cCtx.fillStyle = `rgba(238, 238, 238, ${q.alpha})`;
    cCtx.shadowColor = 'rgba(0, 0, 0, 0.85)';
    cCtx.shadowBlur = 10;
    cCtx.fillText(q.text, q.x, q.y);
    cCtx.shadowBlur = 0;
  }

  requestAnimationFrame(renderExtras);
}
renderExtras();

/* ==========================================
   交互特效 8：信封自介表
   点击信封 → 拆封 → 信纸浮出 → 填写自介 → 封缄回看
   ========================================== */
function playSealChime() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    [659.25, 987.77].forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t0 = audioCtx.currentTime + i * 0.12;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(0.07, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 2);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(t0);
      osc.stop(t0 + 2.2);
    });
  } catch (err) { /* 音频不可用时静默降级 */ }
}

(function () {
  const stage = document.getElementById('envelope-stage');
  const env = document.getElementById('envelope');
  const formEl = document.getElementById('letter-form');
  const sumEl = document.getElementById('mf-summary');
  if (!stage || !env || !formEl || !sumEl) return;

  function openEnvelope() {
    if (stage.classList.contains('opened')) return;
    stage.classList.add('opened');
    playSealChime();
    setTimeout(() => {
      formEl.style.display = 'flex';
      formEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 620);
  }
  env.addEventListener('click', (e) => { e.stopPropagation(); openEnvelope(); });

  // 风格胶囊：默认多选，带 mf-single 的组为单选
  document.querySelectorAll('.mf-chips').forEach((group) => {
    group.querySelectorAll('.mf-chip').forEach((chip) => {
      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        if (group.classList.contains('mf-single')) {
          group.querySelectorAll('.mf-chip').forEach((c) => c.classList.remove('selected'));
          chip.classList.add('selected');
        } else {
          chip.classList.toggle('selected');
        }
      });
    });
  });

  const getVal = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
  const getChips = (id) => {
    const g = document.getElementById(id);
    if (!g) return [];
    return [...g.querySelectorAll('.mf-chip.selected')].map((c) => c.textContent.trim());
  };

  document.getElementById('mf-done').addEventListener('click', (e) => {
    e.stopPropagation();
    const rows = [
      ['风格喜好', getChips('mf-styles').join(' / ') || '—'],
      ['称呼', getVal('mf-call') || '—'],
      ['性别', getVal('mf-gender') || '—'],
      ['喜好', getVal('mf-like') || '—'],
      ['雷点', getVal('mf-hate') || '—'],
      ['时长', getChips('mf-length').join(' / ') || '—'],
      ['是否新手板', getChips('mf-newbie').join(' / ') || '—'],
      ['想说的话', getVal('mf-note') || '—']
    ];
    const body = document.getElementById('mf-sum-body');
    body.innerHTML = '';
    rows.forEach(([k, v]) => {
      const row = document.createElement('div');
      row.className = 'mf-sum-row';
      const key = document.createElement('span');
      key.className = 'mf-sum-key';
      key.textContent = '· ' + k + '：';
      const val = document.createElement('span');
      val.className = 'mf-sum-val';
      val.textContent = v;
      row.appendChild(key); row.appendChild(val);
      body.appendChild(row);
    });
    formEl.style.display = 'none';
    sumEl.style.display = 'flex';
    sumEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  document.getElementById('mf-edit').addEventListener('click', (e) => {
    e.stopPropagation();
    sumEl.style.display = 'none';
    formEl.style.display = 'flex';
    formEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
})();

/* ==========================================
   交互特效 9：背景音乐（同目录 手机录音.mp3）
   浏览器自动播放策略：第一次点击/按键后淡入播放
   ========================================== */
(function () {
  const bgMusic = document.getElementById('bg-music');
  const musicBtn = document.getElementById('music-toggle');
  if (!bgMusic || !musicBtn) return;
  const MAX_VOL = 0.55;
  let fade = null;
  let playing = false;

  function fadeTo(target) {
    clearInterval(fade);
    fade = setInterval(() => {
      const step = target > bgMusic.volume ? 0.05 : -0.05;
      const next = step > 0
        ? Math.min(target, bgMusic.volume + step)
        : Math.max(target, bgMusic.volume + step);
      bgMusic.volume = next;
      if (next === target) {
        clearInterval(fade);
        if (target === 0) bgMusic.pause();
      }
    }, 80);
  }

  function startMusic() {
    if (playing) return;
    playing = true;
    bgMusic.volume = 0;
    bgMusic.play().then(() => {
      musicBtn.classList.add('on');
      fadeTo(MAX_VOL);
    }).catch(() => { playing = false; });
  }

  function stopMusic() {
    if (!playing) return;
    playing = false;
    musicBtn.classList.remove('on');
    fadeTo(0);
  }

  // 浏览器禁止无交互自动出声：等第一次点击/按键时淡入
  const gestureStart = () => {
    startMusic();
    if (playing) {
      window.removeEventListener('pointerdown', gestureStart);
      window.removeEventListener('keydown', gestureStart);
    }
  };
  window.addEventListener('pointerdown', gestureStart);
  window.addEventListener('keydown', gestureStart);

  musicBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (playing) stopMusic();
    else startMusic();
  });
})();

/* ==========================================
   交互特效 10：开屏信封 —— 第一眼只见信封，拆开后进入主页
   ========================================== */
(function () {
  const cover = document.getElementById('intro-cover');
  if (!cover) return;
  let opened = false;
  cover.addEventListener('click', (e) => {
    e.stopPropagation();
    if (opened) return;
    opened = true;
    cover.classList.add('opened');
    playSealChime();
    setTimeout(() => {
      cover.classList.add('done');
      refreshStagger(slides);
    }, 1150);
    setTimeout(() => cover.remove(), 2300);
  });
})();
