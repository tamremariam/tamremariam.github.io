/*
 * Galaxy: the Milky Way-style spiral galaxy in the hero (Three.js r128).
 *
 * A shader paints the disk light once (log-spiral arms, clumps, knots, dust lanes, bulge) into a
 * texture on a flat disk; resolved stars sit along the same spiral; a 3D star field gives depth.
 * The whole thing turns rigidly, can be dragged, and leans with the pointer and page scroll.
 *
 * It also owns the WebGL renderer, scene and camera of the hero canvas, so other scenery (the solar
 * system, the hyperjump) plugs in with onFrame() instead of running its own loop.
 */
(() => {
  'use strict';

  const { glowTexture, STAR_FRAG } = Space.util;

  const BAKE_FRAG = `precision highp float; uniform float K, RES; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
      return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
    float fbm(vec2 p){ float v = 0., a = .5; mat2 m = mat2(.8,.6,-.6,.8); for(int i=0;i<6;i++){ v += a*n(p); p = m*p*2.03 + 1.7; a *= .5; } return v; }
    // noise that wraps in x with period P (lets us sample along the spiral without a seam)
    float hp(vec2 i, float P){ i.x = mod(i.x, P); return h(i); }
    float np(vec2 p, float P){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
      return mix(mix(hp(i, P), hp(i+vec2(1,0), P), f.x), mix(hp(i+vec2(0,1), P), hp(i+vec2(1,1), P), f.x), f.y); }
    float fbp(vec2 p, float P){ float v = 0., a = .5; for(int i=0;i<5;i++){ v += a*np(p, P); p *= 2.; P *= 2.; p.y += 1.3; a *= .5; } return v; }
    void main(){
      vec2 p = vUv * 2. - 1.; float r = length(p);
      if (r > 1.) { gl_FragColor = vec4(0.); return; }
      vec2 w = p + .07 * (vec2(fbm(p*3. + 1.7), fbm(p*3. + 9.2)) - .5);   // irregular, organic arms
      float rw = length(w) + 1e-4, th = atan(w.y, w.x);
      float ph = th - K * log(rw);                                          // logarithmic spiral phase
      float c = .5 + .5 * cos(2. * ph);                                     // two arms
      float spur = pow(.5 + .5 * cos(4. * ph + 1.3 * fbm(p * 5.)), 4.) * .35;   // branching spurs between the main arms
      float arm = pow(c, 2.2) + spur, armSoft = pow(c, 1.1);
      float disk = exp(-r / .4), armR = smoothstep(.05, .2, r) * smoothstep(1., .5, r);
      float bulge = exp(-r*r / .0022) * .85 + exp(-r*r / .014) * .4 + exp(-r*r / .08) * .14;
      vec2 sc = vec2(ph / 6.2831853 * 28., log(rw) * 4.);                    // spiral coords: x across arms, y along them
      float cl = fbm(p * 13.), fib = fbp(sc * vec2(1., 2.4), 28.);
      arm *= .45 + .9 * mix(fib, fbm(w * 9. + 2.4), .45);                   // short clumpy fibres, not long streaks
      float knots = smoothstep(.7, .86, fbm(p * 64. + 3.)) * pow(c, 3.) * armR * (.5 + fib); // many small HII knots
      vec3 warm = vec3(1., .84, .62), blue = vec3(.62, .76, 1.), core = vec3(1., .95, .86);
      vec3 col = mix(warm, core, smoothstep(.15, 0., r)) * bulge;
      vec3 armCol = mix(warm, blue, smoothstep(.1, .42, r));
      col += armCol * disk * (.18 + 1.7 * arm * armR * (.55 + .9 * cl));
      col += warm * disk * .22 * armSoft;
      vec2 sq = floor(vUv * RES * .8);
      col += step(.94, h(sq + 5.)) * .22 * (disk * 2. + arm * .8) * h(sq + 9.) * vec3(.95, .92, .88); // fine stellar grain (sits behind the dust)

      // ---- dust: optical depth tau, made of broken lanes, feathers, flocculent patches and nuclear wisps
      float win = smoothstep(.03, .16, r) * smoothstep(.98, .42, r);
      float lane = pow(.5 + .5 * cos(2. * ph + .75), 9.);                    // lane on the inner (concave) edge of each arm
      float tau = lane * smoothstep(.22, .62, fbm(w * 11. + 4.1)) * (.5 + 1.7 * fbp(sc * vec2(1., 2.6) + vec2(0., 7.), 28.));
      float fe = fbp(vec2(sc.x + sc.y * 3., sc.y * 2.) + vec2(5., 11.), 28.);   // feathers shearing out across the arms
      tau += smoothstep(.56, .8, fe) * .95 * (.25 + .75 * pow(.5 + .5 * cos(2. * ph + .45), 2.));
      tau += smoothstep(.6, .86, fbm(p * 21. + 7.3)) * .55;                 // flocculent patches
      tau += smoothstep(.64, .9, fbm(p * 46. + 2.2)) * .4;                   // small globules
      float inner = smoothstep(.015, .06, r) * smoothstep(.24, .07, r);       // wisps spiralling into the bulge
      tau += inner * pow(.5 + .5 * cos(2. * ph + 1.2 + 2.2 * fbm(p * 9.)), 5.) * 1.3;
      tau *= win * smoothstep(1., .35, r) * (.75 + .5 * fbm(p * 4. + 3.3));      // thins out toward the rim
      vec3 ext = exp(-tau * vec3(1.05, 1.4, 1.95));                          // extinction reddens the light, it does not just black it out
      float lit = clamp(disk * 2.2 + bulge * 1.5, 0., 1.);
      col = col * ext + vec3(.34, .18, .08) * (1. - ext.g) * lit * .28;      // warm scattered light inside the lanes

      col += vec3(.78, .88, 1.) * knots * (disk + .2) * 6.5 * mix(1., ext.b, .6);
      vec2 sp = floor(vUv * RES * .5);
      float st = step(.9975, h(sp)) * smoothstep(1., .15, r) * (.4 + .6 * h(sp + 3.));
      col += st * mix(vec3(1., .85, .6), vec3(.8, .9, 1.), h(sp + 7.));          // foreground resolved stars
      col = 1. - exp(-col * 1.6);                                            // filmic tone map: no blown-out core
      float edge = smoothstep(1., .78, r);
      // alpha = dust coverage: the disk shader uses it to occlude what is behind, the stars use it to dim themselves
      gl_FragColor = vec4(col * edge, (1. - ext.g) * lit * edge);
    }`;

  class Galaxy {
    static R = 4.6;              // radius of the 3D star field
    static H = Galaxy.R * 1.08;  // disk half-size (plane coords -> group space: x = px*H, z = -py*H)
    static K = 3.1;              // spiral winding: arm angle = K·ln(r) + shift, so arms wind counter-clockwise outward
    static ARM_SHIFT = .45;      // aligns particles with the shader's brightest arm ridge
    /** -1 = clockwise seen from above, so the arms trail behind the rotation like a real spiral galaxy */
    static SPIN_DIR = -1;
    static TILT = { x: .62, z: .12 };   // the disk sits above the camera, so it needs extra lean not to look squashed flat
    static LIFT = 2.45;

    /**
     * @param {HTMLCanvasElement} canvas
     * @param {{ starfield: Space.Starfield, pointer: Space.Pointer, reduce?: boolean }} opts
     */
    constructor(canvas, { starfield, pointer, reduce = false }) {
      this.canvas = canvas;
      this.starfield = starfield;
      this.pointer = pointer;
      this.reduce = reduce;
      this.small = innerWidth < 700;
      this.autoSpin = 1;          // 1 = turns on its own; 0 = only when dragged
      this.hooks = [];

      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'high-performance' });
      this.dpr = Math.min(2, devicePixelRatio);
      this.renderer.setPixelRatio(this.dpr);
      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(40, 1, .1, 100);
      this.group = new THREE.Group();
      this.scene.add(this.group);
      this.uniforms = {
        uT: { value: 0 }, uSize: { value: (this.small ? 12 : 15) * this.dpr },
        uWarp: { value: 0 }, uMap: { value: this.bakeDisk() }, uFade: { value: 1 }, uH: { value: Galaxy.H }
      };

      this.buildDisk();
      this.buildStars();
      this.buildCore();

      this.group.rotation.set(Galaxy.TILT.x, 0, Galaxy.TILT.z);
      this.group.position.y = Galaxy.LIFT;
      this.tilt = { ...Galaxy.TILT };
      this.spin = 0;
      this.kickV = 0;
      this.time = 0;

      this.resize();
      addEventListener('resize', () => this.resize());
      this.bindDrag();
      starfield.addEventListener('warpstart', () => this.kick());

      this.visible = true;
      new IntersectionObserver(es => (this.visible = es[0].isIntersecting)).observe(canvas);
      if (reduce) this.render();
      else { this.loop = this.loop.bind(this); requestAnimationFrame(this.loop); }
    }

    /* ---------------------------------------------------------------- public API */
    /** camera distance that keeps the whole galaxy in frame (further back on narrow screens) */
    get baseZ() { return this.camera.aspect < .8 ? 15 : 11; }

    /** run fn(dt, t) every frame, after the galaxy has moved and before the frame is drawn */
    onFrame(fn) { this.hooks.push(fn); }

    render() { this.renderer.render(this.scene, this.camera); }

    /** give the spin a shove (on warp) */
    kick(v = .25) { this.kickV = v; }

    setFade(f) {
      this.uniforms.uFade.value = f;
      this.core.material.opacity = f;
      this.group.visible = f > .002;
    }

    /** a point in the disk (group space) at normalized radius r, `offset` radians behind arm `arm` (0 or 1) */
    armPoint(r, offset = 0, arm = 0) {
      const th = Galaxy.K * Math.log(r) + arm * Math.PI + Galaxy.ARM_SHIFT + offset;
      return new THREE.Vector3(Math.cos(th) * r * Galaxy.H, 0, -Math.sin(th) * r * Galaxy.H);
    }

    /* ---------------------------------------------------------------- build */
    bakeDisk() {
      const size = this.small ? 1024 : 2048;
      this.bakeTarget = new THREE.WebGLRenderTarget(size, size, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
      const scene = new THREE.Scene(), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
        uniforms: { K: { value: Galaxy.K }, RES: { value: size } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`,
        fragmentShader: BAKE_FRAG
      }));
      scene.add(quad);
      this.renderer.setRenderTarget(this.bakeTarget);
      this.renderer.render(scene, cam);
      this.renderer.setRenderTarget(null);
      quad.geometry.dispose(); quad.material.dispose();
      return this.bakeTarget.texture;
    }

    buildDisk() {
      const H = Galaxy.H;
      const disk = new THREE.Mesh(new THREE.PlaneGeometry(H * 2, H * 2), new THREE.ShaderMaterial({
        uniforms: this.uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide,
        // premultiplied "over": light adds, dust (texture alpha) partly hides what is behind it instead of leaving see-through holes
        blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
        fragmentShader: `uniform sampler2D uMap; uniform float uWarp, uFade; varying vec2 vUv;
          void main(){ vec4 t = texture2D(uMap, vUv); vec3 c = t.rgb * (1. + uWarp * .5) * uFade;
            gl_FragColor = vec4(c, max(max(c.r, max(c.g, c.b)) * .85, t.a * .55 * uFade)); }`
      }));
      disk.rotation.x = -Math.PI / 2;
      disk.renderOrder = 1;
      this.group.add(disk);
    }

    buildStars() {
      const { K, H, R, ARM_SHIFT } = Galaxy, small = this.small;
      const gs = () => { let u = 0; for (let k = 0; k < 4; k++) u += Math.random(); return u / 4 - .5; }; // ~gaussian in -.5..5
      const C = h => new THREE.Color(h), tc = new THREE.Color();

      // 3D field around the disk for depth
      const NF = small ? 2500 : 5000;
      // resolved stars along the SAME log spiral as the shader
      const NA = small ? 16000 : 38000;
      const N = NF + NA, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N);

      const cB = C('#cfdcff'), cO = C('#ffb877');
      for (let i = 0; i < NF; i++) {
        const r = Math.pow(Math.random(), .6) * R * 1.4, a = Math.random() * Math.PI * 2;
        pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = gs() * 2.2; pos[i * 3 + 2] = Math.sin(a) * r;
        if (Math.random() < .06) { tc.copy(cO); size[i] = 1.8 + Math.random() * 1.6; }
        else { tc.copy(cB).multiplyScalar(.45 + Math.random() * .5); size[i] = .5 + Math.random() * 1.1; }
        tc.toArray(col, i * 3);
      }

      const cIn = C('#ffe0b0'), cArm = C('#c2d4ff'), cOut = C('#86a6ff'), cKnot = C('#eaf1ff');
      const knots = [];
      for (let k = 0; k < (small ? 45 : 80); k++) {
        const r = .2 + Math.random() * .58, th = K * Math.log(r) + (k % 2) * Math.PI + ARM_SHIFT + gs() * .3;
        knots.push([Math.cos(th) * r, Math.sin(th) * r]);
      }
      for (let i = NF; i < N; i++) {
        let px, py, y;
        if (Math.random() < .14) { // star-forming knots: tight bright clusters
          const k = knots[(Math.random() * knots.length) | 0];
          px = k[0] + gs() * .05; py = k[1] + gs() * .05; y = gs() * .05;
          tc.copy(cKnot).multiplyScalar(1.1 + Math.random() * .4); size[i] = 1.2 + Math.random() * 1.8;
        } else { // arm stars: hug the arm, long tail between arms
          const arm = Math.random() < .5 ? 0 : Math.PI;
          const r = .1 + Math.pow(Math.random(), 1.3) * .74;
          const th = K * Math.log(r) + arm + ARM_SHIFT + gs() * .45;
          const off = () => Math.pow(Math.random(), 2.4) * (Math.random() < .5 ? 1 : -1) * (.02 + r * .05);
          px = Math.cos(th) * r + off(); py = Math.sin(th) * r + off(); y = gs() * .14 * (1 - r * .6);
          tc.copy(cIn).lerp(cArm, Math.min(1, Math.max(0, (r - .12) * 3.2))).lerp(cOut, Math.max(0, r - .6) * 2)
            .multiplyScalar((.55 + Math.random() * .6) * (1 - Math.max(0, r - .6) * 2.2)); // fade toward the rim
          size[i] = .6 + Math.random() * 1.4;
        }
        pos[i * 3] = px * H; pos[i * 3 + 1] = y; pos[i * 3 + 2] = -py * H;
        tc.toArray(col, i * 3);
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
      const field = new Float32Array(N); field.fill(1, 0, NF);   // 1 = loose 3D field star around the disk
      geo.setAttribute('aField', new THREE.BufferAttribute(field, 1));
      const stars = new THREE.Points(geo, new THREE.ShaderMaterial({
        uniforms: this.uniforms, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        defines: this.renderer.capabilities.maxVertexTextures > 0 ? { DUST: 1 } : {},
        vertexShader: `uniform float uSize, uWarp, uFade, uH; uniform sampler2D uMap; attribute float aSize, aField; varying vec3 vC;
          void main(){
            vec4 mv = modelViewMatrix * vec4(position, 1.);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = min(uSize * aSize * (1. + uWarp * .6) / max(-mv.z, .001), uSize * .6); // capped: no giant blobs up close
            vC = color * (1. + uWarp * .5) * uFade;
            vC *= 1. - uWarp * aField;   // field stars would hang frozen while the background streaks past: fade them out in warp
            #ifdef DUST // stars in the disk plane sit inside the dust: dim and redden them by the baked dust coverage
              vec2 duv = vec2(position.x, -position.z) / (2. * uH) + .5;
              #if __VERSION__ >= 300
                float d = textureLod(uMap, duv, 2.).a;
              #else
                float d = texture2DLod(uMap, duv, 2.).a;
              #endif
              d *= smoothstep(.3, .04, abs(position.y));
              vC *= mix(vec3(1.), vec3(.6, .38, .25), d * .8);
            #endif
          }`,
        fragmentShader: STAR_FRAG
      }));
      stars.renderOrder = 2;
      this.group.add(stars);
    }

    buildCore() {
      this.core = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture([[0, 'rgba(255,245,225,.9)'], [.2, 'rgba(255,220,170,.35)'], [.6, 'rgba(255,190,130,.06)'], [1, 'rgba(0,0,0,0)']]),
        blending: THREE.AdditiveBlending, depthWrite: false, transparent: true
      }));
      this.core.scale.set(2.4, 2.4, 1);
      this.core.renderOrder = 3;
      this.group.add(this.core);
    }

    /* ---------------------------------------------------------------- interaction & loop */
    bindDrag() {
      const c = this.canvas, d = (this.drag = { on: false, x: 0, y: 0, vx: 0, vy: 0 });
      c.addEventListener('pointerdown', e => { d.on = true; d.x = e.clientX; d.y = e.clientY; c.setPointerCapture(e.pointerId); });
      c.addEventListener('pointermove', e => {
        if (!d.on) return;
        d.vx = (e.clientX - d.x) * .005; d.vy = (e.clientY - d.y) * .003;
        d.x = e.clientX; d.y = e.clientY;
      });
      c.addEventListener('pointerup', () => (d.on = false));
      c.addEventListener('dblclick', () => this.starfield.pulse(900));
    }

    resize() {
      const r = this.canvas.getBoundingClientRect();
      this.renderer.setSize(r.width, r.height, false);
      this.camera.aspect = r.width / r.height;
      this.camera.position.set(0, 0, this.baseZ);
      this.camera.updateProjectionMatrix();
      if (this.reduce) this.render();
    }

    loop() {
      requestAnimationFrame(this.loop);
      if (!this.visible) return;
      const dt = .016, d = this.drag, g = this.group, p = this.pointer, u = this.uniforms;
      this.time += dt;
      d.vx *= .94; d.vy *= .94; this.kickV *= .95;
      u.uT.value = this.time;
      u.uWarp.value += ((this.starfield.warping ? 1 : 0) - u.uWarp.value) * .06;

      const drift = this.kickV + .0025 + Math.abs(this.starfield.speed) * .0015;
      this.spin += d.vx + Galaxy.SPIN_DIR * drift * this.autoSpin;
      this.tilt.x = Math.max(.35, Math.min(1.45, this.tilt.x + d.vy));
      const sc = scrollY / innerHeight;
      g.rotation.x += (this.tilt.x + p.y * .12 - g.rotation.x) * .08;
      g.rotation.y = this.spin;
      g.rotation.z += (this.tilt.z + p.x * .15 - g.rotation.z) * .05;
      g.position.y += ((Galaxy.LIFT - p.y * .3 + sc * 1.4) - g.position.y) * .06;
      g.scale.setScalar(1 - Math.min(sc, 1) * .2);

      for (const h of this.hooks) h(dt, this.time);
      this.render();
    }
  }

  Space.Galaxy = Galaxy;
})();
