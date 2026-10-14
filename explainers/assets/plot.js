/* Minimal canvas plotting helper shared by the explainer pages.
   No dependencies. Handles high-DPI screens, resizing and light/dark colours. */
(function (global) {
  "use strict";

  const css = (name) =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  function niceTicks(lo, hi, n) {
    const span = hi - lo;
    const raw = span / Math.max(1, n);
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const r = raw / mag;
    const step = (r < 1.5 ? 1 : r < 3 ? 2 : r < 7 ? 5 : 10) * mag;
    const out = [];
    for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + 1e-9 * span; v += step) {
      out.push(+v.toFixed(10));
    }
    return out;
  }

  function fmt(v) {
    if (Math.abs(v) < 1e-12) return "0";
    const a = Math.abs(v);
    if (a >= 1e4 || a < 1e-2) return v.toExponential(0);
    return String(+v.toPrecision(3));
  }

  class Fig {
    constructor(canvas, opts) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.o = Object.assign(
        {
          xlim: [0, 1], ylim: [0, 1],
          aspect: 0.5, minH: 200, maxH: 420, square: false,
          pad: { l: 46, r: 14, t: 12, b: 36 },
          xlabel: "", ylabel: "", xticks: null, yticks: null,
        },
        opts || {}
      );
      this.w = 0;
      this.h = 0;
      this.redraw = null;
      this.resize();
      const host = canvas.parentElement;
      if ("ResizeObserver" in window) {
        new ResizeObserver(() => {
          if (this.resize() && this.redraw) this.redraw();
        }).observe(host);
      }
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      if (mq.addEventListener) mq.addEventListener("change", () => this.redraw && this.redraw());
    }

    resize() {
      const w = this.canvas.parentElement.clientWidth;
      if (!w || w === this.w) return false;
      const { l, r, t, b } = this.o.pad;
      let h = this.o.square ? w - l - r + t + b : w * this.o.aspect;
      h = Math.round(Math.min(this.o.maxH, Math.max(this.o.minH, h)));
      const dpr = window.devicePixelRatio || 1;
      this.w = w;
      this.h = h;
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      this.canvas.style.height = h + "px";
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return true;
    }

    X(x) {
      const { l, r } = this.o.pad, [a, b] = this.o.xlim;
      return l + ((x - a) / (b - a)) * (this.w - l - r);
    }
    Y(y) {
      const { t, b } = this.o.pad, [c, d] = this.o.ylim;
      return t + ((d - y) / (d - c)) * (this.h - t - b);
    }

    clear() { this.ctx.clearRect(0, 0, this.w, this.h); }

    axes() {
      const ctx = this.ctx, { l, r, t, b } = this.o.pad, W = this.w, H = this.h;
      const grid = css("--grid"), line = css("--line"), muted = css("--muted");
      const tv = (k) => (Array.isArray(k) ? k[0] : k);
      const tl = (k) => (Array.isArray(k) ? k[1] : fmt(k));
      const xt = this.o.xticks || niceTicks(this.o.xlim[0], this.o.xlim[1], Math.max(3, Math.floor((W - l - r) / 80)));
      const yt = this.o.yticks || niceTicks(this.o.ylim[0], this.o.ylim[1], Math.max(3, Math.floor((H - t - b) / 45)));

      ctx.save();
      ctx.lineWidth = 1;
      ctx.strokeStyle = grid;
      ctx.beginPath();
      xt.forEach((k) => { const x = Math.round(this.X(tv(k))) + 0.5; ctx.moveTo(x, t); ctx.lineTo(x, H - b); });
      yt.forEach((k) => { const y = Math.round(this.Y(tv(k))) + 0.5; ctx.moveTo(l, y); ctx.lineTo(W - r, y); });
      ctx.stroke();

      ctx.strokeStyle = line;
      ctx.strokeRect(l + 0.5, t + 0.5, W - l - r - 1, H - t - b - 1);

      ctx.fillStyle = muted;
      ctx.font = "11px Inter, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      xt.forEach((k) => ctx.fillText(tl(k), this.X(tv(k)), H - b + 5));
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      yt.forEach((k) => ctx.fillText(tl(k), l - 6, this.Y(tv(k))));

      ctx.font = "italic 12px 'Source Serif 4', Georgia, serif";
      if (this.o.xlabel) {
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText(this.o.xlabel, l + (W - l - r) / 2, H - 2);
      }
      if (this.o.ylabel) {
        ctx.translate(12, t + (H - t - b) / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(this.o.ylabel, 0, 0);
      }
      ctx.restore();
    }

    clip() {
      const { l, r, t, b } = this.o.pad;
      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.rect(l, t, this.w - l - r, this.h - t - b);
      this.ctx.clip();
    }
    unclip() { this.ctx.restore(); }

    /* Polyline; NaN or a jump flagged by breakIf(i) starts a new segment. */
    line(xs, ys, o) {
      o = o || {};
      const ctx = this.ctx;
      ctx.save();
      ctx.strokeStyle = o.color || css("--accent");
      ctx.lineWidth = o.width || 2;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      if (o.dash) ctx.setLineDash(o.dash);
      if (o.alpha != null) ctx.globalAlpha = o.alpha;
      ctx.beginPath();
      let pen = false;
      for (let i = 0; i < xs.length; i++) {
        const x = xs[i], y = ys[i];
        if (!isFinite(x) || !isFinite(y) || (o.breakIf && o.breakIf(i))) { pen = false; if (!isFinite(x) || !isFinite(y)) continue; }
        const px = this.X(x), py = Math.max(-1e4, Math.min(1e4, this.Y(y)));
        if (pen) ctx.lineTo(px, py); else { ctx.moveTo(px, py); pen = true; }
      }
      ctx.stroke();
      ctx.restore();
    }

    hline(y, o) { this.line([this.o.xlim[0], this.o.xlim[1]], [y, y], o); }
    vline(x, o) { this.line([x, x], [this.o.ylim[0], this.o.ylim[1]], o); }

    text(str, x, y, o) {
      o = o || {};
      const ctx = this.ctx;
      ctx.save();
      ctx.fillStyle = o.color || css("--muted");
      ctx.font = o.font || "12px Inter, system-ui, sans-serif";
      ctx.textAlign = o.align || "left";
      ctx.textBaseline = o.baseline || "middle";
      ctx.fillText(str, this.X(x) + (o.dx || 0), this.Y(y) + (o.dy || 0));
      ctx.restore();
    }
  }

  global.Plot = { Fig, css, niceTicks, fmt };
})(window);
