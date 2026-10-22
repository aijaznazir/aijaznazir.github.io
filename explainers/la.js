/* Shared engine for the linear-algebra series.
   - 2x2 algebra: a matrix m = [a, b, c, d] means [[a, b], [c, d]];
     its columns (a, c) and (b, d) are where î and ĵ land.
   - Plane: a coordinate-plane canvas with draggable handles.
   - MatrixInput: a small editable 2x2 matrix.
   - tween: promise-based animation helper. */
(function (global) {
  "use strict";
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

  /* ---------- 2x2 algebra ---------- */
  const I = [1, 0, 0, 1];
  const apply = (m, v) => [m[0] * v[0] + m[1] * v[1], m[2] * v[0] + m[3] * v[1]];
  // mul(B, A) is the matrix of "apply A first, then B"
  const mul = (B, A) => [
    B[0] * A[0] + B[1] * A[2], B[0] * A[1] + B[1] * A[3],
    B[2] * A[0] + B[3] * A[2], B[2] * A[1] + B[3] * A[3],
  ];
  const det = (m) => m[0] * m[3] - m[1] * m[2];
  const inv = (m) => {
    const D = det(m);
    if (Math.abs(D) < 1e-10) return null;
    return [m[3] / D, -m[1] / D, -m[2] / D, m[0] / D];
  };
  const lerp = (A, B, t) => A.map((a, i) => a + (B[i] - a) * t);
  const col1 = (m) => [m[0], m[2]];
  const col2 = (m) => [m[1], m[3]];
  const fromCols = (u, w) => [u[0], w[0], u[1], w[1]];
  const norm = (v) => Math.hypot(v[0], v[1]);
  const cross = (u, w) => u[0] * w[1] - u[1] * w[0];
  const dot = (u, w) => u[0] * w[0] + u[1] * w[1];
  const scale = (v, s) => [v[0] * s, v[1] * s];
  const add = (u, w) => [u[0] + w[0], u[1] + w[1]];
  const sub = (u, w) => [u[0] - w[0], u[1] - w[1]];
  const unit = (v) => { const n = norm(v); return n < 1e-12 ? [0, 0] : [v[0] / n, v[1] / n]; };
  const perp = (v) => [-v[1], v[0]];
  const close = (m, n, tol) => m.every((x, i) => Math.abs(x - n[i]) < (tol || 1e-9));

  /* Real eigen-structure of a 2x2 matrix.
     Returns {complex, re, im} | {all, values} | {values, vectors, repeated}. */
  function eig(m) {
    const [a, b, c, d] = m;
    const tr = a + d, D = det(m);
    const sc = Math.max(1, Math.abs(a), Math.abs(b), Math.abs(c), Math.abs(d));
    const disc = (tr * tr) / 4 - D;
    if (disc < -1e-9 * sc * sc) return { complex: true, re: tr / 2, im: Math.sqrt(-disc), tr, det: D };
    if (Math.abs(b) < 1e-12 && Math.abs(c) < 1e-12 && Math.abs(a - d) < 1e-12)
      return { complex: false, all: true, values: [a, a], vectors: [], tr, det: D };
    const s = Math.sqrt(Math.max(0, disc));
    const values = [tr / 2 + s, tr / 2 - s];
    const vecFor = (l) => {
      // v must be perpendicular to both rows of (A - λI); use the larger row
      const r1 = [a - l, b], r2 = [c, d - l];
      return unit(perp(norm(r1) >= norm(r2) ? r1 : r2));
    };
    const repeated = s < 1e-7 * sc;
    const vectors = repeated ? [vecFor(values[0])] : [vecFor(values[0]), vecFor(values[1])];
    return { complex: false, all: false, repeated, values, vectors, tr, det: D };
  }

  /* Smallest singular value (how much m can shrink a vector). */
  function sigmaMin(m) {
    const p = m[0] * m[0] + m[2] * m[2], q = m[1] * m[1] + m[3] * m[3], r = m[0] * m[1] + m[2] * m[3];
    const s2 = (p + q) / 2 - Math.sqrt(((p - q) / 2) ** 2 + r * r);
    return Math.sqrt(Math.max(0, s2));
  }

  /* ---------- formatting ---------- */
  function fmt(x, p) {
    p = p == null ? 2 : p;
    if (!isFinite(x)) return "–";
    let v = +x.toFixed(p);
    if (Math.abs(v) < Math.pow(10, -p) / 2) v = 0;
    return String(v).replace("-", "−");
  }
  const vfmt = (v, p) => "(" + fmt(v[0], p) + ", " + fmt(v[1], p) + ")";
  // snap to whole numbers when close, otherwise to tenths
  function snap(x) {
    const r = Math.round(x);
    return Math.abs(x - r) < 0.12 ? r : Math.round(x * 10) / 10;
  }

  /* ---------- tween ---------- */
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const reduced = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let tweenToken = 0;
  /* Animate fn(t) for t: 0 -> 1. Resolves true when finished, false if cancelled by a newer tween
     sharing the same group. */
  function tween(ms, fn, group) {
    group = group || "default";
    const token = (tween._tok[group] = (tween._tok[group] || 0) + 1);
    if (reduced()) ms = Math.min(ms, 1);
    return new Promise((resolve) => {
      let start = null;
      function f(ts) {
        if (tween._tok[group] !== token) return resolve(false);
        if (start == null) start = ts;
        const t = Math.min(1, (ts - start) / ms);
        fn(ease(t));
        if (t < 1) requestAnimationFrame(f);
        else resolve(true);
      }
      requestAnimationFrame(f);
    });
  }
  tween._tok = {};
  tween.cancel = (group) => { tween._tok[group || "default"] = (tween._tok[group || "default"] || 0) + 1; };
  /* Pause inside an animation sequence; resolves false if the group was cancelled meanwhile. */
  const wait = (ms, group) => {
    group = group || "default";
    const token = tween._tok[group] || 0;
    if (reduced()) ms = 0;
    return new Promise((r) => setTimeout(() => r((tween._tok[group] || 0) === token), ms));
  };

  /* ---------- Plane ---------- */
  class Plane {
    constructor(canvas, o) {
      this.c = canvas;
      this.ctx = canvas.getContext("2d");
      this.o = Object.assign({ range: 4.5, aspect: 0.72, minH: 240, maxH: 560, maxVH: 0.62, draw: null, onDrag: null }, o || {});
      this.handles = [];
      this.dragging = null;
      this.w = 0;
      this.h = 0;
      canvas.style.touchAction = "none";
      this.resize();
      const again = () => { if (this.resize()) this.render(); };
      if ("ResizeObserver" in window) new ResizeObserver(again).observe(canvas.parentElement);
      window.addEventListener("resize", again);
      canvas.addEventListener("pointerdown", (e) => this._down(e));
      canvas.addEventListener("pointermove", (e) => this._move(e));
      canvas.addEventListener("pointerup", () => this._up());
      canvas.addEventListener("pointercancel", () => this._up());
    }

    resize() {
      const w = this.c.parentElement.clientWidth;
      const h = Math.round(Math.min(this.o.maxH, window.innerHeight * this.o.maxVH, Math.max(this.o.minH, w * this.o.aspect)));
      if (!w || (w === this.w && h === this.h)) return false;
      const dpr = window.devicePixelRatio || 1;
      this.w = w;
      this.h = h;
      this.c.width = Math.round(w * dpr);
      this.c.height = Math.round(h * dpr);
      this.c.style.height = h + "px";
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.s = Math.min(w, h) / (2 * this.o.range);
      return true;
    }

    setRange(r) { this.o.range = r; this.s = Math.min(this.w, this.h) / (2 * r); }
    X(x) { return this.w / 2 + x * this.s; }
    Y(y) { return this.h / 2 - y * this.s; }
    get halfW() { return this.w / 2 / this.s; }
    get halfH() { return this.h / 2 / this.s; }
    toWorld(px, py) { return [(px - this.w / 2) / this.s, (this.h / 2 - py) / this.s]; }
    col(c) { return c && c.startsWith("--") ? css(c) : c; }

    /* ----- interaction ----- */
    addHandle(h) { this.handles.push(Object.assign({ color: "--fg" }, h)); return h; }
    _pos(e) { const r = this.c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
    _hit(px, py, type) {
      let best = null, bd = type === "touch" ? 30 : 18;
      for (const h of this.handles) {
        if (h.enabled && !h.enabled()) continue;
        const p = h.get();
        const d = Math.hypot(this.X(p[0]) - px, this.Y(p[1]) - py);
        if (d < bd) { bd = d; best = h; }
      }
      return best;
    }
    _down(e) {
      const [px, py] = this._pos(e);
      const h = this._hit(px, py, e.pointerType);
      if (!h) return;
      this.dragging = h;
      try { this.c.setPointerCapture(e.pointerId); } catch (_) {}
      this.c.style.cursor = "grabbing";
      e.preventDefault();
    }
    _move(e) {
      const [px, py] = this._pos(e);
      if (!this.dragging) {
        this.c.style.cursor = this._hit(px, py, e.pointerType) ? "grab" : "default";
        return;
      }
      let [x, y] = this.toWorld(px, py);
      x = Math.max(-this.halfW, Math.min(this.halfW, x));
      y = Math.max(-this.halfH, Math.min(this.halfH, y));
      const h = this.dragging;
      if (typeof h.snap === "function") [x, y] = h.snap(x, y);
      else if (h.snap !== false) { x = snap(x); y = snap(y); }
      h.set(x, y);
      if (this.o.onDrag) this.o.onDrag(h);
      this.render();
    }
    _up() {
      if (!this.dragging) return;
      this.dragging = null;
      this.c.style.cursor = "default";
    }
    /* Programmatic drag, used by tests: moves a handle as if dragged to world point (x, y). */
    dragTo(i, x, y) {
      const h = this.handles[i];
      h.set(x, y);
      if (this.o.onDrag) this.o.onDrag(h);
      this.render();
    }

    /* ----- drawing ----- */
    render() {
      this.ctx.clearRect(0, 0, this.w, this.h);
      if (this.o.draw) this.o.draw(this);
      for (const h of this.handles) {
        if (h.enabled && !h.enabled()) continue;
        this.ring(h.get(), h.color);
      }
    }

    baseGrid() {
      const ctx = this.ctx, hw = this.halfW, hh = this.halfH;
      ctx.save();
      ctx.lineWidth = 1;
      ctx.strokeStyle = this.col("--la-bg-grid");
      ctx.beginPath();
      for (let k = Math.ceil(-hw); k <= hw; k++) { const x = Math.round(this.X(k)) + 0.5; ctx.moveTo(x, 0); ctx.lineTo(x, this.h); }
      for (let k = Math.ceil(-hh); k <= hh; k++) { const y = Math.round(this.Y(k)) + 0.5; ctx.moveTo(0, y); ctx.lineTo(this.w, y); }
      ctx.stroke();
      ctx.strokeStyle = this.col("--la-axis");
      ctx.beginPath();
      const x0 = Math.round(this.X(0)) + 0.5, y0 = Math.round(this.Y(0)) + 0.5;
      ctx.moveTo(x0, 0); ctx.lineTo(x0, this.h);
      ctx.moveTo(0, y0); ctx.lineTo(this.w, y0);
      ctx.stroke();
      ctx.restore();
    }

    /* The integer grid moved by matrix m, optionally followed by a shift (an affine map x -> m x + shift). */
    grid(m, o) {
      o = Object.assign({ color: "--la-grid", alpha: 0.5, width: 1, axes: true, axisColor: "--fg", axisAlpha: 0.85, shift: [0, 0] }, o || {});
      const ctx = this.ctx, sh = o.shift;
      const reach = Math.hypot(this.halfW, this.halfH) + norm(sh);
      const K = Math.min(70, Math.ceil(reach / Math.max(sigmaMin(m), reach / 70)) + 1);
      const seg = (p, q) => {
        const a = add(apply(m, p), sh), b = add(apply(m, q), sh);
        ctx.moveTo(this.X(a[0]), this.Y(a[1]));
        ctx.lineTo(this.X(b[0]), this.Y(b[1]));
      };
      ctx.save();
      ctx.strokeStyle = this.col(o.color);
      ctx.lineWidth = o.width;
      ctx.globalAlpha = o.alpha;
      if (o.dash) ctx.setLineDash(o.dash);
      ctx.beginPath();
      for (let k = -K; k <= K; k++) {
        if (k === 0 && o.axes) continue;
        seg([k, -K], [k, K]);
        seg([-K, k], [K, k]);
      }
      ctx.stroke();
      if (o.axes) {
        ctx.globalAlpha = o.axisAlpha;
        ctx.lineWidth = o.width + 1;
        ctx.strokeStyle = this.col(o.axisColor);
        ctx.beginPath();
        seg([0, -K], [0, K]);
        seg([-K, 0], [K, 0]);
        ctx.stroke();
      }
      ctx.restore();
    }

    arrow(v, o) {
      o = Object.assign({ from: [0, 0], color: "--fg", width: 3, head: 12, alpha: 1, dash: null, label: null }, o || {});
      const ctx = this.ctx, c = this.col(o.color);
      const x0 = this.X(o.from[0]), y0 = this.Y(o.from[1]);
      const x1 = this.X(o.from[0] + v[0]), y1 = this.Y(o.from[1] + v[1]);
      const L = Math.hypot(x1 - x0, y1 - y0);
      ctx.save();
      ctx.globalAlpha = o.alpha;
      ctx.strokeStyle = c;
      ctx.fillStyle = c;
      ctx.lineWidth = o.width;
      ctx.lineCap = "round";
      if (L < 1.5) {
        ctx.beginPath(); ctx.arc(x0, y0, o.width + 1.5, 0, 2 * Math.PI); ctx.fill();
        ctx.restore();
        return;
      }
      const ux = (x1 - x0) / L, uy = (y1 - y0) / L;
      const hd = Math.min(o.head, L * 0.6), hw = hd * 0.55;
      const bx = x1 - ux * hd, by = y1 - uy * hd;
      if (o.dash) ctx.setLineDash(o.dash);
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(bx, by); ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(bx - uy * hw, by + ux * hw);
      ctx.lineTo(bx + uy * hw, by - ux * hw);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      if (o.label) this.textPx(o.label, x1 + ux * 16, y1 + uy * 16, { color: o.color, font: "600 14px 'JetBrains Mono', monospace", align: "center" });
    }

    segment(p, q, o) {
      o = Object.assign({ color: "--fg", width: 2, alpha: 1, dash: null }, o || {});
      const ctx = this.ctx;
      ctx.save();
      ctx.globalAlpha = o.alpha;
      ctx.strokeStyle = this.col(o.color);
      ctx.lineWidth = o.width;
      ctx.lineCap = "round";
      if (o.dash) ctx.setLineDash(o.dash);
      ctx.beginPath();
      ctx.moveTo(this.X(p[0]), this.Y(p[1]));
      ctx.lineTo(this.X(q[0]), this.Y(q[1]));
      ctx.stroke();
      ctx.restore();
    }

    /* Full line through point p (default origin) with direction d. */
    line(d, o) {
      o = o || {};
      const n = norm(d);
      if (n < 1e-12) return;
      const p = o.through || [0, 0];
      const L = (2 * Math.hypot(this.halfW, this.halfH) + norm(p)) / n;
      this.segment([p[0] - d[0] * L, p[1] - d[1] * L], [p[0] + d[0] * L, p[1] + d[1] * L], o);
    }

    poly(pts, o) {
      o = Object.assign({ fill: null, alpha: 0.25, stroke: null, width: 1.5 }, o || {});
      const ctx = this.ctx;
      ctx.save();
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(this.X(p[0]), this.Y(p[1])) : ctx.moveTo(this.X(p[0]), this.Y(p[1]))));
      ctx.closePath();
      if (o.fill) { ctx.globalAlpha = o.alpha; ctx.fillStyle = this.col(o.fill); ctx.fill(); }
      if (o.stroke) { ctx.globalAlpha = 1; ctx.strokeStyle = this.col(o.stroke); ctx.lineWidth = o.width; ctx.stroke(); }
      ctx.restore();
    }

    dot(p, o) {
      o = Object.assign({ r: 3, color: "--fg", alpha: 1 }, o || {});
      const ctx = this.ctx;
      ctx.save();
      ctx.globalAlpha = o.alpha;
      ctx.fillStyle = this.col(o.color);
      ctx.beginPath();
      ctx.arc(this.X(p[0]), this.Y(p[1]), o.r, 0, 2 * Math.PI);
      ctx.fill();
      ctx.restore();
    }

    ring(p, color) {
      const ctx = this.ctx, x = this.X(p[0]), y = this.Y(p[1]);
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, 2 * Math.PI);
      ctx.fillStyle = this.col("--bg");
      ctx.globalAlpha = 0.55;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 2;
      ctx.strokeStyle = this.col(color);
      ctx.stroke();
      ctx.restore();
    }

    /* Arc of radius r around the origin from direction u to direction w, the short way, with an arrowhead. */
    turn(u, w, r, o) {
      o = Object.assign({ color: "--fg", width: 2 }, o || {});
      const a0 = Math.atan2(u[1], u[0]);
      let da = Math.atan2(w[1], w[0]) - a0;
      while (da > Math.PI) da -= 2 * Math.PI;
      while (da < -Math.PI) da += 2 * Math.PI;
      if (Math.abs(da) < 0.05) return;
      const ctx = this.ctx, R = r * this.s, cx = this.X(0), cy = this.Y(0);
      ctx.save();
      ctx.strokeStyle = ctx.fillStyle = this.col(o.color);
      ctx.lineWidth = o.width;
      ctx.beginPath();
      // canvas y is flipped, so angles are negated
      ctx.arc(cx, cy, R, -a0, -(a0 + da * 0.88), da > 0);
      ctx.stroke();
      const ae = a0 + da, ex = cx + R * Math.cos(-ae), ey = cy + R * Math.sin(-ae);
      const tx = Math.sin(ae) * Math.sign(da), ty = Math.cos(ae) * Math.sign(da); // screen tangent
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex + tx * 9 - ty * 4.5, ey + ty * 9 + tx * 4.5);
      ctx.lineTo(ex + tx * 9 + ty * 4.5, ey + ty * 9 - tx * 4.5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    textPx(str, x, y, o) {
      o = Object.assign({ color: "--fg", font: "12px 'JetBrains Mono', monospace", align: "left", baseline: "middle", halo: true }, o || {});
      const ctx = this.ctx;
      ctx.save();
      ctx.font = o.font;
      ctx.textAlign = o.align;
      ctx.textBaseline = o.baseline;
      if (o.halo) {
        ctx.lineWidth = 4;
        ctx.strokeStyle = this.col("--bg");
        ctx.globalAlpha = 0.85;
        ctx.strokeText(str, x, y);
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = this.col(o.color);
      ctx.fillText(str, x, y);
      ctx.restore();
    }
    text(str, p, o) {
      o = o || {};
      this.textPx(str, this.X(p[0]) + (o.dx || 0), this.Y(p[1]) + (o.dy || 0), o);
    }
    /* Text in the top-left corner of the canvas. */
    hud(str, o) {
      this.textPx(str, 12, 16, Object.assign({ color: "--muted", font: "11px 'JetBrains Mono', monospace" }, o || {}));
    }
    /* Point on the visible boundary along direction d, pulled in by pad pixels (for labels). */
    edge(d, pad) {
      const u = unit(d);
      const tx = Math.abs(u[0]) > 1e-9 ? (this.halfW - (pad || 24) / this.s) / Math.abs(u[0]) : Infinity;
      const ty = Math.abs(u[1]) > 1e-9 ? (this.halfH - (pad || 24) / this.s) / Math.abs(u[1]) : Infinity;
      return scale(u, Math.min(tx, ty));
    }
  }

  /* ---------- Matrix input ---------- */
  const inFmt = (x) => String(+(+x).toFixed(2));
  function MatrixInput(el, o) {
    o = Object.assign({ value: I, onChange: null }, o || {});
    el.classList.add("mat");
    const names = ["row 1, column 1", "row 1, column 2", "row 2, column 1", "row 2, column 2"];
    el.innerHTML = '<div class="mat-grid">' +
      [0, 1, 2, 3].map((i) => '<input type="number" step="0.1" inputmode="decimal" aria-label="' + names[i] + '" class="' + (i % 2 ? "c2" : "c1") + '">').join("") +
      "</div>";
    const ins = Array.from(el.querySelectorAll("input"));
    const api = {
      get() { return ins.map((x) => { const v = parseFloat(x.value); return isFinite(v) ? v : 0; }); },
      set(m) { ins.forEach((x, i) => { if (document.activeElement !== x) x.value = inFmt(m[i]); }); },
    };
    ins.forEach((x) => x.addEventListener("input", () => o.onChange && o.onChange(api.get())));
    ins.forEach((x) => x.addEventListener("change", () => api.set(api.get())));
    api.set(o.value);
    return api;
  }
  /* Read-only bracketed matrix as HTML. */
  function matHTML(m, colored) {
    const c = colored === false ? ["", ""] : [' class="c1"', ' class="c2"'];
    return '<span class="mat-static"><span class="mg">' +
      "<b" + c[0] + ">" + fmt(m[0]) + "</b><b" + c[1] + ">" + fmt(m[1]) + "</b>" +
      "<b" + c[0] + ">" + fmt(m[2]) + "</b><b" + c[1] + ">" + fmt(m[3]) + "</b></span></span>";
  }
  function vecHTML(v, cls) {
    return '<span class="mat-static vec"><span class="mg"><b' + (cls ? ' class="' + cls + '"' : "") + ">" + fmt(v[0]) +
      "</b><b" + (cls ? ' class="' + cls + '"' : "") + ">" + fmt(v[1]) + "</b></span></span>";
  }

  /* ---------- exact rational arithmetic and row reduction (for small integer/decimal matrices) ---------- */
  const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a || 1; };
  class Q {
    constructor(n, d) {
      if (d === undefined) d = 1;
      if (d < 0) { n = -n; d = -d; }
      const g = gcd(n, d);
      this.n = n / g;
      this.d = d / g;
      if (this.n === 0) this.d = 1;
    }
    static of(x) {
      if (x instanceof Q) return x;
      if (typeof x === "string") return Q.parse(x);
      if (Number.isInteger(x)) return new Q(x, 1);
      let d = 1;
      while (!Number.isInteger(+(x * d).toFixed(9)) && d < 1e6) d *= 10;
      return new Q(Math.round(x * d), d);
    }
    /* "3", "-0.5", "1/3", "−2/4"; returns null if unreadable */
    static parse(s) {
      s = String(s).trim().replace(/−/g, "-");
      if (s === "" || s === "-") return new Q(0);
      const m = s.match(/^(-?\d*\.?\d+)\s*\/\s*(-?\d*\.?\d+)$/);
      if (m) {
        const a = Q.of(+m[1]), b = Q.of(+m[2]);
        return b.n === 0 ? null : a.div(b);
      }
      const v = Number(s);
      return isFinite(v) ? Q.of(v) : null;
    }
    add(o) { return new Q(this.n * o.d + o.n * this.d, this.d * o.d); }
    sub(o) { return new Q(this.n * o.d - o.n * this.d, this.d * o.d); }
    mul(o) { return new Q(this.n * o.n, this.d * o.d); }
    div(o) { return new Q(this.n * o.d, this.d * o.n); }
    neg() { return new Q(-this.n, this.d); }
    isZero() { return this.n === 0; }
    valueOf() { return this.n / this.d; }
    toString() { return (this.n < 0 ? "−" : "") + Math.abs(this.n) + (this.d === 1 ? "" : "/" + this.d); }
  }
  /* Reduced row echelon form of a matrix of Q (array of rows). */
  function rref(M) {
    const R = M.map((r) => r.slice());
    const m = R.length, n = m ? R[0].length : 0, pivots = [];
    let row = 0;
    for (let c = 0; c < n && row < m; c++) {
      let p = -1;
      for (let i = row; i < m; i++) if (!R[i][c].isZero()) { p = i; break; }
      if (p < 0) continue;
      [R[row], R[p]] = [R[p], R[row]];
      const lead = R[row][c];
      R[row] = R[row].map((x) => x.div(lead));
      for (let i = 0; i < m; i++) {
        if (i === row || R[i][c].isZero()) continue;
        const f = R[i][c];
        R[i] = R[i].map((x, j) => x.sub(f.mul(R[row][j])));
      }
      pivots.push(c);
      row++;
    }
    return { R, pivots };
  }
  /* Basis of the null space, one vector per free variable (same basis as MATLAB's null(A,'r')). */
  function nullBasis(M) {
    const { R, pivots } = rref(M);
    const n = M[0].length;
    const free = [];
    for (let j = 0; j < n; j++) if (!pivots.includes(j)) free.push(j);
    return free.map((f) => {
      const v = [];
      for (let j = 0; j < n; j++) v.push(new Q(j === f ? 1 : 0));
      pivots.forEach((pc, i) => { v[pc] = R[i][f].neg(); });
      return v;
    });
  }
  const transpose = (M) => M[0].map((_, j) => M.map((r) => r[j]));

  /* ---------- small n-vector helpers (plain numbers) ---------- */
  const vdot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
  const vnorm = (a) => Math.sqrt(vdot(a, a));
  const vadd = (a, b) => a.map((x, i) => x + b[i]);
  const vsub = (a, b) => a.map((x, i) => x - b[i]);
  const vscale = (a, s) => a.map((x) => x * s);
  /* Orthonormal basis (Gram–Schmidt) for the span of the given vectors. */
  function orthonormal(vs) {
    const out = [];
    for (const v of vs) {
      let w = v.slice();
      for (const q of out) w = vsub(w, vscale(q, vdot(w, q)));
      const n = vnorm(w);
      if (n > 1e-9) out.push(vscale(w, 1 / n));
    }
    return out;
  }
  /* Orthogonal projection of x onto the span of an orthonormal set. */
  const projectOn = (x, qs) => qs.reduce((acc, q) => vadd(acc, vscale(q, vdot(x, q))), x.map(() => 0));

  /* ---------- View3: a rotatable 3D view (drag to turn) ---------- */
  class View3 {
    constructor(canvas, o) {
      this.c = canvas;
      this.ctx = canvas.getContext("2d");
      this.o = Object.assign({ range: 3, aspect: 0.95, minH: 240, maxH: 440, maxVH: 0.5, draw: null }, o || {});
      this.yaw = -0.62;
      this.pitch = 0.42;
      this.w = 0;
      this.h = 0;
      this.drag = null;
      canvas.style.touchAction = "none";
      canvas.style.cursor = "grab";
      this.resize();
      const again = () => { if (this.resize()) this.render(); };
      if ("ResizeObserver" in window) new ResizeObserver(again).observe(canvas.parentElement);
      window.addEventListener("resize", again);
      canvas.addEventListener("pointerdown", (e) => {
        this.drag = [e.clientX, e.clientY];
        try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
        canvas.style.cursor = "grabbing";
        e.preventDefault();
      });
      canvas.addEventListener("pointermove", (e) => {
        if (!this.drag) return;
        const dx = e.clientX - this.drag[0], dy = e.clientY - this.drag[1];
        this.drag = [e.clientX, e.clientY];
        this.yaw -= dx * 0.01;
        this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch + dy * 0.01));
        this.render();
      });
      const up = () => { this.drag = null; canvas.style.cursor = "grab"; };
      canvas.addEventListener("pointerup", up);
      canvas.addEventListener("pointercancel", up);
    }
    resize() {
      const w = this.c.parentElement.clientWidth;
      const h = Math.round(Math.min(this.o.maxH, window.innerHeight * this.o.maxVH, Math.max(this.o.minH, w * this.o.aspect)));
      if (!w || (w === this.w && h === this.h)) return false;
      const dpr = window.devicePixelRatio || 1;
      this.w = w; this.h = h;
      this.c.width = Math.round(w * dpr);
      this.c.height = Math.round(h * dpr);
      this.c.style.height = h + "px";
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.setRange(this.o.range);
      return true;
    }
    setRange(r) { this.o.range = r; this.s = Math.min(this.w, this.h) / (2.3 * r); }
    /* world point -> [screen x, screen y, depth] (z is up, camera tilted down by pitch) */
    P(p) {
      const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw), cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
      const x1 = cy * p[0] - sy * p[1], y1 = sy * p[0] + cy * p[1], z1 = p[2];
      return [this.w / 2 + x1 * this.s, this.h / 2 - (z1 * cp + y1 * sp) * this.s, y1 * cp - z1 * sp];
    }
    col(c) { return c && c.startsWith("--") ? css(c) : c; }
    render() {
      this.ctx.clearRect(0, 0, this.w, this.h);
      if (this.o.draw) this.o.draw(this);
    }
    seg(a, b, o) {
      o = Object.assign({ color: "--fg", width: 1.5, alpha: 1, dash: null }, o || {});
      const A = this.P(a), B = this.P(b), ctx = this.ctx;
      ctx.save();
      ctx.globalAlpha = o.alpha;
      ctx.strokeStyle = this.col(o.color);
      ctx.lineWidth = o.width;
      ctx.lineCap = "round";
      if (o.dash) ctx.setLineDash(o.dash);
      ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke();
      ctx.restore();
    }
    axes() {
      const R = this.o.range, ctx = this.ctx;
      const g = Math.floor(R);
      for (let k = -g; k <= g; k++) {
        this.seg([k, -g, 0], [k, g, 0], { color: "--la-axis", width: 1, alpha: 0.45 });
        this.seg([-g, k, 0], [g, k, 0], { color: "--la-axis", width: 1, alpha: 0.45 });
      }
      [[1, 0, 0, "x"], [0, 1, 0, "y"], [0, 0, 1, "z"]].forEach(([a, b, c, name]) => {
        this.seg([-a * R, -b * R, -c * R], [a * R, b * R, c * R], { color: "--muted", width: 1.2, alpha: 0.8 });
        const t = this.P([a * R * 1.06, b * R * 1.06, c * R * 1.06]);
        ctx.save();
        ctx.fillStyle = this.col("--muted");
        ctx.font = "italic 13px 'Source Serif 4', Georgia, serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(name, t[0], t[1]);
        ctx.restore();
      });
    }
    line(d, o) {
      const u = unitN(d), L = this.o.range * 1.35;
      this.seg(vscale(u, -L), vscale(u, L), Object.assign({ width: 3 }, o || {}));
    }
    /* plane through the origin spanned by u, w (any two independent vectors) */
    plane(u, w, o) {
      o = Object.assign({ color: "--fg", alpha: 0.16 }, o || {});
      const [a, b] = orthonormal([u, w]);
      if (!b) return;
      const L = this.o.range * 0.92, ctx = this.ctx;
      const pt = (s, t) => this.P(vadd(vscale(a, s), vscale(b, t)));
      ctx.save();
      ctx.fillStyle = this.col(o.color);
      ctx.globalAlpha = o.alpha;
      ctx.beginPath();
      [[-L, -L], [L, -L], [L, L], [-L, L]].forEach(([s, t], i) => { const p = pt(s, t); i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); });
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      for (let k = -2; k <= 2; k++) {
        const s = (k * L) / 2;
        this.seg(vadd(vscale(a, s), vscale(b, -L)), vadd(vscale(a, s), vscale(b, L)), { color: o.color, width: 1, alpha: 0.45 });
        this.seg(vadd(vscale(a, -L), vscale(b, s)), vadd(vscale(a, L), vscale(b, s)), { color: o.color, width: 1, alpha: 0.45 });
      }
    }
    arrow(v, o) {
      o = Object.assign({ from: [0, 0, 0], color: "--fg", width: 3, head: 11, alpha: 1, dash: null, label: null }, o || {});
      const A = this.P(o.from), B = this.P(vadd(o.from, v)), ctx = this.ctx, c = this.col(o.color);
      const L = Math.hypot(B[0] - A[0], B[1] - A[1]);
      ctx.save();
      ctx.globalAlpha = o.alpha;
      ctx.strokeStyle = ctx.fillStyle = c;
      ctx.lineWidth = o.width;
      ctx.lineCap = "round";
      if (L < 1.5) { ctx.beginPath(); ctx.arc(A[0], A[1], o.width + 1.5, 0, 2 * Math.PI); ctx.fill(); ctx.restore(); return; }
      const ux = (B[0] - A[0]) / L, uy = (B[1] - A[1]) / L, hd = Math.min(o.head, L * 0.6), hw = hd * 0.55;
      const bx = B[0] - ux * hd, by = B[1] - uy * hd;
      if (o.dash) ctx.setLineDash(o.dash);
      ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(bx, by); ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(B[0], B[1]); ctx.lineTo(bx - uy * hw, by + ux * hw); ctx.lineTo(bx + uy * hw, by - ux * hw); ctx.closePath(); ctx.fill();
      ctx.restore();
      if (o.label) this.textPx(o.label, B[0] + ux * 15, B[1] + uy * 15, { color: o.color, font: "600 13px 'JetBrains Mono', monospace", align: "center" });
    }
    dot(p, o) {
      o = Object.assign({ r: 4, color: "--fg", alpha: 1 }, o || {});
      const P = this.P(p), ctx = this.ctx;
      ctx.save(); ctx.globalAlpha = o.alpha; ctx.fillStyle = this.col(o.color);
      ctx.beginPath(); ctx.arc(P[0], P[1], o.r, 0, 2 * Math.PI); ctx.fill(); ctx.restore();
    }
    textPx(str, x, y, o) { Plane.prototype.textPx.call(this, str, x, y, o); }
    text(str, p, o) { const P = this.P(p); this.textPx(str, P[0] + ((o && o.dx) || 0), P[1] + ((o && o.dy) || 0), o); }
    hud(str, o) { this.textPx(str, 12, 16, Object.assign({ color: "--muted", font: "11px 'JetBrains Mono', monospace" }, o || {})); }
  }
  const unitN = (v) => { const n = vnorm(v); return n < 1e-12 ? v.map(() => 0) : vscale(v, 1 / n); };

  const PRESETS = {
    identity: [1, 0, 0, 1],
    rot90: [0, -1, 1, 0],
    rot45: [Math.SQRT1_2, -Math.SQRT1_2, Math.SQRT1_2, Math.SQRT1_2],
    shear: [1, 1, 0, 1],
    stretch: [2, 0, 0, 1.5],
    reflect: [-1, 0, 0, 1],
    squish: [1, 2, 0.5, 1],
  };

  global.LA = {
    css, I, apply, mul, det, inv, lerp, col1, col2, fromCols, norm, cross, dot, scale, add, sub, unit, perp, close,
    eig, sigmaMin, fmt, vfmt, snap, tween, wait, Plane, MatrixInput, matHTML, vecHTML, PRESETS,
    Q, rref, nullBasis, transpose, vdot, vnorm, vadd, vsub, vscale, orthonormal, projectOn, View3,
  };
})(window);
