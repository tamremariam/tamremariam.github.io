/*
 * HyperJump: the "Hyperdrive" flight between the galaxy and the solar system.
 *
 * Forward: the galaxy stops turning, the camera drifts until the Sun's spot on a spiral arm sits where
 * the solar system will appear, then dives at it. Nearby stars stream past, hyperspace streaks burst
 * out of the Sun, the galaxy dissolves around us, and the solar system grows out of that one star.
 * Backward: the same flight in reverse. The solar system shrinks back to a star (it never spins),
 * the streaks converge, and the galaxy reappears and starts turning again.
 */
(() => {
  'use strict';

  const { clamp01, seg, lerp, easeInOut, STAR_FRAG } = Space.util;

  /* ------------------------------------------------------------------ Neighbourhood: nearby stars we fly past */
  class Neighbourhood {
    static TINTS = [['#dfe8ff', .62], ['#fff4e0', .2], ['#ffcf8a', .1], ['#ff9a6a', .08]]; // [colour, share]

    constructor(count = innerWidth < 700 ? 700 : 1400) {
      // Radii are log-uniform, so at every stage of the exponential dive the same number of stars streams past.
      const pos = new Float32Array(count * 3), col = new Float32Array(count * 3), size = new Float32Array(count);
      const c = new THREE.Color(), v = new THREE.Vector3();
      for (let i = 0; i < count; i++) {
        const r = Math.exp(lerp(Math.log(.1), Math.log(7), Math.random()));
        const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, q = Math.sqrt(1 - u * u);
        v.set(q * Math.cos(a), u, q * Math.sin(a));             // uniform direction on the sphere
        v.y *= .45;                                              // flattened like the galactic disk
        v.multiplyScalar(r).toArray(pos, i * 3);
        c.set(Neighbourhood.pickTint()).multiplyScalar(.7 + Math.random() * .5).toArray(col, i * 3);
        size[i] = .6 + Math.pow(Math.random(), 3) * 2.2;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
      this.uniforms = { uFade: { value: 0 }, uDpr: { value: Math.min(2, devicePixelRatio) } };
      this.points = new THREE.Points(g, new THREE.ShaderMaterial({
        uniforms: this.uniforms, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        vertexShader: `uniform float uFade, uDpr; attribute float aSize; varying vec3 vC;
          void main(){
            vec4 mv = modelViewMatrix * vec4(position, 1.);
            gl_Position = projectionMatrix * mv;
            float close = clamp(.5 / max(-mv.z, .001), 0., 1.);  // stars swell and brighten as we pass them
            gl_PointSize = min(aSize * (1.2 + 3. * close), 7.) * uDpr;
            vC = color * uFade * (.22 + .95 * close);
          }`,
        fragmentShader: STAR_FRAG
      }));
      this.points.frustumCulled = false;
      this.points.visible = false;
    }

    static pickTint() {
      let x = Math.random();
      for (const [hex, share] of Neighbourhood.TINTS) if ((x -= share) <= 0) return hex;
      return Neighbourhood.TINTS[0][0];
    }

    setFade(f) { this.uniforms.uFade.value = f; this.points.visible = f > .002; }
  }

  /* ------------------------------------------------------------------ HyperJump */
  class HyperJump {
    static DURATION = 5200;     // ms, each way
    static S_END = .02;         // closest approach, as a fraction of the normal viewing distance
    static SOLAR_SCALE = .74;   // solar system size relative to the galaxy group
    static SOLAR_LIFT = .35;    // solar system sits a little higher so the planets clear the name
    static HOME = { r: .56, offset: .3 }; // the Sun: just behind an arm, a bit over halfway out (like the Orion Spur)

    /**
     * @param {{ galaxy: Space.Galaxy, starfield: Space.Starfield, button: HTMLButtonElement,
     *           hint?: HTMLElement, captionHost?: HTMLElement, reduce?: boolean }} opts
     */
    constructor({ galaxy, starfield, button, hint = null, captionHost = document.body, reduce = false }) {
      Object.assign(this, { galaxy, starfield, button, hint, reduce });
      this.state = 'galaxy';     // 'galaxy' | 'solar'
      this.flight = null;        // the running flight, if any
      this.solar = null;         // built on first use (painting the planet textures takes a moment)

      this.caption = Object.assign(document.createElement('div'), { className: 'hj-caption' });
      this.caption.setAttribute('aria-live', 'polite');
      this.caption.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap'; // screen readers only
      captionHost.append(this.caption);

      this.home = galaxy.armPoint(HyperJump.HOME.r, HyperJump.HOME.offset);
      this.v = { target: new THREE.Vector3(), center: new THREE.Vector3(), V: new THREE.Vector3(), tmp: new THREE.Vector3() };

      this.near = new Neighbourhood();
      galaxy.scene.add(this.near.points);

      button.addEventListener('click', () => this.jump());
      galaxy.onFrame((dt, t) => this.frame(dt, t));
    }

    ensureSolar() {
      if (!this.solar) {
        this.solar = new Space.SolarSystem();
        this.galaxy.scene.add(this.solar.root);
      }
      return this.solar;
    }

    /** scale of the solar system when it fills the hero */
    get restScale() { return this.galaxy.group.scale.x * HyperJump.SOLAR_SCALE; }

    /** where the solar system normally sits (world space), written into out */
    restCenter(out) {
      out.copy(this.galaxy.group.position);
      out.y += HyperJump.SOLAR_LIFT;
      return out;
    }

    /** resting pose: follows the galaxy's tilt and drag, but the galaxy no longer auto-spins in this view */
    restPose() {
      const r = this.solar.root;
      this.restCenter(r.position);
      r.rotation.copy(this.galaxy.group.rotation);
      this.solar.setScale(this.restScale);
    }

    frame(dt, t) {
      const solar = this.solar;
      if (!solar) return;
      if (this.flight) this.fly();
      else if (solar.root.visible) this.restPose();
      if (solar.root.visible) solar.update(dt, t);
    }

    jump() {
      if (this.flight) return;
      const toSolar = this.state === 'galaxy';
      const solar = this.ensureSolar();
      this.caption.textContent = toSolar ? 'Flying to the Solar System' : 'Returning to the galaxy';
      if (this.reduce) { this.finish(toSolar); this.restPose(); this.galaxy.render(); return; }

      const focus = this.restScreenPoint();
      this.starfield.warpTo(toSolar ? 1 : -1, focus.x, focus.y);   // streaks burst out of / fall back into the Sun
      const cam = this.galaxy.camera;
      cam.near = .002; cam.updateProjectionMatrix();               // we get very close to the Sun
      if (!toSolar) solar.setFade(1);
      this.flight = { toSolar, t0: performance.now(), warp: false };
    }

    /**
     * One step of the flight. p = 0 is the normal galaxy view, p = 1 is arrival at the Sun.
     *
     * The camera only translates (never turns). Viewing the solar system parked at the Sun's spot in the
     * arm at scale s·S from (target - s·V) looks exactly like viewing it at its resting place from the
     * resting camera, so the hand-off at p = 1 is seamless: the system really is out there in the arm,
     * and it grows (or shrinks back to a star) only because we fly towards (or away from) it.
     */
    fly() {
      const f = this.flight, { galaxy, solar, v } = this, g = galaxy.group, cam = galaxy.camera;
      const raw = Math.min(1, (performance.now() - f.t0) / HyperJump.DURATION);
      const p = f.toSolar ? raw : 1 - raw;

      galaxy.autoSpin = 1 - easeInOut(seg(p, 0, .12));  // the galaxy holds still while we fly to the Sun

      g.updateMatrixWorld(true);
      g.localToWorld(v.target.copy(this.home));
      this.restCenter(v.center);
      v.V.copy(v.center); v.V.z -= galaxy.baseZ;        // resting camera -> resting solar system

      // 1) drift sideways until the Sun lines up with the solar system's spot on screen
      // 2) dive at it exponentially: slow start, rushing middle, gentle arrival
      const w = 1 - easeInOut(seg(p, 0, .4));
      const e = easeInOut(seg(p, .04, 1));
      const s = Math.exp(Math.log(HyperJump.S_END) * e);
      cam.position.copy(v.target).addScaledVector(v.V, -s).addScaledVector(v.tmp.subVectors(v.center, v.target), w);

      // the solar system is parked in the arm; from far away it is just one yellow star
      const r = solar.root;
      r.position.copy(v.target);
      r.rotation.copy(g.rotation);
      solar.setScale(this.restScale * HyperJump.S_END);
      solar.setFade(easeInOut(seg(p, .04, .3)));

      // the galaxy dissolves into the stars around us as we enter the arm
      galaxy.setFade(1 - easeInOut(seg(e, .5, .86)));
      this.near.points.position.copy(v.target);
      this.near.setFade(easeInOut(seg(e, .06, .3)) * (1 - easeInOut(seg(e, .82, .97))));

      // hyperspace streaks while we are inside the arm
      const warp = e > .3 && e < .8;
      if (warp !== f.warp) { f.warp = warp; warp ? this.starfield.warpOn() : this.starfield.warpOff(); }

      if (raw >= 1) this.finish(f.toSolar);
    }

    finish(toSolar) {
      const { galaxy, starfield, button, hint } = this, cam = galaxy.camera;
      this.flight = null;
      this.state = toSolar ? 'solar' : 'galaxy';
      galaxy.autoSpin = toSolar ? 0 : 1;
      cam.position.set(0, 0, galaxy.baseZ); cam.near = .1; cam.updateProjectionMatrix();
      galaxy.setFade(toSolar ? 0 : 1);
      this.solar.setFade(toSolar ? 1 : 0);
      this.near.setFade(0);
      starfield.warpOff(); starfield.warpTo(1);
      button.textContent = toSolar ? 'Back to galaxy' : 'Hyperdrive';
      if (hint) hint.textContent = toSolar ? 'Drag to orbit · Hyperdrive to return' : 'Drag the galaxy · hold Space to warp';
    }

    /** the resting solar system's centre on screen, as viewport fractions (seen from the resting camera) */
    restScreenPoint() {
      const { galaxy } = this, cam = galaxy.camera, c = this.restCenter(this.v.center);
      const rect = galaxy.canvas.getBoundingClientRect();
      const dz = galaxy.baseZ - c.z, ty = Math.tan(cam.fov * Math.PI / 360);
      const nx = c.x / dz / (ty * cam.aspect), ny = c.y / dz / ty;
      return {
        x: clamp01((rect.left + (nx + 1) / 2 * rect.width) / innerWidth),
        y: clamp01((rect.top + (1 - ny) / 2 * rect.height) / innerHeight)
      };
    }
  }

  Space.HyperJump = HyperJump;
})();
