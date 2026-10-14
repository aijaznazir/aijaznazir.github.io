/* Shallow-water core: exact Riemann solver (dam break) and a
   finite-volume solver (MUSCL-minmod + HLL, SSP-RK2) on a flat bed.
   Pure functions, no DOM, so it can be tested on its own. */
(function (global) {
  "use strict";
  const g = 9.81;
  const EPS = 1e-6; // depth below which a cell counts as dry (m)

  /* ---------- Exact Riemann solver for a dam break (uL = uR = 0 allowed general u) ---------- */
  function riemann(hL, uL, hR, uR) {
    const aL = Math.sqrt(g * hL), aR = Math.sqrt(g * hR);
    if (hR <= 0) {
      // Dry bed downstream: single left rarefaction ending at the front u = uL + 2aL.
      return {
        dry: true, hs: 0, us: 0, front: uL + 2 * aL,
        sample(xi) {
          if (xi <= uL - aL) return [hL, uL];
          if (xi < uL + 2 * aL) {
            const u = (uL + 2 * aL + 2 * xi) / 3, a = (uL + 2 * aL - xi) / 3;
            return [(a * a) / g, u];
          }
          return [0, 0];
        },
      };
    }
    const fK = (h, hK, aK) =>
      h <= hK ? 2 * (Math.sqrt(g * h) - aK) : (h - hK) * Math.sqrt((0.5 * g * (h + hK)) / (h * hK));
    const F = (h) => fK(h, hL, aL) + fK(h, hR, aR) + uR - uL;
    // F is increasing in h; bracket and bisect.
    let lo = 1e-12, hi = Math.max(hL, hR);
    while (F(hi) < 0) hi *= 2;
    for (let k = 0; k < 200; k++) {
      const m = 0.5 * (lo + hi);
      if (F(m) > 0) hi = m; else lo = m;
    }
    const hs = 0.5 * (lo + hi);
    const us = 0.5 * (uL + uR) + 0.5 * (fK(hs, hR, aR) - fK(hs, hL, aL));
    const as = Math.sqrt(g * hs);

    const leftShock = hs > hL, rightShock = hs > hR;
    const SL = leftShock ? uL - aL * Math.sqrt(((hs + hL) * hs) / (2 * hL * hL)) : null;
    const SR = rightShock ? uR + aR * Math.sqrt(((hs + hR) * hs) / (2 * hR * hR)) : null;

    return {
      dry: false, hs, us, SL, SR,
      leftHead: leftShock ? SL : uL - aL, leftTail: leftShock ? SL : us - as,
      rightHead: rightShock ? SR : uR + aR, rightTail: rightShock ? SR : us + as,
      sample(xi) {
        if (xi <= us) {
          if (leftShock) return xi < SL ? [hL, uL] : [hs, us];
          if (xi <= uL - aL) return [hL, uL];
          if (xi >= us - as) return [hs, us];
          const u = (uL + 2 * aL + 2 * xi) / 3, a = (uL + 2 * aL - xi) / 3;
          return [(a * a) / g, u];
        }
        if (rightShock) return xi > SR ? [hR, uR] : [hs, us];
        if (xi >= uR + aR) return [hR, uR];
        if (xi <= us + as) return [hs, us];
        const u = (uR - 2 * aR + 2 * xi) / 3, a = (-uR + 2 * aR + xi) / 3;
        return [(a * a) / g, u];
      },
    };
  }

  /* ---------- Finite-volume solver ---------- */
  const minmod = (a, b) => (a * b <= 0 ? 0 : Math.abs(a) < Math.abs(b) ? a : b);

  function hll(hL, uL, hR, uR, out) {
    const dryL = hL < EPS, dryR = hR < EPS;
    if (dryL && dryR) { out[0] = 0; out[1] = 0; return; }
    const aL = Math.sqrt(g * hL), aR = Math.sqrt(g * hR);
    let SL, SR;
    if (dryR) { SL = uL - aL; SR = uL + 2 * aL; }
    else if (dryL) { SL = uR - 2 * aR; SR = uR + aR; }
    else { SL = Math.min(uL - aL, uR - aR); SR = Math.max(uL + aL, uR + aR); }
    const qL = hL * uL, qR = hR * uR;
    const fL0 = qL, fL1 = qL * uL + 0.5 * g * hL * hL;
    const fR0 = qR, fR1 = qR * uR + 0.5 * g * hR * hR;
    if (SL >= 0) { out[0] = fL0; out[1] = fL1; return; }
    if (SR <= 0) { out[0] = fR0; out[1] = fR1; return; }
    const d = SR - SL;
    out[0] = (SR * fL0 - SL * fR0 + SL * SR * (hR - hL)) / d;
    out[1] = (SR * fL1 - SL * fR1 + SL * SR * (qR - qL)) / d;
  }

  class Solver {
    constructor(N, x0, x1) {
      this.N = N; this.x0 = x0; this.L = x1 - x0; this.dx = this.L / N;
      const n = N + 4;
      this.h = new Float64Array(N); this.q = new Float64Array(N);
      this._h = new Float64Array(n); this._u = new Float64Array(n);
      this._sh = new Float64Array(n); this._su = new Float64Array(n);
      this._F0 = new Float64Array(N + 1); this._F1 = new Float64Array(N + 1);
      this._r0 = new Float64Array(N); this._r1 = new Float64Array(N);
      this._h1 = new Float64Array(N); this._q1 = new Float64Array(N);
      this._f = new Float64Array(2);
      this.t = 0;
    }
    x(i) { return this.x0 + (i + 0.5) * this.dx; }
    u(i) { return this.h[i] > EPS ? this.q[i] / this.h[i] : 0; }

    rhs(h, q, r0, r1) {
      const N = this.N, H = this._h, U = this._u, sh = this._sh, su = this._su;
      for (let i = 0; i < N; i++) { H[i + 2] = h[i]; U[i + 2] = h[i] > EPS ? q[i] / h[i] : 0; }
      // transmissive boundaries
      H[0] = H[1] = H[2]; U[0] = U[1] = U[2];
      H[N + 2] = H[N + 3] = H[N + 1]; U[N + 2] = U[N + 3] = U[N + 1];
      for (let k = 1; k < N + 3; k++) {
        sh[k] = minmod(H[k] - H[k - 1], H[k + 1] - H[k]);
        su[k] = minmod(U[k] - U[k - 1], U[k + 1] - U[k]);
      }
      const f = this._f, F0 = this._F0, F1 = this._F1;
      for (let j = 0; j <= N; j++) {
        const a = j + 1, b = j + 2; // padded cells left/right of face j
        let hl = Math.max(0, H[a] + 0.5 * sh[a]), hr = Math.max(0, H[b] - 0.5 * sh[b]);
        let ul = hl > EPS ? U[a] + 0.5 * su[a] : 0, ur = hr > EPS ? U[b] - 0.5 * su[b] : 0;
        hll(hl, ul, hr, ur, f);
        F0[j] = f[0]; F1[j] = f[1];
      }
      const idx = 1 / this.dx;
      for (let i = 0; i < N; i++) {
        r0[i] = -(F0[i + 1] - F0[i]) * idx;
        r1[i] = -(F1[i + 1] - F1[i]) * idx;
      }
    }

    clean(h, q) {
      for (let i = 0; i < this.N; i++) {
        if (h[i] < EPS) { h[i] = Math.max(0, h[i]); q[i] = 0; }
      }
    }

    maxSpeed() {
      let m = 1e-9;
      for (let i = 0; i < this.N; i++) {
        const h = this.h[i];
        if (h > EPS) m = Math.max(m, Math.abs(this.q[i] / h) + Math.sqrt(g * h));
      }
      return m;
    }

    step(dt) {
      const N = this.N, h = this.h, q = this.q, r0 = this._r0, r1 = this._r1, h1 = this._h1, q1 = this._q1;
      this.rhs(h, q, r0, r1);
      for (let i = 0; i < N; i++) { h1[i] = h[i] + dt * r0[i]; q1[i] = q[i] + dt * r1[i]; }
      this.clean(h1, q1);
      this.rhs(h1, q1, r0, r1);
      for (let i = 0; i < N; i++) {
        h[i] = 0.5 * h[i] + 0.5 * (h1[i] + dt * r0[i]);
        q[i] = 0.5 * q[i] + 0.5 * (q1[i] + dt * r1[i]);
      }
      this.clean(h, q);
      this.t += dt;
    }

    advance(T, tmax, cfl) {
      let n = 0;
      while (T > 1e-12 && n < 5000) {
        let dt = Math.min((cfl || 0.4) * this.dx / this.maxSpeed(), T);
        if (tmax != null) dt = Math.min(dt, tmax - this.t);
        if (dt <= 0) break;
        this.step(dt);
        T -= dt; n++;
      }
      return n;
    }
  }

  global.SWE = { g, EPS, riemann, Solver };
  if (typeof module !== "undefined") module.exports = global.SWE;
})(typeof window !== "undefined" ? window : globalThis);
