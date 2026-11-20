/*
 * Shared helpers for the space scenery.
 *
 * The site has no build step, so the scenery files are classic scripts that share one
 * namespace, window.Space. Load order (see index.html):
 *   utils → starfield → galaxy → solar-system → hyperjump → main
 */
(() => {
  'use strict';

  const Space = (window.Space = window.Space || {});

  const clamp01 = v => Math.max(0, Math.min(1, v));
  /** progress of t through the window [a, b], clamped to 0..1 */
  const seg = (t, a, b) => clamp01((t - a) / (b - a));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeInOut = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  /** soft radial-gradient sprite texture; stops = [[offset, cssColor], ...] */
  function glowTexture(stops, size = 128) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    stops.forEach(([o, col]) => g.addColorStop(o, col));
    x.fillStyle = g;
    x.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(c);
  }

  /** fragment shader for a soft round star point (expects varying vec3 vC) */
  const STAR_FRAG = `varying vec3 vC;
    void main(){ float d = length(gl_PointCoord - .5); float s = smoothstep(.5, 0., d); s *= s; gl_FragColor = vec4(vC * s, s); }`;

  /** pointer position as -0.5..0.5 of the viewport, shared by the parallax effects */
  class Pointer {
    constructor() {
      this.x = 0;
      this.y = 0;
      addEventListener('pointermove', e => {
        this.x = e.clientX / innerWidth - .5;
        this.y = e.clientY / innerHeight - .5;
      }, { passive: true });
    }
  }

  Space.util = { clamp01, seg, lerp, easeInOut, glowTexture, STAR_FRAG };
  Space.Pointer = Pointer;
  Space.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
})();
