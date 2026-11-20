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
    static WARP = 26;

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
      this.stars = Array.from({ length: innerWidth < 600 ? 420 : 850 }, () => this.spawn());
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
    warpTo(dir = 1, x = .5, y = .5) { this.dir = dir; this.focus.x = x; this.focus.y = y; }

    /* ---------------------------------------------------------------- internals */
    resize() {
      this.W = this.canvas.width = innerWidth * devicePixelRatio;
      this.H = this.canvas.height = innerHeight * devicePixelRatio;
    }

    spawn(z) {
      const { W, H } = this, r = Math.random();
      return {
        x: (Math.random() - .5) * W * 2, y: (Math.random() - .5) * H * 2, z: z ?? Math.random() * W, pz: 0,
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
      const target = this.warping ? Starfield.WARP * this.dir : Starfield.CRUISE + this.scrollBoost;
      this.scrollBoost *= .92;
      this.speed += (target - this.speed) * .06;
      this.cx += (pointer.x * W * .3 - this.cx) * .05;
      this.cy += (pointer.y * H * .3 - this.cy) * .05;

      ctx.fillStyle = `rgba(4,10,36,${this.warping ? .22 : .55})`; // lower alpha = longer trails
      ctx.fillRect(0, 0, W, H);
      const fx = W * this.focus.x, fy = H * this.focus.y, k = W * .5, { cx, cy } = this;
      ctx.lineCap = 'round';
      for (const s of this.stars) {
        s.pz = s.z; s.z -= this.speed * 4;
        if (s.z < 1) { Object.assign(s, this.spawn(W)); s.pz = s.z; continue; }
        if (s.z > W) { Object.assign(s, this.spawnNear()); s.pz = s.z; continue; }
        const sx = (s.x - cx) / s.z * k + fx, sy = (s.y - cy) / s.z * k + fy;
        if (sx < 0 || sx > W || sy < 0 || sy > H) { Object.assign(s, this.spawn(W)); continue; }
        const px = (s.x - cx) / s.pz * k + fx, py = (s.y - cy) / s.pz * k + fy, d = 1 - s.z / W;
        ctx.strokeStyle = `rgba(${s.c},${Math.min(1, d * 1.4)})`;
        ctx.lineWidth = Math.max(.3, d * 2.3 * devicePixelRatio);
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(sx, sy); ctx.stroke();
      }

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
