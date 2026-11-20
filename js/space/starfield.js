/*
 * Starfield: the full-screen 2D canvas of stars flying towards the viewer, plus the
 * perspective floor grid that scrolls with it.
 *
 * Warp makes the stars streak. The streaks radiate from a focus point and can run
 * backwards (converging), which the hyperjump uses when flying away from the Sun.
 *
 * Events: 'warpstart' fires whenever warp is switched on.
 */
(() => {
  'use strict';

  const PALETTE = ['255,111,159', '227,172,99', '120,160,255', '238,241,255'];

  class Starfield extends EventTarget {
    static CRUISE = .35;
    /** warp speed: a smooth glide with soft glowing trails (used by the hyperjump and by holding Space) */
    static WARP = 7;

    /**
     * @param {HTMLCanvasElement} canvas
     * @param {{ pointer: Space.Pointer, floor?: HTMLElement, reduce?: boolean }} opts
     */
    constructor(canvas, { pointer, floor = null, reduce = false }) {
      super();
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.pointer = pointer;
      this.floor = floor;
      this.reduce = reduce;

      this.speed = Starfield.CRUISE;   // current speed (negative = flying backwards)
      this.warping = false;
      this.dir = 1;                    // 1 forward, -1 backward
      this.focus = { x: .5, y: .5 };   // where streaks radiate from, as viewport fractions
      this.scrollBoost = 0;
      this.cx = 0; this.cy = 0;        // smoothed parallax offset
      this.floorY = 0;

      this.resize();
      this.glows = Object.fromEntries(PALETTE.map(c => [c, Starfield.glow(c)]));
      this.t = 0;
      this.act = 0;                    // 0..1, eases in while warping: the glowing look only shows in action
      this.stars = Array.from({ length: innerWidth < 600 ? 520 : 1300 }, () => this.spawn());
      addEventListener('resize', () => this.resize());
      this.bindScroll();

      if (reduce) this.drawStatic();
      else { this.tick = this.tick.bind(this); requestAnimationFrame(this.tick); }
    }

    /* ---------------------------------------------------------------- public API */
    warpOn() { this.warping = true; this.dispatchEvent(new Event('warpstart')); }
    warpOff() { this.warping = false; }
    /** short burst of warp */
    pulse(ms = 900) { this.warpOn(); setTimeout(() => this.warpOff(), ms); }
    /** dir: 1 = forward (streaks burst outward), -1 = backward (streaks converge); x, y: focus point */
    warpTo(dir = 1, x = .5, y = .5) {
      // turning around after the warp has ended: flip the leftover drift instead of easing through zero (stars would freeze)
      if (dir !== this.dir && !this.warping) this.speed = Math.abs(this.speed) * dir;
      this.dir = dir; this.focus.x = x; this.focus.y = y;
    }

    /* ---------------------------------------------------------------- internals */
    resize() {
      this.W = this.canvas.width = innerWidth * devicePixelRatio;
      this.H = this.canvas.height = innerHeight * devicePixelRatio;
    }

    spawn(z) {
      const { W, H } = this, r = Math.random(), depth = z ?? Math.random() * W;
      // placed so the star lands at a uniformly random spot on screen: the whole screen is covered, not only the edges
      return {
        x: this.cx + (Math.random() - .5) * 2 * depth, y: this.cy + (Math.random() - .5) * 2 * depth * H / W, z: depth, pz: 0,
        m: Math.pow(Math.random(), 3),                         // brightness: most stars faint, a few bright ones
        tw: 1.5 + Math.random() * 3, ph: Math.random() * 6.28, // twinkle rate and phase
        c: PALETTE[r < .08 ? 0 : r < .16 ? 1 : r < .3 ? 2 : 3] // 8% rose, 8% amber, 14% blue, rest white
      };
    }

    /** flying backwards: a star close by and on screen, so it streams back towards the focus */
    spawnNear() {
      const { W, H } = this, z = W * (.06 + Math.random() * .55), s = this.spawn(z);
      s.x = this.cx + (Math.random() - .5) * 2 * z;
      s.y = this.cy + (Math.random() - .5) * 2 * z * H / W;
      return s;
    }

    /** soft round glow sprite in one palette colour, drawn on the heads of bright nearby stars */
    static glow(rgb, size = 64) {
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const x = c.getContext('2d'), g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      g.addColorStop(0, `rgba(${rgb},1)`); g.addColorStop(.18, `rgba(${rgb},.55)`); g.addColorStop(.5, `rgba(${rgb},.12)`); g.addColorStop(1, `rgba(${rgb},0)`);
      x.fillStyle = g; x.fillRect(0, 0, size, size);
      return c;
    }

    bindScroll() {
      let lastY = scrollY, idle;
      addEventListener('scroll', () => {
        const deep = scrollY > innerHeight * .55;
        this.scrollBoost = Math.min(deep ? 2.5 : 5, this.scrollBoost + Math.abs(scrollY - lastY) * (deep ? .008 : .015));
        lastY = scrollY;
        document.body.classList.add('scrolling');
        clearTimeout(idle);
        idle = setTimeout(() => document.body.classList.remove('scrolling'), 180);
      }, { passive: true });
    }

    tick() {
      requestAnimationFrame(this.tick);
      const { ctx, W, H, pointer } = this;
      // once a backward warp ends the background must flow forward again, not keep drifting back until the flight finishes:
      // flip the sign while the leftover speed is still small (stars never freeze, and the turn is not noticeable)
      if (!this.warping && this.speed < 0 && this.speed > -2) { this.speed = -this.speed; this.dir = 1; }
      const target = this.warping ? Starfield.WARP * this.dir : Starfield.CRUISE + this.scrollBoost;
      this.scrollBoost *= .92;
      this.speed += (target - this.speed) * (this.warping ? .035 : this.act > .05 ? .025 : .06); // ease in and out of warp
      this.act += ((this.warping ? 1 : 0) - this.act) * (this.warping ? .05 : .03);
      this.t += .016;
      this.cx += (pointer.x * W * .3 - this.cx) * .05;
      this.cy += (pointer.y * H * .3 - this.cy) * .05;

      const act = this.act, boost = Math.min(1, Math.abs(this.speed) / Starfield.WARP);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = `rgba(4,10,36,${.55 - act * .2})`;      // lower alpha = longer, softer trails in warp
      ctx.fillRect(0, 0, W, H);
      if (act > .02) ctx.globalCompositeOperation = 'lighter'; // in warp, overlapping stars add up into a glow
      const fx = W * this.focus.x, fy = H * this.focus.y, k = W * .5, { cx, cy } = this;
      ctx.lineCap = 'round';
      for (const s of this.stars) {
        s.pz = s.z; s.z -= this.speed * 4;
        if (s.z < 1) { Object.assign(s, this.spawn(W)); s.pz = s.z; continue; }
        if (s.z > W) { Object.assign(s, this.spawnNear()); s.pz = s.z; continue; }
        const sx = (s.x - cx) / s.z * k + fx, sy = (s.y - cy) / s.z * k + fy;
        if (sx < 0 || sx > W || sy < 0 || sy > H) { Object.assign(s, this.spawn(W)); continue; }
        const px = (s.x - cx) / s.pz * k + fx, py = (s.y - cy) / s.pz * k + fy, d = 1 - s.z / W;
        // idle (act 0): the plain look; in warp (act 1): varied brightness, twinkle and glowing heads
        const tw = 1 - act * (1 - boost) * .35 * (.5 + .5 * Math.sin(this.t * s.tw + s.ph));
        const a = (Math.min(1, .3 + d * 1.1) * (1 - act) + Math.min(1, d * d * (.6 + s.m * 1.6)) * act) * tw;
        ctx.strokeStyle = `rgba(${s.c},${a})`;
        ctx.lineWidth = Math.max(.9 * (1 - act) + .3 * act, d * (2.3 * (1 - act) + (1.1 + s.m * 2.2) * act) * devicePixelRatio);
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(sx, sy); ctx.stroke();
        if (act > .02 && s.m > .35 && d > .45) { // halo on bright, close stars
          const r = d * d * (6 + s.m * 14) * devicePixelRatio;
          ctx.globalAlpha = a * .8 * act;
          ctx.drawImage(this.glows[s.c], sx - r, sy - r, r * 2, r * 2);
          ctx.globalAlpha = 1;
        }
      }
      ctx.globalCompositeOperation = 'source-over';

      if (this.floor) {
        this.floorY = (this.floorY + this.speed * 1.5) % 64;
        this.floor.style.backgroundPosition = `${-cx / devicePixelRatio * .12}px ${this.floorY}px`;
      }
    }

    drawStatic() {
      const { ctx, W, H } = this;
      ctx.fillStyle = '#040a24'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(238,241,255,.6)';
      for (let i = 0; i < 300; i++) ctx.fillRect(Math.random() * W, Math.random() * H, 1.5, 1.5);
    }
  }

  Space.Starfield = Starfield;
})();
