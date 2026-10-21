/* ---------------------------------------------------------------------------------------------
 * Animated overview of "Hyperspherical Simplex Representations for Backward-Compatible Retrieval".
 *
 * Every frame is a pure function of the time t (seconds), drawn on a 1600 x 900 logical canvas, so
 * the same code runs live on the project page (index.html, animation.html) and renders the
 * overview video frame by frame (tools/render_video.py).
 *
 * Visual grammar, shared by all chapters: one figure at a time with a fixed viewpoint; a single
 * transformation per step; the current representation as a large formula (bottom left); definitions
 * that accumulate in the right column; one caption line at the bottom.
 * ------------------------------------------------------------------------------------------- */
(function () {
'use strict';

const W = 1600, H = 900;
const SERIF = '"Source Serif 4", "Noto Serif", Georgia, serif';
const SANS = 'Inter, "Liberation Sans", Arial, sans-serif';
const C = {
  bg: '#fffdf9', surface: '#ffffff', ink: '#1f2933', muted: '#5f6b7a', faint: '#9aa5b1', line: '#e4ded2',
  blue: '#2f6db5', blueDeep: '#245f96', blueSoft: '#e7eff9',
  old: '#c8862a', oldSoft: '#fbeedb', neu: '#6a54c9', neuSoft: '#f1eefb',
  good: '#2f8f5b', goodSoft: '#e4f3ea', bad: '#c4513c', badSoft: '#fbe8e3',
  axis: '#2b2f36', grid: '#9ea7b1',
  cls: ['#e0423a', '#2f74c0', '#2e9a4c'],
  clsSoft: ['#fbe3e1', '#e1ecf8', '#e0f2e5'],
};

/* ------------------------------- small math helpers ------------------------------- */
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, u) => a + (b - a) * u;
const ease = u => { u = clamp(u); return u * u * (3 - 2 * u); };
const seg = (s, a, b) => ease((s - a) / (b - a));
const win = (s, a, b, c, d) => Math.min(seg(s, a, b), 1 - seg(s, c, d));
const rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;
const add = (a, b) => a.map((v, i) => v + b[i]);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const mul = (a, k) => a.map(v => v * k);
const dotp = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const len = a => Math.sqrt(dotp(a, a));
const unit = a => { const n = len(a); return n > 1e-12 ? mul(a, 1 / n) : a.slice(); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const vlerp = (a, b, u) => a.map((v, i) => lerp(v, b[i], u));
function slerp(a, b, u) {
  const th = Math.acos(clamp(dotp(a, b), -1, 1));
  if (th < 1e-6) return a.slice();
  return add(mul(a, Math.sin((1 - u) * th) / Math.sin(th)), mul(b, Math.sin(u * th) / Math.sin(th)));
}
function basis(n) {   // two unit vectors orthogonal to the unit vector n
  const a = Math.abs(n[0]) < .9 ? [1, 0, 0] : [0, 1, 0];
  const u = unit(cross(n, a));
  return [u, cross(n, u)];
}
function rotate(p, axis, ang) {   // Rodrigues rotation of p about the unit axis
  const c = Math.cos(ang), s = Math.sin(ang), k = axis;
  return add(add(mul(p, c), mul(cross(k, p), s)), mul(k, dotp(k, p) * (1 - c)));
}
function rng(seed) {
  return function () {
    seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function gauss(r) { let u = 0; while (u === 0) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); }
const softmax = z => { const m = Math.max(...z), e = z.map(v => Math.exp(v - m)), s = e.reduce((a, b) => a + b, 0); return e.map(v => v / s); };

// Mean resultant length of vMF(mu, kappa) on S^{d-1}: m_d(kappa) = I_{d/2}(kappa) / I_{d/2-1}(kappa),
// via the continued fraction of the ratio of modified Bessel functions (Lemma G.1: E[X] = m_d(kappa) mu).
function meanResultant(d, k) {
  if (k <= 0) return 0;
  const nu = d / 2; let f = 0;
  for (let n = 400; n >= 0; n--) f = 1 / (2 * (nu + n) / k + f);
  return f;
}
// vMF sample on S^2 with fixed uniforms (u, phi): continuous in kappa, so clouds can tighten smoothly.
function vmf3(mu, k, u, phi) {
  const w = 1 + Math.log(u + (1 - u) * Math.exp(-2 * k)) / k, r = Math.sqrt(Math.max(0, 1 - w * w));
  const [a, b] = basis(mu);
  return add(mul(mu, w), add(mul(a, r * Math.cos(phi)), mul(b, r * Math.sin(phi))));
}

/* ------------------------------- drawing helpers ------------------------------- */
let A = 1;                                        // alpha of the current scene (cross-fades)
const alpha = (ctx, v = 1) => { ctx.globalAlpha = A * clamp(v); };
const font = (size, o = {}) => `${o.italic ? 'italic ' : ''}${o.weight || 400} ${size}px ${o.serif ? SERIF : SANS}`;

function text(ctx, s, x, y, o = {}) {
  ctx.font = font(o.size || 20, o);
  ctx.fillStyle = o.color || C.ink;
  ctx.textAlign = o.align || 'left';
  ctx.textBaseline = 'alphabetic';
  if (o.spacing) ctx.letterSpacing = o.spacing + 'px';
  ctx.fillText(s, x, y);
  if (o.spacing) ctx.letterSpacing = '0px';
}
function para(ctx, s, x, y, maxW, o = {}) {        // word-wrapped text, returns the next baseline
  const size = o.size || 20, lh = o.lh || size * 1.45;
  ctx.font = font(size, o);
  let line = '';
  for (const w of s.split(' ')) {
    const t = line ? line + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && line) { text(ctx, line, x, y, o); y += lh; line = w; ctx.font = font(size, o); }
    else line = t;
  }
  if (line) { text(ctx, line, x, y, o); y += lh; }
  return y;
}

/* Minimal math typesetting: italic letters, upright digits and operators, \b{..} bold vectors,
 * \r{..} roman, ^ and _ scripts, \f{num}{den} fractions and \s{..} square roots. */
function mlay(ctx, src, size, st0) {
  let i = 0;
  // boxes: width w, glyphs g, top t (negative, above the baseline)
  const glyph = (s, f, sz) => { ctx.font = f; return { w: ctx.measureText(s).width, t: -.72 * sz, g: [{ s, x: 0, dy: 0, f }] }; };
  const put = (b, c, dx, dy) => {
    for (const q of c.g) b.g.push(Object.assign({}, q, { x: q.x + dx, dy: q.dy + dy }));
    b.t = Math.min(b.t || 0, (c.t || 0) + dy);
  };
  const fnt = (ch, sz, st) => st === 'bf' ? `700 ${sz}px ${SERIF}`
    : (st !== 'rm' && /[A-Za-zα-ωϕ]/.test(ch)) ? `italic 400 ${sz}px ${SERIF}` : `400 ${sz}px ${SERIF}`;
  function atom(sz, st) {
    const ch = src[i];
    if (ch === '{') { i++; const b = group(sz, st); i++; return b; }
    if (ch === '\\' && (src[i + 1] === '{' || src[i + 1] === '}')) { i += 2; return glyph(src[i - 1], fnt(src[i - 1], sz, 'rm'), sz); }
    if (ch === '\\') {
      const m = /^\\([a-z]+)/.exec(src.slice(i)); i += m[0].length;
      if (m[1] === 'f') {
        const n = atom(sz * .8, st), d = atom(sz * .8, st), w = Math.max(n.w, d.w) + sz * .16, b = { w: w + sz * .12, g: [] };
        put(b, n, sz * .06 + (w - n.w) / 2, -sz * .5);
        put(b, d, sz * .06 + (w - d.w) / 2, sz * .5);
        b.g.push({ rule: 1, x: sz * .06, dy: -sz * .3, w, h: Math.max(1.2, sz * .05) });
        return b;
      }
      if (m[1] === 's') {   // radical sized to its content
        const a = atom(sz, st), top = Math.min(a.t || 0, -.72 * sz);
        const rs = Math.max(sz * 1.05, (-top + .12 * sz) * 1.3), r = glyph('√', `400 ${rs}px ${SERIF}`, rs);
        const b = { w: r.w + a.w + sz * .1, g: [] };
        put(b, r, 0, (rs - sz * 1.05) * .2); put(b, a, r.w + sz * .02, 0);
        b.g.push({ rule: 1, x: r.w * .92, dy: top - sz * .1, w: a.w + sz * .1, h: Math.max(1.2, sz * .05) });
        b.t = top - sz * .12;
        return b;
      }
      return atom(sz, m[1] === 'b' ? 'bf' : m[1] === 'r' ? 'rm' : st);
    }
    i++;
    if (ch === ' ') return { w: sz * .2, g: [] };
    if ('=<>≤≥→⇒∈∼+−≠≈⟂·'.includes(ch)) {
      const b = glyph(ch, ch === '≠' ? `400 ${sz * .92}px ${SANS}` : fnt(ch, sz, 'rm'), sz), p = sz * (ch === '·' ? .12 : .2), r = { w: b.w + 2 * p, g: [] };
      put(r, b, p, 0); return r;
    }
    if (ch === ',') { const b = glyph(ch, fnt(ch, sz, 'rm'), sz); b.w += sz * .16; return b; }
    return glyph(ch, fnt(ch, sz, st), sz);
  }
  function group(sz, st) {
    const b = { w: 0, g: [] };
    while (i < src.length && src[i] !== '}') {
      const a = atom(sz, st);
      let sup = null, sb = null;
      while (src[i] === '^' || src[i] === '_') {
        const k = src[i++], s = atom(sz * .68, st === 'bf' ? 'it' : st);
        if (k === '^') sup = s; else sb = s;
      }
      put(b, a, b.w, 0); b.w += a.w;
      if (sup || sb) {
        const x0 = b.w + sz * .02; let w = 0;
        if (sup) { put(b, sup, x0, -sz * .42); w = sup.w; }
        if (sb) { put(b, sb, x0, sz * .24); w = Math.max(w, sb.w); }
        b.w = x0 + w + sz * .04;
      }
    }
    return b;
  }
  return group(size, st0 || 'it');
}
function mdraw(ctx, L, x, y, color) {
  ctx.fillStyle = color; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  for (const q of L.g) {
    if (q.rule) ctx.fillRect(x + q.x, y + q.dy, q.w, q.h);
    else { ctx.font = q.f; ctx.fillText(q.s, x + q.x, y + q.dy); }
  }
}
function math(ctx, src, x, y, o = {}) {
  const L = mlay(ctx, src, o.size || 24, o.st);
  const dx = o.align === 'center' ? -L.w / 2 : o.align === 'right' ? -L.w : 0;
  mdraw(ctx, L, x + dx, y, o.color || C.ink);
  return L.w;
}
// One line mixing prose and math: parts are strings, {m: tex}, {b: bold}, {i: italic} or {t, c: color}.
function rich(ctx, parts, x, y, o = {}) {
  const size = o.size || 20;
  const items = parts.map(p => {
    if (typeof p === 'string') p = { t: p };
    if (p.m != null) { const L = mlay(ctx, p.m, o.msize || size * 1.16); return { L, w: L.w, p }; }
    const fo = Object.assign({}, o, { weight: p.b ? 600 : (o.weight || 400), italic: !!p.i || o.italic });
    const s = p.b || p.i || p.t;
    ctx.font = font(size, fo);
    return { s, fo, w: ctx.measureText(s).width, p };
  });
  const total = items.reduce((a, b) => a + b.w, 0);
  let x0 = o.align === 'center' ? x - total / 2 : o.align === 'right' ? x - total : x;
  for (const it of items) {
    const col = it.p.c || o.color || C.ink;
    if (it.L) mdraw(ctx, it.L, x0, y, col);
    else text(ctx, it.s, x0, y, Object.assign({}, it.fo, { size, color: col, align: 'left', spacing: 0 }));
    x0 += it.w;
  }
  return total;
}

function rrect(ctx, x, y, w, h, r, fill, stroke, lw = 1) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}
function circle(ctx, x, y, r, fill, stroke, lw = 1.5) {
  ctx.beginPath(); ctx.arc(x, y, Math.max(0, r), 0, 2 * Math.PI);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}
const ring = (ctx, x, y, r, col, lw = 2.2) => circle(ctx, x, y, r, '#fff', col, lw);     // old-model feature
const blob = (ctx, x, y, r, col) => circle(ctx, x, y, r, col, '#fff', 1.2);              // new-model feature
function line(ctx, x1, y1, x2, y2, col, lw = 1.5, dash) {
  ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.setLineDash(dash || []);
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.setLineDash([]);
}
function arrow(ctx, x1, y1, x2, y2, o = {}) {
  const col = o.color || C.ink, lw = o.width || 2.5, hs = o.head || 9 + lw * 1.6;
  const a = Math.atan2(y2 - y1, x2 - x1), L = Math.hypot(x2 - x1, y2 - y1);
  ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = lw; ctx.lineCap = 'round';
  ctx.setLineDash(o.dash || []);
  ctx.beginPath(); ctx.moveTo(x1, y1);
  ctx.lineTo(L > hs ? x2 - Math.cos(a) * hs * .75 : x1, L > hs ? y2 - Math.sin(a) * hs * .75 : y1); ctx.stroke();
  ctx.setLineDash([]);
  if (L > 3) {
    ctx.beginPath(); ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - Math.cos(a - .4) * hs, y2 - Math.sin(a - .4) * hs);
    ctx.lineTo(x2 - Math.cos(a + .4) * hs, y2 - Math.sin(a + .4) * hs);
    ctx.closePath(); ctx.fill();
  }
}
function badge(ctx, x, y, ok, r = 12) {
  circle(ctx, x, y, r, ok ? C.good : C.bad);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = r * .24; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  if (ok) { ctx.moveTo(x - r * .45, y + r * .02); ctx.lineTo(x - r * .1, y + r * .36); ctx.lineTo(x + r * .46, y - r * .34); }
  else { ctx.moveTo(x - r * .36, y - r * .36); ctx.lineTo(x + r * .36, y + r * .36); ctx.moveTo(x + r * .36, y - r * .36); ctx.lineTo(x - r * .36, y + r * .36); }
  ctx.stroke();
}
// rounded label with an optional check / cross; (x, y) is the left-center point (or center with align)
function pill(ctx, x, y, parts, o = {}) {
  const size = o.size || 17, pad = 14, bw = o.ok == null ? 0 : 26;
  ctx.save(); ctx.globalAlpha = 0;
  const w = rich(ctx, parts, 0, 0, { size }) + 2 * pad + bw;
  ctx.restore();
  const x0 = o.align === 'center' ? x - w / 2 : x, h = size * 2;
  const fill = o.ok == null ? (o.fill || '#fff') : o.ok ? C.goodSoft : C.badSoft;
  const stroke = o.ok == null ? (o.stroke || C.line) : o.ok ? '#c7e6d4' : '#f1c9bf';
  rrect(ctx, x0, y - h / 2, w, h, h / 2, fill, stroke);
  if (o.ok != null) badge(ctx, x0 + pad + 8, y, o.ok, 9);
  rich(ctx, parts, x0 + pad + bw, y + size * .36, { size, color: o.color || (o.ok == null ? C.ink : o.ok ? '#2c7a51' : '#a5432f') });
  return w;
}
function eyebrow(ctx, s, x, y, col = C.blueDeep) { text(ctx, s, x, y, { size: 14, weight: 700, color: col, spacing: 2 }); }

/* ------------------------------- layout helpers ------------------------------- */
const eio = u => { u = clamp(u); return u < .5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; };   // ease in-out
const mv = (s, a, b) => eio((s - a) / (b - a));                                                     // smooth motion in [a, b]
const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };
const E3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]], ONE = [1, 1, 1], O3 = [1 / 3, 1 / 3, 1 / 3], N3 = unit(ONE);
const U = E3.map(e => sub(e, O3));                 // prototypes v_c = e_c - o^k, C = 3 (norm sqrt(2/3))
const VN = U.map(unit);                            // unit prototypes
const perp1 = v => sub(v, mul(ONE, dotp(v, ONE) / 3));
const FIG = { cx: 590, cy: 556, R: 242 };          // main 3D figure
const COLX = 1110;                                 // right column

function title(ctx, s, eb, t) {
  alpha(ctx, seg(s, .55, 1.2));
  eyebrow(ctx, eb, 70, 114);
  text(ctx, t, 70, 152, { size: 31, serif: true, weight: 600 });
  alpha(ctx, 1);
}
// one caption line at the bottom: list of [t0, t1, parts]
function captions(ctx, s, list) {
  list.forEach(([a, b, parts]) => {
    const v = win(s, a, a + .7, b - .6, b);
    if (v > 0) { alpha(ctx, v); rich(ctx, parts, W / 2, 870, { size: 20, serif: true, italic: true, color: C.ink, msize: 22, align: 'center' }); }
  });
  alpha(ctx, 1);
}
// the current representation, large, bottom left: list of [t0, tex, size]
function bigFormula(ctx, s, list, x = 70, y = 812) {
  list.forEach((it, k) => {
    const t1 = k + 1 < list.length ? list[k + 1][0] : 1e9;
    const a = Math.min(seg(s, it[0], it[0] + .8), 1 - seg(s, t1 - .2, t1 + .5));
    if (a > 0) { alpha(ctx, a); math(ctx, it[1], x, y, { size: it[2] || 42 }); }
  });
  alpha(ctx, 1);
}
// accumulating definitions: items {t, t1?, draw(ctx)}
function defs(ctx, s, items) {
  items.forEach(it => {
    const a = seg(s, it.t, it.t + .7) * (it.t1 ? 1 - seg(s, it.t1, it.t1 + .6) : 1);
    if (a > 0) { alpha(ctx, a); it.draw(ctx); }
  });
  alpha(ctx, 1);
}
// text measurement, so that every box is sized to its content
function textWidth(ctx, str, o = {}) {
  ctx.font = font(o.size || 20, o);
  if (o.spacing) ctx.letterSpacing = o.spacing + 'px';
  const w = ctx.measureText(str).width;
  if (o.spacing) ctx.letterSpacing = '0px';
  return w;
}
function richWidth(ctx, parts, o = {}) {
  const size = o.size || 20;
  return parts.reduce((w, p) => {
    if (typeof p === 'string') p = { t: p };
    if (p.m != null) return w + mlay(ctx, p.m, o.msize || size * 1.16).w;
    return w + textWidth(ctx, p.b || p.i || p.t, Object.assign({}, o, { size, weight: p.b ? 600 : (o.weight || 400), italic: !!p.i || o.italic }));
  }, 0);
}
function paraLines(ctx, str, maxW, o = {}) {      // number of lines produced by para()
  ctx.font = font(o.size || 20, o);
  let n = 0, line = '';
  for (const w of str.split(' ')) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { n++; line = w; } else line = t; }
  return n + (line ? 1 : 0);
}
// legend sized to its labels; o.center: x is the horizontal center
function legend(ctx, x, y, _w, rows, o = {}) {
  const w = 44 + Math.max(...rows.map(r => richWidth(ctx, r.label, { size: 15, msize: 17 }))) + 18;
  if (o.center) x -= w / 2;
  rrect(ctx, x, y, w, rows.length * 28 + 14, 9, 'rgba(255,255,255,.94)', '#d9dee4');
  rows.forEach((r, k) => {
    const yy = y + 21 + k * 28;
    if (r.kind === 'ring') circle(ctx, x + 22, yy, 6, '#fff', r.col, 2);
    else if (r.kind === 'dash') line(ctx, x + 11, yy, x + 33, yy, r.col, 2.2, [5, 4]);
    else if (r.kind === 'line') line(ctx, x + 11, yy, x + 33, yy, r.col, 3.2);
    else circle(ctx, x + 22, yy, 6.5, rgba(r.col, .75));
    rich(ctx, r.label, x + 44, yy + 5, { size: 15, color: C.ink, msize: 17 });
  });
  return w;
}
const classRows = [{ col: C.cls[0], label: ['Class 1'] }, { col: C.cls[1], label: ['Class 2'] }, { col: C.cls[2], label: ['Class 3'] }];

/* ---------------------------------- 3D engine ---------------------------------- */
// Fixed orthographic viewpoint, shared by every 3D chapter: x towards the viewer (lower left), y to the right, z up.
const CAM = { yaw: -Math.PI / 2 - .36, pitch: .27 };
function view(cx, cy, R) {
  const cyw = Math.cos(CAM.yaw), syw = Math.sin(CAM.yaw), cp = Math.cos(CAM.pitch), sp = Math.sin(CAM.pitch);
  return {
    cx, cy, R,
    p(v) {
      const x = cyw * v[0] - syw * v[1], y = syw * v[0] + cyw * v[1], z = v[2];
      return { x: cx + R * x, y: cy - R * (z * cp + y * sp), z: -y * cp + z * sp };
    },
  };
}
function greatCircle(n, N = 160) {
  const [u, w] = basis(unit(n)), pts = [];
  for (let k = 0; k <= N; k++) { const a = 2 * Math.PI * k / N; pts.push(add(mul(u, Math.cos(a)), mul(w, Math.sin(a)))); }
  return pts;
}
function latitude(z, N = 140) {
  const r = Math.sqrt(1 - z * z), pts = [];
  for (let k = 0; k <= N; k++) { const a = 2 * Math.PI * k / N; pts.push([r * Math.cos(a), r * Math.sin(a), z]); }
  return pts;
}
function smallCircle(c, ang, N = 90) {          // points at angular distance ang from the unit vector c
  const [u, w] = basis(c), pts = [], ca = Math.cos(ang), sa = Math.sin(ang);
  for (let k = 0; k <= N; k++) { const a = 2 * Math.PI * k / N; pts.push(add(mul(c, ca), add(mul(u, sa * Math.cos(a)), mul(w, sa * Math.sin(a))))); }
  return pts;
}
function arcPts(a, b, r = 1, N = 48) { const pts = []; for (let k = 0; k <= N; k++) pts.push(mul(unit(slerp(unit(a), unit(b), k / N)), r)); return pts; }
// polyline in 3D; parts behind the sphere centre plane are drawn fainter (and dashed)
function path3(ctx, V, pts, o = {}) {
  const P = pts.map(p => V.p(p)), base = o.a == null ? 1 : o.a;
  if (base <= 0) return;
  const isBack = k => !o.noBack && (P[k].z + P[k + 1].z) < 0;
  let k = 0;
  while (k < P.length - 1) {
    const back = isBack(k);
    ctx.beginPath(); ctx.moveTo(P[k].x, P[k].y);
    let j = k;
    while (j < P.length - 1 && isBack(j) === back) { ctx.lineTo(P[j + 1].x, P[j + 1].y); j++; }
    alpha(ctx, base * (back ? (o.backA == null ? .35 : o.backA) : 1));
    ctx.strokeStyle = o.col || C.grid; ctx.lineWidth = o.lw || 1.2; ctx.lineCap = 'round';
    ctx.setLineDash(back ? (o.backDash || [3, 4]) : (o.dash || []));
    ctx.stroke(); ctx.setLineDash([]);
    k = j;
  }
}
function drawSphere(ctx, V, a) {
  if (a <= 0) return;
  alpha(ctx, a);
  const g = ctx.createRadialGradient(V.cx - V.R * .35, V.cy - V.R * .4, V.R * .05, V.cx, V.cy, V.R * 1.02);
  g.addColorStop(0, 'rgba(255,255,255,.96)'); g.addColorStop(.72, 'rgba(241,243,246,.88)'); g.addColorStop(1, 'rgba(224,229,235,.92)');
  circle(ctx, V.cx, V.cy, V.R, g);
  [-.55, 0, .55].forEach(z => path3(ctx, V, latitude(z), { col: '#a3abb5', lw: 1, dash: [9, 4, 2, 4], backDash: [2, 5], backA: .5, a: a * .85 }));
  path3(ctx, V, greatCircle([0, 1, 0]), { col: '#c3c9d0', lw: 1, a: a * .8, backA: .45, backDash: [2, 5] });
  alpha(ctx, a); circle(ctx, V.cx, V.cy, V.R, null, '#7c8590', 1.6);
}
function arrow3(ctx, V, a, b, col, o = {}) { const p = V.p(a), q = V.p(b); arrow(ctx, p.x, p.y, q.x, q.y, Object.assign({ color: col }, o)); }
function label3(ctx, V, p, tex, o = {}) { const q = V.p(p); math(ctx, tex, q.x + (o.dx || 0), q.y + (o.dy || 0), Object.assign({ size: 22, align: 'center' }, o)); }
function drawAxes(ctx, V, a, o = {}) {
  ['x', 'y', 'z'].forEach((lab, k) => {
    const aa = a * (o.alphas ? o.alphas[k] : 1); if (aa <= 0) return;
    alpha(ctx, aa);
    const e = [0, 0, 0]; e[k] = o.len || 1.32;
    arrow3(ctx, V, [0, 0, 0], e, C.axis, { width: 1.3, head: 11 });
    const off = [[-10, 22], [18, 6], [14, -4]][k];
    label3(ctx, V, e, lab, { dx: off[0], dy: off[1], size: 23, color: C.axis });
  });
  alpha(ctx, a);
}
// triangle with the colour of each vertex fading towards the opposite edge
function drawTri(ctx, P, o = {}) {
  const path = () => { ctx.beginPath(); P.forEach((p, k) => k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); };
  if (o.cols) {
    ctx.save(); path(); ctx.clip();
    const xs = P.map(p => p.x), ys = P.map(p => p.y), x0 = Math.min(...xs) - 2, y0 = Math.min(...ys) - 2;
    const w = Math.max(...xs) - x0 + 4, h = Math.max(...ys) - y0 + 4;
    for (let k = 0; k < 3; k++) {
      const p = P[k], q = P[(k + 1) % 3], r = P[(k + 2) % 3], m = { x: (q.x + r.x) / 2, y: (q.y + r.y) / 2 };
      const g = ctx.createLinearGradient(p.x, p.y, m.x, m.y);
      g.addColorStop(0, rgba(o.cols[k], o.fa == null ? .3 : o.fa)); g.addColorStop(1, rgba(o.cols[k], 0));
      ctx.fillStyle = g; ctx.fillRect(x0, y0, w, h);
    }
    ctx.restore();
  } else if (o.fill) { path(); ctx.fillStyle = o.fill; ctx.fill(); }
  if (o.edge !== null) { path(); ctx.strokeStyle = o.edge || '#6b7480'; ctx.lineWidth = o.lw || 1.1; ctx.setLineDash(o.dash || []); ctx.stroke(); ctx.setLineDash([]); }
}
// points {p, c, a, kind: 'dot' | 'ring', r, hl}; depth-sorted, fainter behind the sphere
function drawCloud(ctx, V, pts, o = {}) {
  const P = pts.filter(d => d.a > .002).map(d => ({ d, q: V.p(d.p) }));
  P.sort((a, b) => a.q.z - b.q.z);
  for (const { d, q } of P) {
    const back = o.sphere && q.z < -.02 && Math.hypot(q.x - V.cx, q.y - V.cy) < V.R;
    const r = d.r || 5.2;
    alpha(ctx, d.a * (back ? .4 : 1));
    if (d.kind === 'ring') circle(ctx, q.x, q.y, r, 'rgba(255,255,255,.9)', C.cls[d.c], 1.9);
    else circle(ctx, q.x, q.y, r, rgba(C.cls[d.c], d.op || .62));
    if (d.hl) circle(ctx, q.x, q.y, r + 2.8, null, C.ink, 1.5);
  }
  alpha(ctx, 1);
}
function rays(ctx, V, pairs, a) {             // faint segments from the origin through each point
  if (a <= 0) return;
  const o = V.p([0, 0, 0]);
  pairs.forEach(([p, c]) => { const q = V.p(p); alpha(ctx, a * .2); line(ctx, o.x, o.y, q.x, q.y, C.cls[c], 1); });
  alpha(ctx, 1);
}
function originDot(ctx, V, a, lab) {
  if (a <= 0) return;
  alpha(ctx, a); const o = V.p([0, 0, 0]); circle(ctx, o.x, o.y, 3.6, C.ink);
  if (lab) math(ctx, lab, o.x - 12, o.y - 10, { size: 21, align: 'center' });
}

/* ---------------------------------- data ---------------------------------- */
const DATA = (() => {
  const r = rng(20261022);
  const noise = (sp, off) => { const g = [gauss(r), gauss(r), gauss(r)]; return add(mul(perp1(g), sp), mul(ONE, off * gauss(r))); };
  const train = [], modA = [], modB = [];
  for (let c = 0; c < 3; c++) for (let n = 0; n < 34; n++) train.push({ c, n: noise(.15, .02), hl: false });
  [0, 1, 2].forEach(c => {            // the most typical sample of each class carries the sigma arrow
    const cl = train.filter(d => d.c === c); cl.reduce((b, d) => (len(d.n) < len(b.n) ? d : b)).hl = true;
  });
  for (let c = 0; c < 3; c++) for (let n = 0; n < 22; n++) { modA.push({ c, n: noise(.42, .02) }); modB.push({ c, n: noise(.13, .02) }); }
  const vm = [];
  for (let c = 0; c < 3; c++) for (let n = 0; n < 24; n++) vm.push({ c, u: r(), phi: 2 * Math.PI * r(), u2: r(), phi2: 2 * Math.PI * r() });
  const gal = [], qry = [];
  [150, 30, 270].forEach((a, c) => {
    for (let n = 0; n < 7; n++) {
      gal.push({ c, a: a + gauss(r) * 8, dr: (r() - .5) * 8 });
      qry.push({ c, a: a + 112 + gauss(r) * 10, dr: (r() - .5) * 8, ac: a + gauss(r) * 4.5, drc: (r() - .5) * 5, hl: c === 0 && n === 0 });
    }
  });
  const th = [];
  for (let c = 0; c < 3; c++) for (let n = 0; n < 16; n++) th.push({ c, g: gauss(r), g2: gauss(r), jr: (r() - .5) * 9, jr2: (r() - .5) * 6 });
  return { train, modA, modB, vm, gal, qry, th };
})();
const LA = 5, DISP = .3;                          // final logit scale; logits are drawn at 0.3x
const logitOf = (d, tau, amp = LA) => mul(add(U[d.c], d.n), amp * tau);
const pspOf = z => unit(sub(softmax(z), O3));

/* ===================================== CHAPTERS ===================================== */

/* ---------- title ---------- */
function miniSphere(ctx, cx, cy, R, a) {
  const V = view(cx, cy, R);
  drawSphere(ctx, V, a);
  path3(ctx, V, greatCircle(N3), { col: '#5d6672', lw: 1.3, a });
  drawCloud(ctx, V, DATA.modB.map(d => ({ p: pspOf(logitOf(d, 1, 5.6)), c: d.c, a, r: 3.8 })), { sphere: true });
  alpha(ctx, a); VN.forEach((v, c) => arrow3(ctx, V, [0, 0, 0], mul(v, .97), C.cls[c], { width: 2.2, head: 10 }));
}
function chTitle(ctx, s) {
  alpha(ctx, seg(s, .2, 1.2));
  rrect(ctx, W / 2 - 46, 190, 92, 30, 15, C.blueSoft, '#cfe1f3');
  text(ctx, 'arXiv', W / 2, 211, { size: 14, weight: 700, color: C.blueDeep, align: 'center', spacing: 2 });
  text(ctx, 'Hyperspherical Simplex Representations', W / 2, 292, { size: 54, serif: true, weight: 600, align: 'center' });
  text(ctx, 'for Backward-Compatible Retrieval', W / 2, 356, { size: 54, serif: true, weight: 600, align: 'center' });
  alpha(ctx, seg(s, .7, 1.8));
  text(ctx, 'Backward-compatible representations from the simplex geometry of softmax outputs and logits', W / 2, 410, { size: 22, serif: true, italic: true, color: C.muted, align: 'center' });
  miniSphere(ctx, W / 2, 575, 100, seg(s, 1, 2.2));
  alpha(ctx, seg(s, 1.4, 2.6));
  text(ctx, 'Simone Ricci*      Niccolò Biondi*      Federico Pernici      Alberto Del Bimbo', W / 2, 760, { size: 20, align: 'center' });
  text(ctx, 'Media Integration and Communication Center (MICC), University of Florence   ·   *equal contribution', W / 2, 792, { size: 15, color: C.muted, align: 'center' });
  alpha(ctx, 1);
}

/* ---------- 1. a retrieval example: what a model update does to a deployed system ---------- */
// neutral pictograms standing in for gallery images: 0 airplane, 1 ship, 2 car
// Animal glyphs from Font Awesome Free (CC BY 4.0), loaded as a web font by the page: 0 cat, 1 dog, 2 bird
const FA = '"Font Awesome 6 Free"', GLYPH = ['', '', ''], ANIMAL = ['cat', 'dog', 'bird'];
function animal(ctx, kind, x, y, size, col, flip) {
  ctx.save(); ctx.translate(x, y); if (flip) ctx.scale(-1, 1);
  ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (!document.fonts || document.fonts.check(`900 ${Math.round(size)}px ${FA}`)) { ctx.font = `900 ${size}px ${FA}`; ctx.fillText(GLYPH[kind], 0, 0); }
  else { ctx.font = `600 ${size * .32}px ${SANS}`; ctx.fillText(ANIMAL[kind], 0, 0); }
  ctx.restore();
}
function thumb(ctx, x, y, s, kind, v, status) {
  const g = ctx.createLinearGradient(x, y, x, y + s);
  g.addColorStop(0, ['#eef2f7', '#f1f3f6', '#ecf0f4', '#f2f2f0'][v % 4]); g.addColorStop(1, '#dde3ea');
  rrect(ctx, x, y, s, s, 10, g);
  const sc = .56 + .14 * ((v * 37) % 10) / 10, ox = ((v * 53) % 7 - 3) * s * .014, oy = ((v * 29) % 7 - 3) * s * .012;
  animal(ctx, kind, x + s / 2 + ox, y + s / 2 + oy + s * .02, s * sc, '#4a5563', v % 2 === 1);
  if (status != null) { rrect(ctx, x - 3, y - 3, s + 6, s + 6, 12, null, status ? C.good : C.bad, 2.6); badge(ctx, x + s - 2, y + 2, status, 10); }
}
// Twenty illustrative queries. In each setting, the number of correct top-1 results equals round(CMC@1 x 20),
// with CMC@1 from Fig. 5 (torchvision AlexNet updated to ResNet-50, ImageNet-1K).
const RET = (() => {
  const r = rng(404), N = 20, q = [];
  const cls = [0, 1, 2, 0, 2, 1, 0, 1, 2, 0, 1, 0, 2, 1, 0, 2, 1, 0, 2, 1];
  for (let i = 0; i < N; i++) q.push({ c: cls[i], v: 3 + Math.floor(r() * 40), ease: r() });
  return { N, q, r };
})();
const RROWS = [
  { grp: 0, t0: 2.4, title: 'before the update', qm: 'φ^k', gm: 'φ^k', cmc: 27.26 },
  { grp: 0, t0: 5.4, title: 'after the update, no re-indexing', qm: 'φ^t', gm: 'φ^k', cmc: 0.06, verdict: false },
  { grp: 0, t0: 8.4, title: 'after re-indexing the gallery', qm: 'φ^t', gm: 'φ^t', cmc: 66.33 },
  { grp: 1, t0: 12.2, title: 'before the update', qm: 'φ^k', gm: 'φ^k', cmc: 49.22 },
  { grp: 1, t0: 15.2, title: 'after the update, no re-indexing', qm: 'φ^t', gm: 'φ^k', cmc: 69.22, verdict: true },
  { grp: 1, t0: 18.2, title: 'after re-indexing the gallery', qm: 'φ^t', gm: 'φ^t', cmc: 70.55 },
];
RROWS.forEach((row, k) => {      // which queries are answered correctly, and what is retrieved otherwise
  const r = rng(900 + k), n = Math.round(row.cmc / 100 * RET.N);
  const score = RET.q.map(d => d.ease + (r() - .5) * .5);
  const order = score.map((v, i) => i).sort((a, b) => score[b] - score[a]);
  row.n = n;
  row.res = RET.q.map((d, i) => {
    const ok = order.indexOf(i) < n;
    return { ok, c: ok ? d.c : (d.c + 1 + Math.floor(r() * 2)) % 3, v: 5 + Math.floor(r() * 40) };
  });
});
function tile(ctx, x, y, s, kind, v, status) {        // small gallery image with a correctness frame
  const g = ctx.createLinearGradient(x, y, x, y + s);
  g.addColorStop(0, status == null ? '#eef2f7' : status ? '#eef8f2' : '#fbefec'); g.addColorStop(1, status == null ? '#dde3ea' : status ? '#dcefe3' : '#f5dcd5');
  rrect(ctx, x, y, s, s, 7, g, status == null ? '#8b949e' : status ? C.good : C.bad, status == null ? 1.2 : 2);
  const sc = .56 + .12 * ((v * 37) % 10) / 10;
  animal(ctx, kind, x + s / 2 + ((v * 53) % 5 - 2) * s * .02, y + s / 2 + s * .02, s * sc, '#4a5563', v % 2 === 1);
}
function chRetrieval(ctx, s) {
  title(ctx, s, 'THE PROBLEM', 'Model updates in a deployed retrieval system');
  const X0 = 360, SL = 52, TS = 46, MX = 1424;
  const rowY = k => (k < 3 ? 298 : 338) + k * 56;
  // queries
  alpha(ctx, seg(s, .6, 1.2));
  text(ctx, 'queries', 70, 222, { size: 15.5, weight: 600 });
  text(ctx, 'images are illustrative', 70, 242, { size: 13, color: C.faint });
  RET.q.forEach((d, i) => { alpha(ctx, seg(s, .7 + i * .04, 1.1 + i * .04)); tile(ctx, X0 + i * SL, 196, TS, d.c, d.v, null); });
  alpha(ctx, seg(s, 1.4, 2));
  text(ctx, 'CMC@1 (%)', MX, 212, { size: 14, weight: 600, color: C.muted });
  text(ctx, 'correct top-1 / 20', MX, 232, { size: 12.5, color: C.faint });
  // group headings
  [['ENCODER FEATURES (BASELINE)', 2], ['PSP', 12]].forEach(([h, t0], g) => {
    alpha(ctx, seg(s, t0 - .4, t0 + .2));
    eyebrow(ctx, h, 70, (g ? rowY(3) : rowY(0)) - 14);
    line(ctx, 70, (g ? rowY(3) : rowY(0)) - 6, MX + 110, (g ? rowY(3) : rowY(0)) - 6, C.line, 1);
  });
  // rows: top-1 retrieved gallery item of every query
  RROWS.forEach((row, k) => {
    const y = rowY(k), a = seg(s, row.t0, row.t0 + .5);
    if (a <= 0) return;
    alpha(ctx, a);
    text(ctx, row.title, 70, y + 20, { size: 15.5, weight: 600 });
    rich(ctx, ['query ', { m: row.qm }, ' · gallery ', { m: row.gm }], 70, y + 41, { size: 14, color: C.muted, msize: 17 });
    row.res.forEach((r, i) => { alpha(ctx, seg(s, row.t0 + .3 + i * .045, row.t0 + .6 + i * .045)); tile(ctx, X0 + i * SL, y, TS, r.c, r.v + k * 7, r.ok); });
    const m = seg(s, row.t0 + 1.3, row.t0 + 1.9);
    if (m > 0) {
      alpha(ctx, m);
      const col = row.verdict == null ? C.ink : row.verdict ? C.good : C.bad;
      text(ctx, row.cmc.toFixed(2), MX, y + 26, { size: 25, serif: true, weight: 600, color: col });
      text(ctx, row.n + ' / 20', MX, y + 44, { size: 13, color: C.muted });
    }
  });
  // the pairs compared by the empirical criterion (Eq. 8), within each representation
  [[0, 7.4, false], [3, 17, true]].forEach(([k, t0, ok]) => {
    const a = seg(s, t0, t0 + .7); if (a <= 0) return;
    alpha(ctx, a);
    const y0 = rowY(k) + 18, y1 = rowY(k + 1) + 18, bx = MX + 84;
    ctx.strokeStyle = ok ? C.good : C.bad; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(bx - 8, y0); ctx.lineTo(bx, y0); ctx.lineTo(bx, y1); ctx.lineTo(bx - 8, y1); ctx.stroke();
    badge(ctx, bx + 14, (y0 + y1) / 2, ok, 10);
  });
  // compatibility verdicts, within each representation
  const vy = 728;
  alpha(ctx, seg(s, 7.4, 8.1));
  badge(ctx, 80, vy - 6, false, 11);
  rich(ctx, [{ b: 'Encoder features are not backward compatible: ' }, { m: 'M(φ^t, φ^k) = 0.06 < M(φ^k, φ^k) = 27.26' }], 102, vy, { size: 16, msize: 20 });
  alpha(ctx, seg(s, 17, 17.7));
  badge(ctx, 80, vy + 38, true, 11);
  rich(ctx, [{ b: 'PSP is backward compatible: ' }, { m: 'M(φ^t, φ^k) = 69.22 > M(φ^k, φ^k) = 49.22' }, ', without re-indexing the gallery'], 102, vy + 44, { size: 16, msize: 20 });
  alpha(ctx, seg(s, 3, 3.8));
  text(ctx, 'Each row shows the top-1 retrieved gallery item of every query; the fraction of correct items equals CMC@1 on ImageNet-1K for torchvision AlexNet updated to ResNet-50 (Fig. 5).', 70, 816, { size: 13, color: C.faint });
  captions(ctx, s, [
    [.8, 5.2, ['Queries are searched against a gallery encoded once by the deployed model ', { m: 'φ^k' }, '.']],
    [5.2, 8.2, ['After an update, new queries compared with the old gallery retrieve the wrong class: CMC@1 drops to 0.06%.']],
    [8.2, 12, ['Re-indexing restores retrieval, but every gallery item must be encoded again with the new model.']],
    [12, 18, ['With PSP, new queries are compared with the old gallery directly, and retrieval improves over the old model.']],
    [18, 27, ['Backward compatibility holds when new-to-old retrieval outperforms old-to-old retrieval (Eq. 8).']],
  ]);
}

/* ---------- 2. backward compatibility: two feature spaces (2D) ---------- */
const CA = { cx: 285, cy: 548, R: 165 }, CB = { cx: 760, cy: 548, R: 165 };
const OLD_ANG = [150, 30, 270], ROT = -90;          // the updated model arranges the classes 90 degrees apart from the old one
const onC = (P, a, dr = 0) => ({ x: P.cx + (P.R + dr) * Math.cos(rad(a)), y: P.cy - (P.R + dr) * Math.sin(rad(a)) });
function classBadge(ctx, P, a, c, al) {
  if (al <= 0) return;
  const q = onC(P, a, 42); alpha(ctx, al);
  circle(ctx, q.x, q.y, 18, '#fff', C.cls[c], 1.6); animal(ctx, c, q.x, q.y + 1, 19, C.cls[c]);
}
function chCompat(ctx, s) {
  title(ctx, s, 'BACKWARD COMPATIBILITY', 'Two models, two feature spaces');
  const aA = seg(s, .4, 1.4), aB = seg(s, 2.4, 3.4);
  const rot = ROT * (1 - mv(s, 10.8, 13.6));
  // spaces
  [[CA, aA], [CB, aB]].forEach(([P, a]) => { alpha(ctx, a); circle(ctx, P.cx, P.cy, P.R, '#f3f5f8', '#a9b2bc', 1.6); circle(ctx, P.cx, P.cy, 3, C.faint); });
  alpha(ctx, aA);
  rich(ctx, ['deployed model ', { m: 'φ^k' }], CA.cx, CA.cy - CA.R - 64, { size: 18, weight: 600, align: 'center', msize: 21 });
  text(ctx, 'stored gallery features', CA.cx, CA.cy - CA.R - 40, { size: 14, color: C.muted, align: 'center' });
  alpha(ctx, aB);
  rich(ctx, ['updated model ', { m: 'φ^t' }], CB.cx, CB.cy - CB.R - 64, { size: 18, weight: 600, align: 'center', msize: 21 });
  alpha(ctx, aB * (1 - seg(s, 11, 12)));
  text(ctx, 'trained independently', CB.cx, CB.cy - CB.R - 40, { size: 14, color: C.muted, align: 'center' });
  alpha(ctx, seg(s, 13, 14));
  text(ctx, 'backward compatible', CB.cx, CB.cy - CB.R - 40, { size: 14, color: C.good, weight: 600, align: 'center' });
  // features
  DATA.gal.forEach((g, k) => { alpha(ctx, aA * seg(s, .8 + k * .03, 1.4 + k * .03)); const p = onC(CA, g.a, g.dr); circle(ctx, p.x, p.y, 6.2, '#fff', C.cls[g.c], 2.1); });
  DATA.qry.forEach((q, k) => { alpha(ctx, aB * seg(s, 2.8 + k * .03, 3.4 + k * .03)); const p = onC(CB, q.ac + rot, q.drc); circle(ctx, p.x, p.y, 6, rgba(C.cls[q.c], .72)); });
  [0, 1, 2].forEach(c => { classBadge(ctx, CA, OLD_ANG[c], c, aA * seg(s, 1.2, 2)); classBadge(ctx, CB, OLD_ANG[c] + rot, c, aB * seg(s, 3.2, 4)); });
  // the query of the updated model, compared with the stored gallery at the same coordinates
  const hq = DATA.qry.find(q => q.hl);
  const qT = { x: CB.cx + 150, y: 196 };
  const qa = seg(s, 4.4, 5.2);
  if (qa > 0) {
    alpha(ctx, qa);
    thumb(ctx, qT.x, qT.y, 74, 0, 2); rrect(ctx, qT.x - 3, qT.y - 3, 80, 80, 11, null, C.ink, 1.4);
    text(ctx, 'query', qT.x + 37, qT.y - 10, { size: 13.5, weight: 600, color: C.muted, align: 'center' });
    const p = onC(CB, hq.ac + rot, hq.drc);
    alpha(ctx, qa * (1 - seg(s, 10.2, 10.8)));
    arrow(ctx, qT.x + 10, qT.y + 78, p.x + 6, p.y - 10, { color: C.ink, width: 1.4, head: 9, dash: [4, 4] });
    alpha(ctx, qa);
    circle(ctx, p.x, p.y, 9.5, null, C.ink, 1.6);
  }
  const transfer = (t0, r0, aIn) => {     // carries the query feature from B to A, keeping its coordinates
    if (aIn <= 0) return;
    const pB = onC(CB, hq.ac + r0, hq.drc), pA = onC(CA, hq.ac + r0, hq.drc), u = mv(s, t0, t0 + 1.8);
    const cx = (pA.x + pB.x) / 2, cy = Math.min(pA.y, pB.y) - 110;
    alpha(ctx, aIn * .55);
    ctx.setLineDash([4, 5]); ctx.strokeStyle = C.neu; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(pB.x, pB.y); ctx.quadraticCurveTo(cx, cy, lerp(pB.x, pA.x, 1), pA.y); ctx.stroke(); ctx.setLineDash([]);
    const q = { x: (1 - u) * (1 - u) * pB.x + 2 * u * (1 - u) * cx + u * u * pA.x, y: (1 - u) * (1 - u) * pB.y + 2 * u * (1 - u) * cy + u * u * pA.y };
    alpha(ctx, aIn);
    circle(ctx, q.x, q.y, 7, rgba(C.cls[0], .85)); circle(ctx, q.x, q.y, 10, null, C.ink, 1.6);
    if (u >= 1) {
      let best = null, bd = 1e9;
      DATA.gal.forEach(g => { const p = onC(CA, g.a, g.dr), d = Math.hypot(p.x - pA.x, p.y - pA.y); if (d < bd) { bd = d; best = { p, g }; } });
      const v = aIn * seg(s, t0 + 1.9, t0 + 2.5), ok = best.g.c === 0;
      alpha(ctx, v);
      line(ctx, pA.x, pA.y, best.p.x, best.p.y, ok ? C.good : C.bad, 2.6);
      const lx = pA.x + (pA.x < CA.cx ? 16 : 26), ly = pA.y + (pA.x < CA.cx ? 42 : -26);
      badge(ctx, lx + 10, ly - 5, ok, 10);
      text(ctx, 'retrieves a ' + ANIMAL[best.g.c], lx + 26, ly, { size: 14.5, weight: 600, color: ok ? C.good : C.bad });
    }
  };
  transfer(5.8, ROT, win(s, 5.6, 6, 10.4, 11));
  transfer(14, 0, seg(s, 13.8, 14.2) * (1 - seg(s, 17, 17.6)));
  // the two spaces now coincide: new features drawn in the old space
  const ov = seg(s, 17.4, 18.4);
  if (ov > 0) DATA.qry.forEach(q => { alpha(ctx, ov); const p = onC(CA, q.ac, q.drc); circle(ctx, p.x, p.y, 6, rgba(C.cls[q.c], .72)); });
  // right column
  const X = 1060;
  alpha(ctx, aA);
  legend(ctx, X, 196, 420, [
    { kind: 'ring', col: C.ink, label: ['gallery feature ', { m: '\\b{h}^k_j' }, ' (deployed model)'] },
    { kind: 'dot', col: '#5f6b7a', label: ['feature ', { m: '\\b{h}^t_i' }, ' of the updated model'] },
  ]);
  defs(ctx, s, [
    { t: 1, draw: c => rich(c, ['gallery, stored once: ', { m: '\\b{h}^k_j = φ^k(x_j)' }], X, 330, { size: 18 }) },
    { t: 3, draw: c => rich(c, ['queries after the update: ', { m: '\\b{h}^t_i = φ^t(x_i)' }], X, 380, { size: 18 }) },
    { t: 17.6, draw: c => {
      const l1 = [{ m: 'd(\\b{h}^t_i, \\b{h}^k_j) ≤ d(\\b{h}^k_i, \\b{h}^k_j)' }, '  if ', { m: 'y_i = y_j' }, { t: '    (1a)', c: C.muted }];
      const l2 = [{ m: 'd(\\b{h}^t_i, \\b{h}^k_j) ≥ d(\\b{h}^k_i, \\b{h}^k_j)' }, '  if ', { m: 'y_i ≠ y_j' }, { t: '    (1b)', c: C.muted }];
      const eb = 'DEFINITION 3.1 · BACKWARD COMPATIBILITY';
      const bw = Math.max(textWidth(c, eb, { size: 14, weight: 700, spacing: 2 }), richWidth(c, l1, { size: 16, msize: 24 }), richWidth(c, l2, { size: 16, msize: 24 })) + 36;
      rrect(c, X - 4, 420, bw, 168, 12, '#ffffff', '#d9dee4');
      eyebrow(c, eb, X + 14, 450);
      rich(c, l1, X + 14, 498, { size: 16, msize: 24 });
      rich(c, l2, X + 14, 544, { size: 16, msize: 24 });
      text(c, 'Shen et al., 2020', X + 14, 574, { size: 13.5, color: C.faint });
    } },
    { t: 20.6, draw: c => para(c, 'Existing methods train the new model with respect to the old one, learn mappings between feature spaces, or share a pre-allocated classifier across updates.', X, 636, 480, { size: 16, color: C.muted, lh: 23 }) },
  ]);
  captions(ctx, s, [
    [.8, 5.6, ['The deployed model and an independently trained update arrange the classes differently.']],
    [5.6, 10.6, ['A new query is compared with the stored gallery at the same coordinates: it retrieves the wrong class.']],
    [10.6, 17.2, ['Backward-compatible features place each class where the gallery features of that class lie.']],
    [17.2, 26, ['Formally, new-to-old distances must be at least as discriminative as old-to-old distances.']],
  ]);
}

/* ---------- 2. training: logits and softmax outputs (Fig. 2) ---------- */
function chTraining(ctx, s) {
  title(ctx, s, 'TRAINING', 'Logits and softmax outputs under cross-entropy');
  const V = view(FIG.cx, FIG.cy, FIG.R);
  const base = seg(s, .3, 1.3);
  const tau = mv(s, 4.2, 17.5);
  drawAxes(ctx, V, base);
  // probability simplex
  alpha(ctx, base);
  drawTri(ctx, E3.map(e => V.p(e)), { cols: C.cls });
  E3.forEach((e, c) => { const q = V.p(e); circle(ctx, q.x, q.y, 4.5, C.cls[c]); });
  label3(ctx, V, E3[0], '\\b{e}_1', { dx: -24, dy: -6 });
  label3(ctx, V, E3[1], '\\b{e}_2', { dx: 6, dy: 30 });
  label3(ctx, V, E3[2], '\\b{e}_3', { dx: 24, dy: 2 });
  { const q = V.p(O3); circle(ctx, q.x, q.y, 4, C.ink); math(ctx, '\\b{o}^k', q.x + 20, q.y - 8, { size: 21, align: 'center' }); }
  // regular simplex spanned by the class-mean logits (gray), and the prototype directions
  const ga = seg(s, 17.8, 19.4);
  const meanD = c => mul(U[c], LA * tau * DISP);
  if (ga > 0) {
    alpha(ctx, ga);
    drawTri(ctx, [0, 1, 2].map(c => V.p(meanD(c))), { fill: 'rgba(120,128,140,.10)', edge: '#a3abb5', dash: [5, 4] });
  }
  // points: logits (drawn at 0.3x) and softmax outputs
  const pts = [], hls = [];
  DATA.train.forEach(d => {
    const z = logitOf(d, tau);
    pts.push({ p: mul(z, DISP), c: d.c, a: base, r: 5, hl: d.hl && s > 4 });
    const p = softmax(z);
    pts.push({ p, c: d.c, a: base, r: 4.6, op: .7, hl: d.hl && s > 4 });
    if (d.hl) hls.push([mul(z, DISP), p, d.c]);
  });
  drawCloud(ctx, V, pts);
  // sigma arrows for one sample per class (as in Fig. 2)
  const sa = seg(s, 5.5, 6.5) * base;
  if (sa > 0) hls.forEach(([z, p], k) => {
    const a = V.p(z), b = V.p(p), L = Math.hypot(b.x - a.x, b.y - a.y);
    if (L < 18) return;
    alpha(ctx, sa); arrow(ctx, a.x, a.y, b.x + (a.x - b.x) * 9 / L, b.y + (a.y - b.y) * 9 / L, { color: C.ink, width: 1.6, head: 9, dash: [5, 4] });
    if (k === 1) math(ctx, 'σ', (a.x + b.x) / 2 + 14, (a.y + b.y) / 2 + 4, { size: 22 });
  });
  // prototype arrows along the logits
  if (ga > 0) {
    alpha(ctx, ga);
    [0, 1, 2].forEach(c => arrow3(ctx, V, [0, 0, 0], meanD(c), C.cls[c], { width: 3, head: 14 }));
    [0, 1, 2].forEach(c => label3(ctx, V, mul(meanD(c), 1.16), '\\b{v}_' + (c + 1), { color: C.cls[c] }));
  }
  // labels as in Fig. 2
  const la = seg(s, 9, 10) * base;
  if (la > 0) {
    alpha(ctx, la);
    const zq = V.p(mul(U[1], LA * tau * DISP * 1.05)), sq = V.p(E3[1]);
    math(ctx, '\\b{z}^k', zq.x + 54, zq.y + 44, { size: 24 });
    math(ctx, 'σ(\\b{z}^k)', sq.x - 4, sq.y - 30, { size: 22 });
  }
  // training progress
  alpha(ctx, base * win(s, 3.6, 4.2, 19, 20));
  text(ctx, 'training progress', 70, 200, { size: 14, color: C.muted });
  rrect(ctx, 200, 191, 220, 6, 3, '#e3e7ec'); rrect(ctx, 200, 191, 220 * tau, 6, 3, C.blue);
  // right column
  alpha(ctx, base);
  const lw = legend(ctx, COLX, 196, 0, classRows);
  defs(ctx, s, [
    { t: 1.6, draw: c => math(c, 'σ(\\b{z})_c = \\f{e^{z_c}}{Σ_j e^{z_j}}', COLX, 350, { size: 26 }) },
    { t: 3.4, draw: c => rich(c, [{ m: 'ℓ = − \\r{log} σ(\\b{z})_y' }, '   one-hot target ', { m: '\\b{e}_y' }], COLX, 418, { size: 17, msize: 26 }) },
    { t: 8, draw: c => math(c, '∇_{\\b{z}} ℓ = σ(\\b{z}) − \\b{e}_y', COLX, 482, { size: 26 }) },
    { t: 11, draw: c => rich(c, [{ m: '\\b{1}^⊤ ∇_{\\b{z}} ℓ = 0' }, ':  logits stay centered'], COLX, 540, { size: 17, msize: 26 }) },
    { t: 19, draw: c => rich(c, [{ m: '\\b{v}_c = \\b{e}_c − \\b{o}^k' }, '   (Prop. 3.3)'], COLX, 604, { size: 17, msize: 26 }) },
  ]);
  bigFormula(ctx, s, [[.8, '\\b{z}^k  →  σ(\\b{z}^k)'], [19, '\\b{z}^k / ‖\\b{z}^k‖  →  \\b{v}_c / ‖\\b{v}_c‖', 34]]);
  alpha(ctx, base * seg(s, 2, 3));
  text(ctx, 'logits drawn at reduced scale', COLX + lw + 18, 252, { size: 13.5, color: C.faint });
  captions(ctx, s, [
    [1.2, 4.6, ['Before training, the logits are at the origin and every softmax output is at the simplex center ', { m: '\\b{o}^k' }, '.']],
    [4.6, 11.4, ['Cross-entropy with one-hot labels drives each softmax output toward the vertex ', { m: '\\b{e}_c' }, ' of its class.']],
    [11.4, 18.4, ['The gradient ', { m: 'σ(\\b{z}) − \\b{e}_y' }, ' sums to zero, so the logits remain centered as they grow.']],
    [18.4, 26, ['The logits align with the prototype directions ', { m: '\\b{v}_c = \\b{e}_c − \\b{o}^k' }, ' and form a regular simplex.']],
    [26, 34, ['Softmax outputs concentrate near the vertices; logits keep a larger within-class spread (Fig. 2).']],
  ]);
}

/* ---------- 3. PSP: centering and normalization ---------- */
function chPSP(ctx, s) {
  title(ctx, s, 'PSP · PROBABILITY SIMPLEX PROJECTION', 'From softmax outputs to the hypersphere');
  const V = view(FIG.cx, FIG.cy, FIG.R);
  const base = seg(s, .2, 1.2);
  const lam = mv(s, 10, 14), nv = mv(s, 19.5, 23.5);
  const shift = mul(O3, -lam);
  drawSphere(ctx, V, seg(s, .3, 1.6));
  path3(ctx, V, greatCircle(N3), { col: '#5d6672', lw: 1.6, a: seg(s, 22.5, 24.5), backA: .4 });
  drawAxes(ctx, V, base);
  // ghost of the original simplex, then the translated simplex
  const ghost = seg(s, 9.5, 10.2) * (1 - seg(s, 30, 31.5));
  if (ghost > 0) { alpha(ctx, ghost * .9); drawTri(ctx, E3.map(e => V.p(e)), { edge: '#8b949e', dash: [5, 4], cols: C.cls, fa: .07 }); }
  const triA = base * (1 - .75 * seg(s, 23, 25));
  alpha(ctx, triA);
  drawTri(ctx, E3.map(e => V.p(add(e, shift))), { cols: C.cls });
  // centers
  { const q = V.p(add(O3, shift)); alpha(ctx, triA); circle(ctx, q.x, q.y, 4, C.ink); }
  alpha(ctx, base * (1 - .5 * lam));
  { const q = V.p(O3); math(ctx, '\\b{o}^k', q.x + 20, q.y - 8, { size: 21, align: 'center' }); }
  const ca = win(s, 9.6, 10.4, 18.6, 19.6);
  if (ca > 0) {               // translation o^k -> o
    alpha(ctx, ca * .75);
    const a = V.p(O3), b = V.p([0, 0, 0]);
    arrow(ctx, a.x, a.y, b.x, b.y, { color: '#8b949e', width: 4, head: 14 });
  }
  originDot(ctx, V, seg(s, 9.8, 10.6), '\\b{o}');
  // vertex labels
  alpha(ctx, base * (1 - .6 * seg(s, 9.5, 10.5)));
  label3(ctx, V, E3[0], '\\b{e}_1', { dx: -24, dy: -6 });
  label3(ctx, V, E3[1], '\\b{e}_2', { dx: 6, dy: 30 });
  label3(ctx, V, E3[2], '\\b{e}_3', { dx: 24, dy: 2 });
  // direct normalization: classes at most pi/2 apart
  const na = win(s, 3.4, 4.2, 8.6, 9.4);
  if (na > 0) {
    path3(ctx, V, arcPts(E3[0], E3[1], 1), { col: C.bad, lw: 3, a: na, noBack: true });
    path3(ctx, V, arcPts(E3[1], E3[2], 1), { col: C.bad, lw: 3, a: na, noBack: true });
    path3(ctx, V, arcPts(E3[0], E3[2], 1), { col: C.bad, lw: 3, a: na, noBack: true });
    alpha(ctx, na);
    const m = V.p(mul(unit([1, 1, 0]), 1.0)); text(ctx, '90°', m.x + 6, m.y + 30, { size: 20, weight: 700, color: C.bad, align: 'center' });
  }
  // points
  const pts = [], rs = [];
  DATA.train.forEach(d => {
    const q = add(softmax(logitOf(d, 1)), shift);
    pts.push({ p: vlerp(q, unit(q), nv), c: d.c, a: base, r: 4.8, op: .7 });
    rs.push([unit(q), d.c]);
  });
  rays(ctx, V, rs, win(s, 19, 19.6, 23.8, 24.8));
  drawCloud(ctx, V, pts, { sphere: nv > .5 });
  // prototypes
  const pa = seg(s, 15, 16.2);
  if (pa > 0) {
    alpha(ctx, pa);
    const vs = U.map(v => vlerp(v, unit(v), nv));
    vs.forEach((v, c) => arrow3(ctx, V, [0, 0, 0], v, C.cls[c], { width: 3, head: 14 }));
    vs.forEach((v, c) => label3(ctx, V, mul(v, 1.15), '\\b{v}_' + (c + 1), { color: C.cls[c], dx: c === 2 ? -18 : 0 }));
    const aa = seg(s, 26.5, 27.5);
    if (aa > 0) {
      path3(ctx, V, arcPts(VN[0], VN[1], .34), { col: C.good, lw: 2.6, a: aa, noBack: true });
      alpha(ctx, aa);
      const m = V.p(mul(unit(add(VN[0], VN[1])), .5));
      text(ctx, '120°', m.x, m.y + 8, { size: 20, weight: 700, color: C.good, align: 'center' });
    }
  }
  // right column
  alpha(ctx, base);
  legend(ctx, COLX, 196, 230, classRows);
  defs(ctx, s, [
    { t: .8, draw: c => rich(c, [{ m: '\\b{e}_c ∈ \\{0,1\\}^C' }, ',   ', { m: '‖\\b{e}_c‖_1 = 1' }], COLX, 350, { size: 18, msize: 25 }) },
    { t: 1.4, draw: c => math(c, '\\b{o}^k = \\f{1}{C} \\b{1}', COLX, 412, { size: 26 }) },
    { t: 10, draw: c => math(c, '\\b{P}_{k,k} = \\b{I} − \\f{1}{C} \\b{J}', COLX, 480, { size: 26 }) },
    { t: 12.5, draw: c => math(c, '\\b{o} = \\b{P}_{k,k} \\b{o}^k = \\b{0}', COLX, 540, { size: 26 }) },
    { t: 20, draw: c => math(c, '\\b{v}_c = \\f{\\b{P}_{k,k} \\b{e}_c}{‖\\b{P}_{k,k} \\b{e}_c‖_2}', COLX, 610, { size: 26 }) },
    { t: 27, draw: c => math(c, '\\b{v}^⊤_i \\b{v}_j = − \\f{1}{C − 1}', COLX, 690, { size: 26 }) },
  ]);
  bigFormula(ctx, s, [[.6, 'σ(\\b{z}^k)'], [10, '\\b{P}_{k,k} σ(\\b{z}^k)'], [19.6, '\\f{\\b{P}_{k,k} σ(\\b{z}^k)}{‖\\b{P}_{k,k} σ(\\b{z}^k)‖_2}', 44]]);
  captions(ctx, s, [
    [.8, 3.4, ['PSP starts from the softmax outputs of a trained classifier, which lie on the probability simplex.']],
    [3.4, 9.4, ['The simplex lies in the non-negative orthant: normalizing it directly gives angles of at most π/2 between classes.']],
    [9.4, 18.8, ['The centering projection ', { m: '\\b{P}_{k,k}' }, ' translates the simplex so that its center ', { m: '\\b{o}^k' }, ' moves to the origin.']],
    [18.8, 26.2, ['ℓ2-normalization then projects every representation radially onto the unit hypersphere.']],
    [26.2, 36, ['The prototypes ', { m: '\\b{v}_c' }, ' form a regular simplex centered at the origin, with pairwise angles greater than π/2.']],
  ]);
}

/* ---------- 4. LSP: normalized logits ---------- */
function chLSP(ctx, s) {
  title(ctx, s, 'LSP · LOGITS SIMPLEX PROJECTION', 'Normalizing the logits');
  const V = view(FIG.cx, FIG.cy, FIG.R);
  const base = seg(s, .2, 1.2), nv = mv(s, 4, 8.5);
  drawSphere(ctx, V, base);
  path3(ctx, V, greatCircle(N3), { col: '#5d6672', lw: 1.6, a: base, backA: .4 });
  drawAxes(ctx, V, base);
  originDot(ctx, V, base, '\\b{o}');
  const pts = [], rs = [];
  DATA.train.forEach(d => {
    const z = mul(logitOf(d, 1), DISP);
    pts.push({ p: vlerp(z, unit(z), nv), c: d.c, a: base, r: 4.8 });
    rs.push([z, d.c]);
  });
  rays(ctx, V, rs, win(s, 3.6, 4.2, 8.8, 9.8));
  drawCloud(ctx, V, pts, { sphere: nv > .5 });
  alpha(ctx, base);
  VN.forEach((v, c) => arrow3(ctx, V, [0, 0, 0], v, C.cls[c], { width: 3, head: 14 }));
  VN.forEach((v, c) => label3(ctx, V, mul(v, 1.15), '\\b{v}_' + (c + 1), { color: C.cls[c], dx: c === 2 ? -18 : 0 }));
  // spread comparison
  const sa = seg(s, 11, 12);
  if (sa > 0) {
    alpha(ctx, sa);
    const ttl = 'Within-class spread (Sec. 3.2.2)', r1 = [{ b: 'PSP' }, '   tighter, closer to the prototypes'], r2 = [{ b: 'LSP' }, '   larger spread, more information retained'];
    const bw = Math.max(textWidth(ctx, ttl, { size: 15, weight: 600 }), richWidth(ctx, r1, { size: 15 }), richWidth(ctx, r2, { size: 15 })) + 36;
    rrect(ctx, COLX, 600, bw, 118, 12, '#ffffff', '#d9dee4');
    text(ctx, ttl, COLX + 18, 630, { size: 15, weight: 600 });
    rich(ctx, r1, COLX + 18, 664, { size: 15, color: C.muted });
    rich(ctx, r2, COLX + 18, 696, { size: 15, color: C.muted });
  }
  alpha(ctx, base);
  legend(ctx, COLX, 196, 230, classRows);
  defs(ctx, s, [
    { t: .8, draw: c => rich(c, [{ m: '\\b{1}^⊤ \\b{z}^k ≈ 0' }, ':  centered logits'], COLX, 350, { size: 17, msize: 25 }) },
    { t: 4, draw: c => math(c, '\\b{h}^k = \\f{\\b{z}^k}{‖\\b{z}^k‖_2}', COLX, 420, { size: 26 }) },
    { t: 9, draw: c => rich(c, ['same prototypes ', { m: '\\b{v}_c' }, ' as PSP'], COLX, 500, { size: 17, msize: 24 }) },
  ]);
  bigFormula(ctx, s, [[.6, '\\b{z}^k'], [4, '\\f{\\b{z}^k}{‖\\b{z}^k‖_2}', 44]]);
  captions(ctx, s, [
    [.8, 4, ['LSP uses the logits directly: they are approximately centered and aligned with the prototypes.']],
    [4, 10.6, ['ℓ2-normalization projects them onto the hypersphere; no projection matrix is required.']],
    [10.6, 18, ['LSP shares the prototypes of PSP, with a larger angular spread around them.']],
  ]);
}

/* ---------- 5. a reference shared by independently trained models ---------- */
function chReference(ctx, s) {
  title(ctx, s, 'SHARED REFERENCE', 'Independently trained models share the prototypes');
  const L = view(430, 520, 200), Rv = view(1110, 520, 200);
  const la = seg(s, .4, 1.6), ra = seg(s, 6, 7.2);
  const dA = [unit([.2, .9, .4]), unit([-.8, -.1, .5]), unit([.3, -.6, -.7])];
  const dB = [unit([-.5, .3, -.8]), unit([.6, .7, -.2]), unit([-.2, -.9, .3])];
  // encoder features: arbitrary arrangement per model
  drawSphere(ctx, L, la);
  const ptsL = [];
  DATA.vm.forEach(d => {
    ptsL.push({ p: vmf3(dA[d.c], 45, d.u, d.phi), c: d.c, kind: 'ring', a: la * seg(s, 1, 2), r: 4.6 });
    ptsL.push({ p: vmf3(dB[d.c], 80, d.u2, d.phi2), c: d.c, a: la * seg(s, 2.4, 3.4), r: 4.6 });
  });
  drawCloud(ctx, L, ptsL, { sphere: true });
  // PSP features of the same two models
  drawSphere(ctx, Rv, ra);
  path3(ctx, Rv, greatCircle(N3), { col: '#5d6672', lw: 1.4, a: ra, backA: .4 });
  const ptsR = [];
  DATA.modA.forEach(d => ptsR.push({ p: pspOf(logitOf(d, 1, 2.6)), c: d.c, kind: 'ring', a: ra * seg(s, 7, 8), r: 4.6 }));
  DATA.modB.forEach(d => ptsR.push({ p: pspOf(logitOf(d, 1, 5.6)), c: d.c, a: ra * seg(s, 8.4, 9.4), r: 4.6 }));
  drawCloud(ctx, Rv, ptsR, { sphere: true });
  alpha(ctx, ra); VN.forEach((v, c) => arrow3(ctx, Rv, [0, 0, 0], mul(v, .98), C.cls[c], { width: 2.4, head: 11 }));
  // headings and verdicts
  alpha(ctx, la);
  text(ctx, 'Encoder features', 430, 280, { size: 20, weight: 600, align: 'center' });
  alpha(ctx, ra);
  text(ctx, 'PSP features', 1110, 280, { size: 20, weight: 600, align: 'center' });
  alpha(ctx, la * seg(s, 3.6, 4.4));
  pill(ctx, 430, 768, ['class positions differ across models'], { ok: false, align: 'center', size: 16 });
  alpha(ctx, ra * seg(s, 9.6, 10.4));
  pill(ctx, 1110, 768, ['same prototypes ', { m: '\\b{v}_c' }, ' for both models'], { ok: true, align: 'center', size: 16 });
  alpha(ctx, seg(s, .8, 1.6));
  legend(ctx, 770, 196, 0, [
    { kind: 'ring', col: C.ink, label: ['old model ', { m: 'φ^k' }] },
    { kind: 'dot', col: '#5f6b7a', label: ['new model ', { m: 'φ^t' }, ', trained independently'] },
  ], { center: true });
  captions(ctx, s, [
    [.8, 5.8, ['The encoders of two independently trained models arrange the classes arbitrarily.']],
    [5.8, 12, ['With PSP, both models map each class to the same prototype, fixed by the one-hot label space.']],
    [12, 20, ['This common reference is what makes their features directly comparable.']],
  ]);
}

/* ---------- class expansion: the simplex center moves; P_{t,k} restores alignment (cf. Fig. 4) ---------- */
const TRI = (() => {
  const cx = 320, cy = 560, side = 400, h = side * Math.sqrt(3) / 2;
  const V = [[cx - side / 2, cy + h / 3], [cx + side / 2, cy + h / 3], [cx, cy - 2 * h / 3]];
  return { cx, cy, V, at: p => [p[0] * V[0][0] + p[1] * V[1][0] + (p[2] || 0) * V[2][0], p[0] * V[0][1] + p[1] * V[1][1] + (p[2] || 0) * V[2][1]] };
})();
const CP = { cx: 840, cy: 548, R: 160 };             // plane of the prototypes, centered at the origin
const EXP = (() => {                                // step-k (two classes) and step-t (three classes) softmax outputs
  const r = rng(31), gal = [];
  for (let c = 0; c < 2; c++) for (let n = 0; n < 12; n++) { const d = 3.4 + gauss(r) * .9, p = 1 / (1 + Math.exp(-d)); gal.push({ c, p: c === 0 ? [p, 1 - p, 0] : [1 - p, p, 0], j: (r() - .5) * 8 }); }
  return { gal };
})();
function chExpansion(ctx, s) {
  title(ctx, s, 'CLASS EXPANSION', 'A new class moves the simplex center');
  const [E1, E2, E3] = TRI.V, OK = [(E1[0] + E2[0]) / 2, E1[1]], OT = [TRI.cx, TRI.cy];
  const base = seg(s, .4, 1.4), stepT = seg(s, 4.6, 5.8), mc = mv(s, 6, 9);
  const ctr = [lerp(OK[0], OT[0], mc), lerp(OK[1], OT[1], mc)];
  // ---- left: barycentric coordinates ----
  alpha(ctx, base);
  text(ctx, 'probability simplex (barycentric coordinates)', TRI.cx, 288, { size: 14.5, color: C.muted, align: 'center' });
  if (stepT > 0) { alpha(ctx, stepT); drawTri(ctx, TRI.V.map(v => ({ x: v[0], y: v[1] })), { cols: C.cls, fa: .24 }); }
  alpha(ctx, base);
  { const g = ctx.createLinearGradient(E1[0], E1[1], E2[0], E2[1]); g.addColorStop(0, C.cls[0]); g.addColorStop(1, C.cls[1]); ctx.strokeStyle = g; ctx.lineWidth = 3.2; ctx.beginPath(); ctx.moveTo(E1[0], E1[1]); ctx.lineTo(E2[0], E2[1]); ctx.stroke(); }
  [[E1, 0, -16, 30], [E2, 1, 16, 30], [E3, 2, 24, 4]].forEach(([e, c, dx, dy]) => {
    alpha(ctx, c === 2 ? stepT : base); circle(ctx, e[0], e[1], 5.5, C.cls[c]); math(ctx, '\\b{e}_' + (c + 1), e[0] + dx, e[1] + dy, { size: 22, align: 'center' });
  });
  // gallery (step k) on the edge, queries (step t) inside the triangle
  EXP.gal.forEach(g => { const q = TRI.at(g.p); alpha(ctx, base * seg(s, 1.4, 2.2)); circle(ctx, q[0], q[1] + g.j * .4, 4.8, '#fff', C.cls[g.c], 1.8); });
  const qa = seg(s, 9.6, 10.6);
  if (qa > 0) DATA.train.forEach(d => { const q = TRI.at(softmax(logitOf(d, 1, 3.2))); alpha(ctx, qa); circle(ctx, q[0], q[1], 4.4, rgba(C.cls[d.c], .65)); });
  // old prototypes (dashed, from o^k) and current prototypes (from the moving center)
  const ga = seg(s, 6, 6.8);
  [E1, E2].forEach((e, c) => { alpha(ctx, ga * .9); arrow(ctx, OK[0], OK[1], e[0] + (c ? -8 : 8), e[1], { color: C.cls[c], width: 2, head: 11, dash: [6, 5] }); });
  [E1, E2, E3].forEach((e, c) => {
    alpha(ctx, (c === 2 ? stepT : base) * seg(s, 1.8, 2.6));
    const L = Math.hypot(e[0] - ctr[0], e[1] - ctr[1]), f = (L - 9) / L;
    arrow(ctx, ctr[0], ctr[1], ctr[0] + (e[0] - ctr[0]) * f, ctr[1] + (e[1] - ctr[1]) * f, { color: C.cls[c], width: 3, head: 13 });
  });
  alpha(ctx, base); circle(ctx, ctr[0], ctr[1], 5, C.ink);
  alpha(ctx, base * (1 - seg(s, 6, 6.8))); math(ctx, '\\b{o}^k', ctr[0] + 4, ctr[1] - 14, { size: 21, align: 'center' });
  alpha(ctx, seg(s, 8.6, 9.4)); math(ctx, '\\b{o}^t', ctr[0] + 22, ctr[1] - 6, { size: 21, align: 'center' });
  alpha(ctx, ga * .6); circle(ctx, OK[0], OK[1], 3.5, C.ink); math(ctx, '\\b{o}^k', OK[0], OK[1] + 30, { size: 19, align: 'center', color: C.muted });
  // misalignment: angle at e1 between the old and the new prototype direction
  const th = seg(s, 9.6, 10.4) * (1 - seg(s, 20.5, 21.2));
  if (th > 0) {
    alpha(ctx, th);
    const a0 = Math.atan2(OK[1] - E1[1], OK[0] - E1[0]), a1 = Math.atan2(OT[1] - E1[1], OT[0] - E1[0]);
    ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(E1[0], E1[1], 92, Math.min(a0, a1), Math.max(a0, a1)); ctx.stroke();
    math(ctx, 'θ^{k→t} = 30°', E1[0] + 190, E1[1] - 24, { size: 19, align: 'center' });
  }
  // ---- right: the plane of the prototypes, centered at the origin ----
  const ra = seg(s, 11.6, 12.6);
  if (ra > 0) {
    const drop = mv(s, 15.2, 17.4), norm = mv(s, 18, 20);
    const P = (x, y) => ({ x: CP.cx + CP.R * x, y: CP.cy + CP.R * y });
    const proj = (x, y) => { const yy = y * (1 - drop), xn = Math.sign(x) * Math.max(Math.abs(x), 1e-3); return [lerp(x, xn / Math.abs(xn), norm), yy]; };
    alpha(ctx, ra);
    text(ctx, 'plane of the prototypes (centered)', CP.cx, 288, { size: 14.5, color: C.muted, align: 'center' });
    circle(ctx, CP.cx, CP.cy, CP.R, '#f3f5f8', '#a9b2bc', 1.6);
    line(ctx, CP.cx - CP.R - 30, CP.cy, CP.cx + CP.R + 30, CP.cy, '#8b949e', 1.3, [5, 4]);
    text(ctx, 'step-k axis', CP.cx + CP.R * .55, CP.cy - 10, { size: 13, color: C.muted, align: 'center' });
    circle(ctx, CP.cx, CP.cy, 3.4, C.ink);
    // gallery at step k: the two points +-v^k
    // with two classes every gallery feature is exactly +-v^k: one marker per class
    [[-1, 0], [1, 1]].forEach(([x, c]) => { const p = P(x, 0); circle(ctx, p.x, p.y, 8.5, '#fff', C.cls[c], 2.4); });
    // queries at step t, projected by P_{t,k} (vertical drop onto the step-k axis), then normalized
    DATA.train.forEach(d => {
      const q = TRI.at(softmax(logitOf(d, 1, 3.2))), dx = q[0] - OT[0], dy = q[1] - OT[1], L = Math.hypot(dx, dy);
      const [x, y] = proj(dx / L, dy / L), p = P(x, y);
      alpha(ctx, ra * seg(s, 12.4, 13.2) * (d.c === 2 ? 1 - drop : 1));   // the new class has no step-k counterpart
      circle(ctx, p.x, p.y, 4.6, rgba(C.cls[d.c], .65));
    });
    // prototypes: v^k (dashed) and v^t, which P_{t,k} maps onto v^k
    const tip = (x, y) => { const L = Math.hypot(x, y), f = L > .2 ? (L * CP.R - 11) / (L * CP.R) : 1; return P(x * f, y * f); };   // arrows stop at the gallery marker
    [[-1, 0], [1, 1]].forEach(([x, c]) => { alpha(ctx, ra * .9); const p = tip(x, 0); arrow(ctx, CP.cx, CP.cy, p.x, p.y, { color: C.cls[c], width: 2, head: 11, dash: [6, 5] }); });
    const vt = [[-Math.sqrt(3) / 2, .5], [Math.sqrt(3) / 2, .5], [0, -1]];
    vt.forEach(([x0, y0], c) => {
      const [x, y] = c < 2 ? proj(x0, y0) : [x0 * (1 - drop), y0 * (1 - drop)];
      const p = tip(x, y);
      alpha(ctx, ra * (c === 2 ? 1 - drop : 1));
      if (Math.hypot(x, y) > .05) arrow(ctx, CP.cx, CP.cy, p.x, p.y, { color: C.cls[c], width: 3, head: 13 });
      // Fig. 4: projection arrows onto the step-k axis
      if (c < 2) {
        const ga2 = win(s, 14.4, 15, 17.6, 18.2);
        if (ga2 > 0) { alpha(ctx, ga2); const a = P(x0, y0), b = P(x0, 0); arrow(ctx, a.x, a.y + 6, b.x, b.y - 4, { color: C.ink, width: 1.6, head: 9 }); }
      }
    });
    alpha(ctx, ra * (1 - seg(s, 15, 15.6)));
    vt.forEach(([x0, y0], c) => { const p = P(x0 * 1.2, y0 * 1.2); math(ctx, '\\b{v}^t_' + (c + 1), p.x, p.y + 8, { size: 20, align: 'center', color: C.cls[c] }); });
    alpha(ctx, ra * seg(s, 20, 20.8));
    [[-1, 0], [1, 1]].forEach(([x, c]) => { const p = P(x * 1.22, 0); math(ctx, '\\b{v}^k_' + (c + 1), p.x, p.y - 16, { size: 20, align: 'center', color: C.cls[c] }); });
    alpha(ctx, seg(s, 20.6, 21.4));
    badge(ctx, CP.cx - 12, CP.cy + CP.R + 40, true, 11);
    text(ctx, 'aligned with step k (Prop. 3.5)', CP.cx + 6, CP.cy + CP.R + 45, { size: 15, weight: 600, color: C.good });
  }
  // right column
  const X = 1100;
  defs(ctx, s, [
    { t: 1.4, draw: c => rich(c, ['step k:  ', { m: '\\b{o}^k = \\f{1}{2}(1, 1, 0)' }], X, 330, { size: 17, msize: 23 }) },
    { t: 6.2, draw: c => rich(c, ['step t:  ', { m: '\\b{o}^t = \\f{1}{3}(1, 1, 1)' }], X, 392, { size: 17, msize: 23 }) },
    { t: 9.8, draw: c => { math(c, 'θ^{k→t} = \\r{arccos} \\s{\\f{C^k − 1}{C^k} · \\f{C^t}{C^t − 1}}', X, 470, { size: 22 }); rich(c, ['2 → 3:  ', { b: '30.0°' }, '    5 → 10:  ', { b: '19.5°' }, '    10 → 100:  ', { b: '17.6°' }], X, 520, { size: 14.5, color: C.muted }); } },
    { t: 14.2, draw: c => math(c, '\\b{P}_{t,k} = [ \\b{P}_{k,k} | \\b{0} ]', X, 590, { size: 25 }) },
    { t: 15.6, draw: c => { math(c, '\\b{P}_{t,k} (\\f{2}{3}, −\\f{1}{3}, −\\f{1}{3})^⊤ = (\\f{1}{2}, −\\f{1}{2})^⊤', X, 658, { size: 21 }); rich(c, ['the class-1 prototype is mapped onto ', { m: '\\b{v}^k_1' }], X, 704, { size: 14.5, color: C.muted, msize: 17 }); } },
  ]);
  bigFormula(ctx, s, [[.6, '\\r{step} k:  C^k = 2', 34], [4.8, '\\r{step} t:  C^t = 3', 34], [14.2, '\\b{P}_{t,k} \\b{h}^t', 40]]);
  captions(ctx, s, [
    [.8, 4.6, ['At step k the classifier has two classes: the simplex is the segment ', { m: '\\b{e}_1\\b{e}_2' }, ', with center ', { m: '\\b{o}^k' }, '.']],
    [4.6, 9.6, ['Adding a class extends the simplex and moves its center to ', { m: '\\b{o}^t' }, ': every prototype changes direction.']],
    [9.6, 14.4, ['The existing prototypes rotate by the same angle (Eq. 6): condition (a) of the theorem is violated.']],
    [14.4, 20.4, ['In the plane of the prototypes, ', { m: '\\b{P}_{t,k}' }, ' is the projection onto the step-k axis; normalization completes the alignment.']],
    [20.4, 30, ['The correction depends only on the numbers of classes: no data, no training, no learned parameters.']],
  ]);
}

/* ---------- 7. vMF class distributions and increasing concentration ---------- */
const KK = 5, KT = 25;                               // concentrations of the old and updated models
const capAngle = k => Math.acos(clamp(Math.log(.25 * Math.exp(k) + .75 * Math.exp(-k)) / k, -1, 1));   // 75% of the mass
function drawCap(ctx, V, mu, k, col, a, o = {}) {
  if (a <= 0) return;
  const pts = smallCircle(mu, capAngle(k));
  const P = pts.map(p => V.p(p));
  if (!o.dash) {
    alpha(ctx, a * .16);
    ctx.beginPath(); P.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); ctx.fillStyle = col; ctx.fill();
  }
  path3(ctx, V, pts, { col, lw: o.dash ? 1.6 : 2, dash: o.dash, a: a * .9, backA: .3 });
}
function densityPlot(ctx, x, y, w, h, kNew, a) {
  if (a <= 0) return;
  alpha(ctx, a);
  rrect(ctx, x, y, w, h, 10, '#ffffff', '#d9dee4');
  const px = x + 26, py = y + h - 34, pw = w - 52, ph = h - 70;
  line(ctx, px, py, px + pw, py, '#8b949e', 1.2);
  line(ctx, px + pw / 2, py, px + pw / 2, py + 5, '#8b949e', 1.2);
  math(ctx, '0', px + pw / 2, py + 22, { size: 15, align: 'center', color: C.muted });
  math(ctx, '−π/2', px, py + 22, { size: 15, align: 'center', color: C.muted });
  math(ctx, 'π/2', px + pw, py + 22, { size: 15, align: 'center', color: C.muted });
  text(ctx, 'density vs angle to the prototype', x + 16, y + 24, { size: 13.5, color: C.muted });
  const curve = (k, col, dash, lw) => {
    ctx.beginPath();
    for (let i = 0; i <= 120; i++) { const th = -Math.PI / 2 + Math.PI * i / 120, v = Math.exp(k * (Math.cos(th) - 1)); const X = px + pw * i / 120, Y = py - ph * v; i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }
    ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.setLineDash(dash || []); ctx.stroke(); ctx.setLineDash([]);
  };
  curve(KK, C.old, [6, 4], 2);
  if (kNew > KK + .01) curve(kNew, C.neu, null, 2.6);
  math(ctx, 'κ^k', px + pw * .82, py - ph * .48, { size: 17, color: C.old });
  if (kNew > KK + .01) math(ctx, 'κ^t', px + pw * .58, py - ph * .9, { size: 17, color: C.neu });
}
function chVMF(ctx, s) {
  title(ctx, s, 'ASSUMPTIONS', 'Class distributions on the hypersphere');
  const V = view(FIG.cx, FIG.cy, FIG.R);
  const base = seg(s, .2, 1.2);
  const kNew = lerp(KK, KT, mv(s, 11, 16));
  const newA = seg(s, 9.6, 10.6);
  drawSphere(ctx, V, base);
  path3(ctx, V, greatCircle(N3), { col: '#5d6672', lw: 1.3, a: base * .8, backA: .4 });
  // caps (75% of the mass): old dashed, new filled
  VN.forEach((mu, c) => {
    drawCap(ctx, V, mu, KK, C.cls[c], base * seg(s, 3, 4), { dash: newA > 0 ? [6, 4] : null });
    drawCap(ctx, V, mu, kNew, C.cls[c], newA);
  });
  // samples: old (rings, kappa^k), new (dots, kappa^t)
  const pts = [];
  DATA.vm.forEach(d => {
    pts.push({ p: vmf3(VN[d.c], KK, d.u, d.phi), c: d.c, kind: 'ring', a: base * seg(s, 1.6, 2.8), r: 4.3 });
    pts.push({ p: vmf3(VN[d.c], kNew, d.u2, d.phi2), c: d.c, a: newA, r: 4.4 });
  });
  drawCloud(ctx, V, pts, { sphere: true });
  // mean vectors E[X] = m_d(kappa) mu
  const ma = seg(s, 17, 18);
  if (ma > 0) {
    const mk = meanResultant(3, KK), mt = meanResultant(3, kNew);
    VN.forEach((mu, c) => {
      alpha(ctx, ma); arrow3(ctx, V, [0, 0, 0], mul(mu, mk), C.ink, { width: 2, head: 11, dash: [5, 4] });
      alpha(ctx, ma); arrow3(ctx, V, [0, 0, 0], mul(mu, mt), C.cls[c], { width: 3.2, head: 13 });
    });
  }
  alpha(ctx, base);
  VN.forEach((v, c) => label3(ctx, V, mul(v, 1.16), '\\b{μ}_' + (c + 1), { color: C.cls[c], dx: c === 2 ? -18 : 0 }));
  originDot(ctx, V, base);
  densityPlot(ctx, COLX, 640, 340, 180, kNew, seg(s, 9.6, 10.6));
  // right column
  alpha(ctx, base);
  legend(ctx, COLX, 196, 310, [
    { kind: 'ring', col: C.ink, label: ['old model ', { m: 'φ^k' }, ',  ', { m: 'κ^k' }] },
    { kind: 'dot', col: '#5f6b7a', label: ['new model ', { m: 'φ^t' }, ',  ', { m: 'κ^t' }] },
  ]);
  defs(ctx, s, [
    { t: 1.6, draw: c => { text(c, '(i)', COLX, 340, { size: 17, weight: 600 }); math(c, 'f(\\b{x}; \\b{μ}_c, κ) ∝ \\r{exp}(κ \\b{μ}^⊤_c \\b{x})', COLX + 36, 340, { size: 23 }); } },
    { t: 9.6, draw: c => { text(c, '(ii)', COLX, 400, { size: 17, weight: 600 }); math(c, 'κ^t_c > κ^k_c', COLX + 36, 400, { size: 23 }); } },
    { t: 17, draw: c => math(c, '\\b{E}[\\b{X}] = m_d(κ) \\b{μ},   m_d(κ) = \\f{I_{d/2}(κ)}{I_{d/2−1}(κ)}', COLX, 476, { size: 22 }) },
    { t: 21.5, draw: c => { text(c, 'Lemma G.1', COLX, 546, { size: 14, weight: 600, color: C.muted }); math(c, '\\b{E}[1 − \\b{X}^⊤_1 \\b{X}_2] = 1 − m_d(κ_1) m_d(κ_2) \\b{μ}^⊤_1 \\b{μ}_2', COLX, 584, { size: 21 }); } },
  ]);
  captions(ctx, s, [
    [.8, 9.4, ['Assumption (i): the features of each class follow a von Mises–Fisher distribution centered on its prototype.']],
    [9.4, 16.8, ['Assumption (ii): the updated model is more concentrated, so its distributions shrink around the same prototypes.']],
    [16.8, 21.4, ['The mean vector ', { m: '\\b{E}[\\b{X}] = m_d(κ)\\b{μ}' }, ' lengthens as the concentration increases.']],
    [21.4, 30, ['The expected cosine distance depends only on the mean vectors (Lemma G.1).']],
  ]);
}

/* ---------- 8. Theorem 3.6 (2D section through the prototypes) ---------- */
const TC = { cx: 440, cy: 520, R: 228 };
function chTheorem(ctx, s) {
  title(ctx, s, 'THEOREM 3.6', 'Conditions for backward compatibility in expectation');
  const { cx, cy, R } = TC;
  const base = seg(s, .2, 1.2);
  const delta = rad(40) * mv(s, 14, 17) * (1 - mv(s, 19.5, 22.5));
  const phi = rad(lerp(120, 70, mv(s, 23.5, 26.5) * (1 - mv(s, 29, 32))));
  const cor = seg(s, 33, 34.2);
  const mk = meanResultant(3, KK), mt = meanResultant(3, KT);
  const a1 = Math.PI / 2 + phi / 2, a2 = Math.PI / 2 - phi / 2, a3 = rad(270), at1 = a1 + delta;
  const P = (a, r = R) => ({ x: cx + r * Math.cos(a), y: cy - r * Math.sin(a) });
  alpha(ctx, base);
  circle(ctx, cx, cy, R, '#f3f5f8', '#a9b2bc', 1.6);
  circle(ctx, cx, cy, 3.2, C.faint);
  rich(ctx, ['section of ', { m: '\\b{S}^{d−1}' }, ' through the prototypes'], cx, cy + R + 40, { size: 14.5, color: C.muted, align: 'center' });
  // pi/2 reference while condition (b) is examined
  const gb = win(s, 23, 23.8, 32, 32.8);
  if (gb > 0) { alpha(ctx, gb * .9); const g = P(a2 + Math.PI / 2, R + 10); line(ctx, cx, cy, g.x, g.y, C.muted, 1.4, [6, 6]); math(ctx, 'π/2', g.x - 10, g.y - 6, { size: 19, align: 'right', color: C.muted }); }
  const protos = [{ k: a1, t: at1, a: 1 }, { k: a2, t: a2, a: 1 }, { k: a3, t: a3, a: cor }];
  DATA.th.forEach(q => {
    const pr = protos[q.c]; if (pr.a <= 0) return;
    alpha(ctx, base * pr.a);
    const po = P(pr.k + clamp(q.g, -2.2, 2.2) / Math.sqrt(KK), R + q.jr); circle(ctx, po.x, po.y, 5.2, '#fff', C.cls[q.c], 1.9);
    const pn = P(pr.t + clamp(q.g2, -2.2, 2.2) / Math.sqrt(KT), R + q.jr2); circle(ctx, pn.x, pn.y, 5.2, rgba(C.cls[q.c], .68));
  });
  protos.forEach((pr, c) => {
    if (pr.a <= 0) return;
    alpha(ctx, base * pr.a);
    const e = P(pr.k, R * mk); arrow(ctx, cx, cy, e.x, e.y, { color: C.ink, width: 2, dash: [5, 4], head: 11 });
    const f = P(pr.t, R * mt); arrow(ctx, cx, cy, f.x, f.y, { color: C.cls[c], width: 3.4, head: 14 });
    const l = P(pr.k, R + 40); math(ctx, '\\b{μ}_' + (c + 1), l.x, l.y + 8, { size: 24, align: 'center', color: C.cls[c] });
  });
  alpha(ctx, base * (1 - cor));
  ctx.strokeStyle = C.ink; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(cx, cy, 46, -a1, -a2); ctx.stroke();
  text(ctx, Math.round(deg(phi)) + '°', cx, cy - 58, { size: 18, weight: 700, align: 'center', color: deg(phi) > 90 ? C.good : C.bad });
  if (delta > rad(.5)) {
    alpha(ctx, clamp(deg(delta) / 6));
    ctx.strokeStyle = C.bad; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.arc(cx, cy, R * .55, -at1, -a1); ctx.stroke();
    const l = P(a1 + delta / 2, R * .55 + 20); math(ctx, 'δ', l.x, l.y + 6, { size: 22, align: 'center', color: C.bad });
  }
  // right column: statement, then margins, then corollary
  const X = 880, Wp = 660;
  alpha(ctx, base * seg(s, 1, 1.8));
  rrect(ctx, X, 192, Wp, 160, 12, C.neuSoft, '#ddd3f3');
  text(ctx, 'THEOREM 3.6', X + 20, 222, { size: 13, weight: 700, color: C.neu, spacing: 1.5 });
  text(ctx, 'Under assumptions (i) and (ii), inequalities (1a) and (1b) hold in expectation if', X + 20, 256, { size: 17 });
  const okA = delta < rad(.5), okB = phi > rad(90);
  badge(ctx, X + 30, 290, okA, 10);
  text(ctx, '(a) corresponding prototypes are aligned across updates;', X + 50, 296, { size: 17 });
  badge(ctx, X + 30, 324, okB, 10);
  rich(ctx, ['(b) prototypes of different classes form angles ', { m: '> π/2' }, '.'], X + 50, 330, { size: 17 });
  const mg = seg(s, 7.4, 8.4) * (1 - cor);
  if (mg > 0) {
    const Akk = 1 - mk * mk, Atk = 1 - mt * mk * Math.cos(delta);
    const Bkk = 1 - mk * mk * Math.cos(phi), Btk = 1 - mt * mk * Math.cos(Math.min(Math.PI, phi + delta));
    const row = (y, name, tex, dNew, dOld, m, t0) => {
      alpha(ctx, mg * seg(s, t0, t0 + .8));
      const ok = m >= -1e-9;
      rrect(ctx, X, y, Wp, 150, 12, '#ffffff', ok ? '#c7e6d4' : '#f1c9bf', 1.5);
      rich(ctx, [{ b: name }], X + 20, y + 30, { size: 17 });
      math(ctx, tex, X + Wp - 20, y + 31, { size: 19, align: 'right', color: C.muted });
      // signed margin bar
      const zx = X + 300, half = 210, sc = half / .15, w = clamp(m * sc, -half, half);
      line(ctx, zx - half, y + 82, zx + half, y + 82, '#d6dbe1', 1);
      line(ctx, zx, y + 66, zx, y + 98, '#8b949e', 1.4);
      rrect(ctx, Math.min(zx, zx + w), y + 72, Math.abs(w), 20, 4, ok ? C.good : C.bad);
      text(ctx, 'margin', X + 20, y + 88, { size: 14, color: C.muted });
      text(ctx, (m >= 0 ? '+' : '−') + Math.abs(m).toFixed(3), X + Wp - 52, y + 88, { size: 15, weight: 700, color: ok ? C.good : C.bad, align: 'right' });
      rich(ctx, ['new → old ', { t: dNew.toFixed(3), c: C.neu }, '     old → old ', { t: dOld.toFixed(3), c: C.old }, '     expected cosine distances'], X + 20, y + 132, { size: 14, color: C.muted });
      badge(ctx, X + Wp - 30, y + 82, ok, 11);
    };
    row(392, 'Same class (1a)', '\\b{E} d(\\b{h}^t_i, \\b{h}^k_j) ≤ \\b{E} d(\\b{h}^k_i, \\b{h}^k_j)', Atk, Akk, Akk - Atk, 7.4);
    row(560, 'Different classes (1b)', '\\b{E} d(\\b{h}^t_i, \\b{h}^k_j) ≥ \\b{E} d(\\b{h}^k_i, \\b{h}^k_j)', Btk, Bkk, Btk - Bkk, 9.4);
  }
  if (cor > 0) {
    alpha(ctx, cor);
    rrect(ctx, X, 392, Wp, 132, 12, '#ffffff', '#d9dee4');
    text(ctx, 'COROLLARY 3.7', X + 20, 422, { size: 13, weight: 700, color: C.neu, spacing: 1.5 });
    rich(ctx, ['Regular simplex centered at the origin:  ', { m: '\\b{μ}^⊤_i \\b{μ}_j = −\\f{1}{C − 1} < 0' }], X + 20, 466, { size: 17, msize: 23 });
    rich(ctx, ['aligned across updates ', { m: '⇒' }, ' (a) and (b) hold.   ', { m: '\\b{P}_{k,k} ⇒' }, ' (b),   ', { m: '\\b{P}_{t,k} ⇒' }, ' (a)'], X + 20, 504, { size: 17, msize: 21 });
    alpha(ctx, cor * seg(s, 35, 35.8));
    const ty = 548;
    text(ctx, 'Empirical check, Appendix I: average margins ×10⁻³, 9 independently trained pairs', X, ty + 10, { size: 14, color: C.muted });
    const cols = [X + 14, X + 300, X + 420, X + 540];
    ['representation', '(1a)', '(1b)', 'both hold'].forEach((h, k) => text(ctx, h, cols[k], ty + 42, { size: 14, weight: 600, color: C.muted }));
    [['Softmax', '−11.1', '−5.5', '0 / 9'], ['PSP without P_t,k', '−56.8', '−14.2', '0 / 9'], ['PSP without P_k,k', '+12.0', '−13.3', '0 / 9'], ['PSP', '+15.5', '+3.9', '9 / 9']].forEach((r, k) => {
      const y = ty + 74 + k * 30, last = k === 3;
      alpha(ctx, cor * seg(s, 35.4 + k * .35, 36 + k * .35));
      if (last) rrect(ctx, X, y - 20, Wp, 29, 7, C.goodSoft);
      if (r[0].includes('_')) rich(ctx, ['PSP without ', { m: r[0].endsWith('t,k') ? '\\b{P}_{t,k}' : '\\b{P}_{k,k}' }], cols[0], y, { size: 15 });
      else text(ctx, r[0], cols[0], y, { size: 15, weight: last ? 700 : 400 });
      [1, 2].forEach(j => text(ctx, r[j], cols[j], y, { size: 15, weight: 600, color: r[j][0] === '+' ? C.good : C.bad }));
      text(ctx, r[3], cols[3], y, { size: 15, weight: last ? 700 : 400 });
    });
  }
  alpha(ctx, base);
  legend(ctx, 70, 196, 250, [
    { kind: 'ring', col: C.ink, label: ['old ', { m: 'φ^k' }, ', ', { m: 'κ^k' }] },
    { kind: 'dot', col: '#5f6b7a', label: ['new ', { m: 'φ^t' }, ', ', { m: 'κ^t > κ^k' }] },
    { kind: 'dash', col: C.ink, label: ['mean vector, old'] },
    { kind: 'line', col: C.cls[0], label: ['mean vector, new'] },
  ]);
  captions(ctx, s, [
    [.8, 7.4, ['Theorem 3.6 identifies two geometric conditions under which both inequalities hold in expectation.']],
    [7.4, 13.6, ['With aligned prototypes, the longer mean vectors shrink same-class distances and enlarge different-class ones.']],
    [13.6, 23, ['If (a) fails, the rotated prototype increases the expected same-class distance, and (1a) is violated.']],
    [23, 32.8, ['If (b) fails, the higher concentration also brings different classes closer, and (1b) is violated.']],
    [32.8, 42, ['Aligned regular-simplex representations satisfy both conditions: ', { m: '\\b{P}_{k,k}' }, ' provides (b), ', { m: '\\b{P}_{t,k}' }, ' provides (a).']],
  ]);
}

/* ---------- top-k sparsification (Sec. 3.5) ---------- */
const TK = (() => {
  const r = rng(77), Cn = 24, K = 4, cls = 9, near = { 3: 3.0, 17: 2.6, 5: 2.2 };
  const z = [];
  for (let j = 0; j < Cn; j++) z.push(gauss(r) * .75 + (j === cls ? 4.6 : 0) + (near[j] || 0));
  const sig = softmax(z), h = unit(sig.map(v => v - 1 / Cn));
  const order = z.map((v, j) => j).sort((a, b) => z[b] - z[a]);
  return { Cn, K, z, sig, h, top: new Set(order.slice(0, K)), order };
})();
function bars(ctx, s, x, y, w, h, vals, o) {
  const n = vals.length, slot = w / n, bw = slot * .66;
  const signed = o.signed, zeroY = signed ? y + h * .74 : y + h;
  const maxAbs = Math.max(...vals.map(Math.abs)), sc = (signed ? h * .7 : h * .92) / maxAbs;
  line(ctx, x - 6, zeroY, x + w, zeroY, '#9aa5b1', 1);
  vals.forEach((v, j) => {
    const g = o.grow * (TK.top.has(j) ? 1 : 1 - (o.drop || 0));
    const hh = v * sc * g, bx = x + j * slot + (slot - bw) / 2;
    const keep = TK.top.has(j);
    ctx.fillStyle = keep && o.hl > 0 ? C.blue : '#b7c0ca';
    if (Math.abs(hh) > .3) ctx.fillRect(bx, hh >= 0 ? zeroY - hh : zeroY, bw, Math.abs(hh));
  });
}
function chTopK(ctx, s) {
  title(ctx, s, 'TOP-k SPARSIFICATION', 'Scaling to a large number of classes');
  const x0 = 290, w = 700;
  const rows = [
    { tex: '\\b{z}', name: 'logits', vals: TK.z, signed: true, t0: 1.4, y: 236 },
    { tex: 'σ(\\b{z})', name: 'softmax outputs', vals: TK.sig, signed: false, t0: 3.6, y: 432 },
    { tex: '\\b{h}', name: 'PSP representation', vals: TK.h, signed: true, t0: 5.8, y: 600 },
  ];
  const hl = seg(s, 9.6, 10.4), drop = mv(s, 14, 16.6);
  // guides through the k largest entries: the same indices in every row
  if (hl > 0) {
    const slot = w / TK.Cn;
    TK.top.forEach(j => { alpha(ctx, hl * .5); line(ctx, x0 + (j + .5) * slot, 230, x0 + (j + .5) * slot, 770, C.blue, 1, [3, 4]); });
  }
  rows.forEach((r, k) => {
    const a = seg(s, r.t0, r.t0 + .6);
    if (a <= 0) return;
    alpha(ctx, a);
    math(ctx, r.tex, 70, r.y + 70, { size: 30 });
    text(ctx, r.name, 70, r.y + 100, { size: 14, color: C.muted });
    bars(ctx, s, x0, r.y, w, 150, r.vals, { signed: r.signed, grow: mv(s, r.t0, r.t0 + 1.4), hl, drop: k === 2 ? drop : 0 });
  });
  alpha(ctx, seg(s, 2, 2.8));
  text(ctx, 'one entry per class  (C = 24 shown)', x0, 790, { size: 14, color: C.muted });
  if (drop > .02) { alpha(ctx, drop); rich(ctx, ['sparse ', { m: '\\b{h}' }, ':  k = 4 index–value pairs'], x0 + w - 260, 790, { size: 14, color: C.blueDeep, msize: 17 }); }
  // right column
  const X = 1080;
  defs(ctx, s, [
    { t: 2, draw: c => rich(c, [{ m: '\\b{h} ∈ ℝ^C' }, ':  dimension grows with the classes'], X, 270, { size: 17, msize: 24 }) },
    { t: 10, draw: c => { text(c, 'rank-preserving softmax', X, 330, { size: 14, weight: 600, color: C.muted }); math(c, 'z_i > z_j  ⇔  σ(\\b{z})_i > σ(\\b{z})_j', X, 366, { size: 24 }); } },
    { t: 11.8, draw: c => para(c, 'Centering subtracts the same constant from every entry and normalization rescales them: PSP and LSP keep the same ranking.', X, 410, 450, { size: 15.5, color: C.muted, lh: 22 }) },
    { t: 14, draw: c => rich(c, ['keep the ', { b: 'k largest entries' }, ', set the others to zero'], X, 492, { size: 17 }) },
    { t: 17.4, draw: c => {
      rrect(c, X - 4, 520, 464, 168, 12, '#ffffff', '#d9dee4');
      text(c, 'Gallery storage per item, Google Landmarks v2', X + 16, 548, { size: 14, weight: 600, color: C.muted });
      const bw = 220, p = mv(s, 17.8, 19);
      text(c, 'dense, C > 81k', X + 16, 586, { size: 14 }); rrect(c, X + 136, 574, bw * p, 16, 4, '#b7c0ca'); text(c, '318 KiB', X + 136 + bw * p + 8, 587, { size: 14, weight: 600 });
      text(c, 'top-256', X + 16, 622, { size: 14 }); rrect(c, X + 136, 610, Math.max(2, bw / 159 * p), 16, 2, C.blue); text(c, '2 KiB', X + 136 + Math.max(2, bw / 159 * p) + 8, 623, { size: 14, weight: 600, color: C.blueDeep });
      alpha(c, seg(s, 19, 19.8)); text(c, '≈ 159× less storage', X + 16, 664, { size: 18, serif: true, weight: 600, color: C.blueDeep });
    } },
    { t: 20.4, draw: c => para(c, 'ImageNet-1K, 5 updates (Table 3): PSP keeps AC = 1 and AA = 35.20 for every k from 256 to 1000.', X, 728, 450, { size: 15.5, color: C.muted, lh: 22 }) },
  ]);
  captions(ctx, s, [
    [.8, 9.6, ['PSP and LSP have one entry per class: their dimension grows linearly with the number of classes.']],
    [9.6, 13.8, ['The softmax is rank-preserving, and centering and normalization do not change the ranking of the entries.']],
    [13.8, 17.2, ['Top-k sparsification keeps only the k largest entries of each representation.']],
    [17.2, 25, ['Gallery storage drops by two orders of magnitude, with negligible changes in retrieval and compatibility.']],
  ]);
}

/* ---------- 9. results ---------- */
const MODELS = ['AlexNet', 'ResNet-50', 'RegNetX', 'ResNet-152', 'MaxViT-T'];
// Fig. 5 of the paper: CMC@1 (%) on ImageNet-1K, rows: query model, columns: gallery model
const MAT = {
  base: [[27.26], [0.06, 66.33], [0.08, 0.10, 73.68], [0.12, 0.04, 0.17, 75.38], [0.09, 0.11, 0.10, 0.10, 80.86]],
  psp: [[49.22], [69.22, 70.55], [73.15, 74.62, 76.51], [75.51, 76.53, 78.56, 78.31], [76.65, 77.83, 79.73, 79.42, 79.35]],
  lsp: [[32.71], [40.83, 63.67], [43.16, 63.82, 73.21], [49.39, 66.57, 72.63, 75.30], [39.05, 62.95, 73.31, 74.41, 79.24]],
};
function matrix(ctx, x, y, M, ttl, s, t0, o = {}) {
  const cw = 74, ch = 52;
  text(ctx, ttl, x + 2.5 * cw, y - 18, { size: 18, weight: 600, align: 'center' });
  MODELS.forEach((m, k) => {
    if (o.labels) text(ctx, m, x - 10, y + k * ch + ch / 2 + 5, { size: 13, color: C.muted, align: 'right' });
    ctx.save(); ctx.translate(x + k * cw + cw / 2 + 6, y + 5 * ch + 12); ctx.rotate(-.5);
    text(ctx, m, 0, 0, { size: 11.5, color: C.muted, align: 'right' }); ctx.restore();
  });
  let comp = 0;
  for (let t = 0; t < 5; t++) for (let k = 0; k < 5; k++) {
    const x0 = x + k * cw, y0 = y + t * ch;
    if (k > t) { rrect(ctx, x0 + 2, y0 + 2, cw - 4, ch - 4, 6, '#f5f2ec'); continue; }
    const a = seg(s, t0 + (t * 5 + k) * .07, t0 + (t * 5 + k) * .07 + .4);
    const v = M[t][k], diag = t === k, ok = !diag && v > M[k][k];
    if (ok && a > .5) comp++;
    const prev = ctx.globalAlpha; ctx.globalAlpha = prev * a;
    rrect(ctx, x0 + 2, y0 + 2, cw - 4, ch - 4, 6, diag ? '#e8eef6' : ok ? C.goodSoft : C.badSoft, diag ? '#cfdcea' : ok ? '#c7e6d4' : '#f1c9bf');
    text(ctx, v.toFixed(2), x0 + cw / 2, y0 + ch / 2 + 5, { size: 14, weight: diag ? 600 : 500, align: 'center', color: diag ? C.ink : ok ? '#2c7a51' : '#a5432f' });
    ctx.globalAlpha = prev;
  }
  return comp;
}
function chResults(ctx, s) {
  title(ctx, s, 'RESULTS', 'Empirical evaluation');
  const ma = 1 - seg(s, 13.2, 14);
  if (ma > 0) {
    alpha(ctx, ma * seg(s, .6, 1.2));
    rich(ctx, ['Fig. 5 · torchvision models pretrained on ImageNet-1K · CMC@1 (%) · rows: query model ', { m: 'φ^t' }, ' · columns: gallery model ', { m: 'φ^k' }], 70, 214, { size: 15, color: C.muted });
    const tabs = [['base', 'Encoder features (baseline)', 1, [0, 21.63, 0]], ['psp', 'PSP', 3.4, [1, 74.34, 76.12]], ['lsp', 'LSP', 5.8, [.7, 60.68, 37.61]]];
    tabs.forEach(([key, ttl, t0, sum], i) => {
      const x = 230 + i * 440, y = 300;
      alpha(ctx, ma * seg(s, t0 - .4, t0));
      const comp = matrix(ctx, x, y, MAT[key], ttl, s, t0, { labels: i === 0 });
      const sa = ma * seg(s, t0 + 2, t0 + 2.6);
      if (sa > 0) {
        alpha(ctx, sa);
        const good = comp === 10;
        rich(ctx, [{ t: comp + ' / 10', c: good ? C.good : comp ? C.blueDeep : C.bad }, ' compatible update pairs'], x + 185, y + 5 * 52 + 70, { size: 16, weight: 600, align: 'center' });
        text(ctx, `AC ${sum[0].toFixed(2)}  ·  AA ${sum[1].toFixed(2)}  ·  ACA ${sum[2].toFixed(2)}`, x + 185, y + 5 * 52 + 96, { size: 14, color: C.muted, align: 'center' });
      }
    });
  }
  if (s > 13.2) {
    const cards = [
      ['0.39', 'CIFAR-100, 50 updates', 'Average compatibility (AC) of PSP; LSP reaches 0.36 and the best prior method 0.11.'],
      ['1.00', 'ImageNet-1K, 5 updates', 'AC of PSP: every update pair is compatible; prior methods reach at most 0.20.'],
      ['68.35', 'ImageNet-1K, ResNet-18 → ResNet-50', 'Average accuracy (AA) of PSP in the extended-backbone benchmark, the highest among the compared methods.'],
    ];
    const nl = Math.max(...cards.map(c => paraLines(ctx, c[2], 410, { size: 16 })));
    cards.forEach((c, k) => {
      const x = 70 + k * 495, y = 300;
      alpha(ctx, seg(s, 13.6 + k * .5, 14.4 + k * .5));
      rrect(ctx, x, y, 465, 158 + nl * 23 + 8, 16, '#ffffff', C.line);
      text(ctx, c[0], x + 28, y + 84, { size: 60, serif: true, weight: 600, color: C.blueDeep });
      text(ctx, c[1], x + 28, y + 124, { size: 18, weight: 600 });
      para(ctx, c[2], x + 28, y + 158, 410, { size: 16, color: C.muted, lh: 23 });
    });
    alpha(ctx, seg(s, 16, 16.8));
    const items = ['No compatibility-specific losses', 'No learned mappings', 'No architectural changes', 'No access to previous models'];
    let x = 70; items.forEach(it => { x += pill(ctx, x, 650, [it], { ok: true, size: 16 }) + 14; });
  }
  captions(ctx, s, [
    [.8, 13.2, ['The five models share only the ImageNet-1K label space; PSP is compatible on every update pair, LSP on seven of ten.']],
    [13.6, 26, ['PSP and LSP are competitive with compatibility-trained methods, with the largest gains over many updates.']],
  ]);
}

/* ---------- 10. summary ---------- */
function chSummary(ctx, s) {
  const endA = seg(s, 16.4, 17.4), A0 = A;
  A = A0 * (1 - endA);
  if (A > 0) {
    title(ctx, s, 'SUMMARY', 'Why hyperspherical simplex representations');
    const items = [
      ['A reference fixed by the label space', 'Class prototypes are determined by the one-hot encoding rather than by a particular model, so they coincide across independently trained models.'],
      ['No dependence on previous models', 'Compatibility requires neither the parameters nor the features of earlier models, nor compatibility-specific losses, learned mappings or architectural changes.'],
      ['A formal characterization', 'Under von Mises–Fisher class distributions with increasing concentration, aligned regular-simplex representations satisfy both inequalities in expectation.'],
      ['Stability over many updates', 'Every model refers to the same geometry, so misalignment does not accumulate across updates; top-k sparsification bounds the storage cost.'],
    ];
    items.forEach((it, k) => {
      const y = 250 + k * 142, t0 = 1 + k * 2.4;
      alpha(ctx, seg(s, t0, t0 + .9));
      text(ctx, String(k + 1), 92, y + 16, { size: 44, serif: true, weight: 600, color: C.blue, align: 'center' });
      line(ctx, 130, y - 22, 130, y + 84, C.line, 1.5);
      text(ctx, it[0], 156, y, { size: 22, weight: 600 });
      para(ctx, it[1], 156, y + 34, 860, { size: 17, color: C.muted, lh: 25 });
    });
    miniSphere(ctx, 1300, 500, 150, seg(s, .8, 2));
  }
  if (endA > 0) {
    A = A0 * endA;
    miniSphere(ctx, W / 2, 330, 116, 1);
    alpha(ctx, 1);
    text(ctx, 'Hyperspherical Simplex Representations', W / 2, 545, { size: 44, serif: true, weight: 600, align: 'center' });
    text(ctx, 'for Backward-Compatible Retrieval', W / 2, 597, { size: 44, serif: true, weight: 600, align: 'center' });
    alpha(ctx, seg(s, 17.6, 18.4));
    text(ctx, 'Simone Ricci · Niccolò Biondi · Federico Pernici · Alberto Del Bimbo', W / 2, 660, { size: 18, color: C.muted, align: 'center' });
    alpha(ctx, seg(s, 18.2, 19));
    text(ctx, 'miccunifi.github.io/PSP', W / 2, 726, { size: 22, weight: 600, color: C.blueDeep, align: 'center' });
  }
  A = A0;
  alpha(ctx, 1);
}

/* ---------------------------------- timeline ---------------------------------- */
// dur: length of each chapter in design seconds; every chapter plays SPEED times faster than designed
const SPEED = 1.25;
const SCENES = [
  { id: 'title', dur: 6, draw: chTitle },
  { id: 'problem', label: 'Problem', dur: 27, draw: chRetrieval },
  { id: 'compat', label: 'Compatibility', dur: 26, draw: chCompat },
  { id: 'training', label: 'Training', dur: 31, draw: chTraining },
  { id: 'psp', label: 'PSP', dur: 33, draw: chPSP },
  { id: 'lsp', label: 'LSP', dur: 17, draw: chLSP },
  { id: 'reference', label: 'Reference', dur: 19, draw: chReference },
  { id: 'expansion', label: 'Expansion', dur: 30, draw: chExpansion },
  { id: 'vmf', label: 'vMF', dur: 28, draw: chVMF },
  { id: 'theorem', label: 'Theorem', dur: 40, draw: chTheorem },
  { id: 'topk', label: 'Top-k', dur: 25, draw: chTopK },
  { id: 'results', label: 'Results', dur: 25, draw: chResults },
  { id: 'summary', label: 'Summary', dur: 23, draw: chSummary },
];
let acc = 0;
SCENES.forEach(sc => { sc.real = sc.dur / SPEED; sc.start = acc; acc += sc.real; });
const TOTAL = acc;
const CHAPTERS = SCENES.filter(sc => sc.label).map(sc => ({ label: sc.label, start: sc.start, end: sc.start + sc.real }));
const XF = .8;           // dissolve of the outgoing chapter (s); the incoming one builds up meanwhile

const TABS = [];
function header(ctx, t) {
  text(ctx, 'Hyperspherical Simplex Representations', 70, 50, { size: 18, serif: true, weight: 600 });
  rrect(ctx, 418, 33, 54, 22, 11, C.blueSoft, '#cfe1f3');
  text(ctx, 'arXiv', 445, 49, { size: 11, weight: 700, color: C.blueDeep, align: 'center', spacing: 1.2 });
  let x = 1540; TABS.length = 0;
  for (let k = CHAPTERS.length - 1; k >= 0; k--) {
    const ch = CHAPTERS[k], w = ch.label.length > 9 ? 98 : 78;
    x -= w;
    const on = t >= ch.start && t < ch.end;
    text(ctx, ch.label.toUpperCase(), x + w / 2, 48, { size: 10.5, weight: 700, align: 'center', color: on ? C.blueDeep : C.faint, spacing: 1 });
    rrect(ctx, x + 8, 60, w - 16, 3, 1.5, '#ebe6dc');
    if (on) rrect(ctx, x + 8, 60, (w - 16) * clamp((t - ch.start) / (ch.end - ch.start)), 3, 1.5, C.blue);
    else if (t >= ch.end) rrect(ctx, x + 8, 60, w - 16, 3, 1.5, '#b5cde6');
    TABS.unshift({ x, y: 24, w, h: 46, start: ch.start });
  }
  line(ctx, 40, 78, W - 40, 78, C.line, 1);
}

function render(ctx, t) {
  t = clamp(t, 0, TOTAL - 1e-6);
  ctx.save();
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  let k = SCENES.findIndex(x => t >= x.start && t < x.start + x.real);
  if (k < 0) k = SCENES.length - 1;
  const sc = SCENES[k], r = t - sc.start, s = r * SPEED;
  const x = k > 0 && r < XF ? ease(r / XF) : 1;
  A = sc.id === 'title' ? 0 : k === 1 ? x : 1;
  if (A > 0) { ctx.globalAlpha = A; header(ctx, t); }
  if (x < 1) { const pv = SCENES[k - 1]; A = 1 - x; ctx.globalAlpha = A; pv.draw(ctx, pv.dur + s); }   // outgoing chapter, held at its end
  A = 1; ctx.globalAlpha = 1;
  sc.draw(ctx, s);
  const end = seg(t, TOTAL - .8, TOTAL);
  if (end > 0) { ctx.globalAlpha = end; ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H); }
  ctx.restore();
}

/* ---------------------------------- player ---------------------------------- */
function create(canvas, opt = {}) {
  const ctx = canvas.getContext('2d');
  let t = opt.start || 0, playing = false, last = null, raf = 0, scale = 1;
  function resize() {
    const r = canvas.getBoundingClientRect();
    scale = opt.scale || Math.min(2.4, Math.max(.5, (r.width || W) / W * (window.devicePixelRatio || 1)));
    canvas.width = Math.round(W * scale); canvas.height = Math.round(H * scale);
    draw();
  }
  function draw() {
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    render(ctx, t);
    if (opt.onTime) opt.onTime(t);
  }
  function loop(ts) {
    if (!playing) return;
    if (last != null) { t += Math.min(.1, (ts - last) / 1000); if (t >= TOTAL) t = opt.loop === false ? TOTAL - 1e-3 : 0; }
    last = ts; draw();
    raf = requestAnimationFrame(loop);
  }
  const api = {
    play() { if (playing) return; playing = true; last = null; raf = requestAnimationFrame(loop); if (opt.onState) opt.onState(true); },
    pause() { playing = false; cancelAnimationFrame(raf); if (opt.onState) opt.onState(false); },
    toggle() { playing ? api.pause() : api.play(); },
    seek(x) { t = clamp(x, 0, TOTAL - 1e-3); draw(); },
    get time() { return t; },
    get playing() { return playing; },
    resize, draw,
    tabAt(px, py) {
      const r = canvas.getBoundingClientRect(), x = px / r.width * W, y = py / r.height * H;
      const tab = TABS.find(b => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
      return tab ? tab.start : null;
    },
  };
  resize();
  return api;
}

const FONTS = ['900 20px "Font Awesome 6 Free"', '400 20px Inter', '600 20px Inter', '700 20px Inter', '400 20px "Source Serif 4"', '600 20px "Source Serif 4"',
  '700 20px "Source Serif 4"', 'italic 400 20px "Source Serif 4"'];
const fontsReady = () => (document.fonts ? Promise.all(FONTS.map(f => document.fonts.load(f))).catch(() => null) : Promise.resolve());

window.PSPAnim = { create, render, fontsReady, W, H, duration: TOTAL, chapters: CHAPTERS, meanResultant };
})();
