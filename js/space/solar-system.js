/*
 * Solar system: the Sun and eight planets, painted procedurally (no image files).
 *
 *   Noise2D       value noise for canvas textures
 *   PlanetTexture paints equirectangular planet maps and Saturn's ring
 *   Sun, Planet   one body each, with their own fade
 *   SolarSystem   puts them together; root is a THREE.Group positioned by whoever shows it
 */
(() => {
  'use strict';

  const { clamp01, lerp, glowTexture } = Space.util;

  /* ------------------------------------------------------------------ Noise2D: value noise for canvas textures */
  class Noise2D {
    constructor(seed = 1) {
      const perm = [...Array(256).keys()];
      let s = seed * 9973 + 1;
      for (let i = 255; i > 0; i--) { s = (s * 16807) % 2147483647; const j = s % (i + 1); [perm[i], perm[j]] = [perm[j], perm[i]]; }
      this.p = new Uint8Array(512);
      for (let i = 0; i < 512; i++) this.p[i] = perm[i & 255];
    }
    hash(x, y) { return this.p[(this.p[x & 255] + y) & 511] / 255; }
    noise(x, y) {
      const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
      const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      const a = this.hash(xi, yi), b = this.hash(xi + 1, yi), c = this.hash(xi, yi + 1), d = this.hash(xi + 1, yi + 1);
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    }
    fbm(x, y, oct = 5) { let v = 0, a = .5, f = 1; for (let i = 0; i < oct; i++) { v += a * this.noise(x * f, y * f); f *= 2; a *= .5; } return v; }
    /** fbm that tiles horizontally with period `w` (no seam where a sphere texture wraps) */
    fbmWrap(x, y, w, oct = 5) { const t = x / w; return this.fbm(x, y, oct) * (1 - t) + this.fbm(x - w, y, oct) * t; }
  }

  /* ------------------------------------------------------------------ PlanetTexture: paints equirectangular maps */
  class PlanetTexture {
    static make(def, seed) {
      const W = def.r > .2 ? 512 : 256, H = W / 2;
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const ctx = c.getContext('2d'), img = ctx.createImageData(W, H), d = img.data;
      const N = new Noise2D(seed), P = 6; // noise period across the map width
      const col = hex => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
      const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
      const pal = (def.colors || ['#888888']).map(col);
      const samplePal = t => { t = clamp01(t) * (pal.length - 1); const i = Math.min(pal.length - 2, Math.floor(t)); return pal.length === 1 ? pal[0] : mix(pal[i], pal[i + 1], t - i); };

      for (let y = 0; y < H; y++) {
        const v = y / H, lat = Math.abs(v - .5) * 2;
        for (let x = 0; x < W; x++) {
          const u = x / W, nx = u * P, ny = v * P / 2;
          let rgb;
          switch (def.kind) {
            case 'bands': { // gas giants: turbulent latitude bands
              const turb = N.fbmWrap(nx * 2, ny * 6, P * 2, 4);
              const b = .5 + .5 * Math.sin((v + (turb - .5) * .06) * Math.PI * def.bands);
              rgb = samplePal(b * .85 + N.fbmWrap(nx * 4, ny * 20, P * 4, 3) * .15);
              if (def.spot) { const dx = (u - .3) / .07, dy = (v - .62) / .035, s = Math.exp(-(dx * dx + dy * dy)); rgb = mix(rgb, col('#c0522f'), s * .85); }
              break;
            }
            case 'earth': {
              const h = N.fbmWrap(nx * 1.5, ny * 1.5, P * 1.5, 6);
              if (h > .52) rgb = mix(col('#3f7a3a'), col('#9c8a5a'), clamp01((h - .52) * 6));
              else rgb = mix(col('#0f3a78'), col('#2a6fb5'), clamp01(h * 2));
              if (lat > .82) rgb = mix(rgb, [245, 248, 255], clamp01((lat - .82) * 8));
              const cl = N.fbmWrap(nx * 3 + 40, ny * 3, P * 3, 5);
              rgb = mix(rgb, [255, 255, 255], clamp01((cl - .55) * 3) * .85);
              break;
            }
            case 'rocky': {
              const n = N.fbmWrap(nx * 2, ny * 2, P * 2, 6);
              rgb = samplePal(n);
              const crater = N.fbmWrap(nx * 9, ny * 9, P * 9, 2);
              rgb = mix(rgb, [0, 0, 0], clamp01((crater - .62) * 3) * .35);
              if (def.caps && lat > .86) rgb = mix(rgb, [240, 240, 245], clamp01((lat - .86) * 10));
              break;
            }
            default: { // 'smooth': ice giants and Venus
              const n = N.fbmWrap(nx * 1.2, ny * 4, P * 1.2, 4);
              rgb = samplePal(.5 + (v - .5) * .4 + (n - .5) * .5);
            }
          }
          const i = (y * W + x) * 4; d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2]; d[i + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      const tex = new THREE.CanvasTexture(c);
      tex.anisotropy = 4;
      return tex;
    }

    static ring(inner, outer) {
      const W = 512, c = document.createElement('canvas'); c.width = W; c.height = 4;
      const x = c.getContext('2d'), N = new Noise2D(77);
      for (let i = 0; i < W; i++) {
        const t = i / W, gap = t > .62 && t < .67 ? .1 : 1; // Cassini division
        const a = (.25 + .75 * N.fbm(t * 40, .5, 3)) * gap * Math.sin(Math.PI * t) ** .4;
        const l = 190 + 50 * N.noise(t * 90, 2);
        x.fillStyle = `rgba(${l},${l * .9},${l * .72},${a.toFixed(3)})`; x.fillRect(i, 0, 1, 4);
      }
      return new THREE.CanvasTexture(c);
    }
  }

  /* ------------------------------------------------------------------ Sun */
  class Sun {
    constructor(radius = .6) {
      this.group = new THREE.Group();
      this.uniforms = { uT: { value: 0 }, uFade: { value: 1 } };
      this.mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 32), new THREE.ShaderMaterial({
        uniforms: this.uniforms, transparent: true,
        vertexShader: `varying vec3 vN; varying vec3 vP;
          void main(){ vN = normalize(normalMatrix * normal); vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
        fragmentShader: `uniform float uT, uFade; varying vec3 vN; varying vec3 vP;
          float h(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
          float n(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
            return mix(mix(mix(h(i), h(i+vec3(1,0,0)), f.x), mix(h(i+vec3(0,1,0)), h(i+vec3(1,1,0)), f.x), f.y),
                       mix(mix(h(i+vec3(0,0,1)), h(i+vec3(1,0,1)), f.x), mix(h(i+vec3(0,1,1)), h(i+vec3(1,1,1)), f.x), f.y), f.z); }
          float fbm(vec3 p){ float v = 0., a = .5; for(int i=0;i<5;i++){ v += a*n(p); p = p*2.03 + 1.7; a *= .5; } return v; }
          void main(){
            vec3 p = normalize(vP) * 3.;
            float g = fbm(p * 2.2 + vec3(0., uT * .08, uT * .05));          // granulation
            float s = fbm(p * .8 - uT * .03);                                 // large-scale activity
            vec3 col = mix(vec3(1., .42, .05), vec3(1., .86, .45), g);
            col = mix(col, vec3(1., .97, .8), smoothstep(.55, .8, s) * .6);
            float mu = max(dot(normalize(vN), vec3(0., 0., 1.)), 0.);
            col *= .45 + .75 * pow(mu, .45);                                  // limb darkening
            gl_FragColor = vec4(col * 1.25, uFade);
          }`
      }));
      this.group.add(this.mesh);
      this.glowA = this.sprite(glowTexture([[0, 'rgba(255,240,200,1)'], [.25, 'rgba(255,190,90,.55)'], [.6, 'rgba(255,120,40,.12)'], [1, 'rgba(0,0,0,0)']]), radius * 5.5);
      this.glowB = this.sprite(glowTexture([[0, 'rgba(255,200,120,.35)'], [.5, 'rgba(255,140,60,.06)'], [1, 'rgba(0,0,0,0)']]), radius * 12);
      this.light = new THREE.PointLight(0xfff0d8, 1.7);
      this.group.add(this.light);
    }
    sprite(map, scale) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      s.scale.set(scale, scale, 1); s.userData.base = scale; this.group.add(s); return s;
    }
    update(dt, t) {
      this.uniforms.uT.value = t;
      this.mesh.rotation.y += dt * .05;
      const pulse = 1 + Math.sin(t * 1.3) * .03;
      this.glowA.scale.setScalar(this.glowA.userData.base * pulse);
    }
    setFade(f) {
      this.uniforms.uFade.value = f;
      this.glowA.material.opacity = f; this.glowB.material.opacity = f;
      this.light.intensity = 1.7 * f;
    }
  }

  /* ------------------------------------------------------------------ Planet */
  class Planet {
    constructor(def, index) {
      this.def = def;
      this.pivot = new THREE.Object3D();                       // orbits the sun
      this.pivot.rotation.y = Math.random() * Math.PI * 2;
      this.body = new THREE.Object3D();                        // sits on the orbit
      this.body.position.x = def.orbit;
      this.pivot.add(this.body);

      this.material = new THREE.MeshStandardMaterial({ map: PlanetTexture.make(def, index + 3), roughness: .92, metalness: 0, transparent: true });
      this.mesh = new THREE.Mesh(new THREE.SphereGeometry(def.r, 48, 24), this.material);
      this.mesh.rotation.z = def.tilt || 0;
      this.body.add(this.mesh);
      this.fadeables = [this.material];

      if (def.atmosphere) this.addAtmosphere(def.atmosphere);
      if (def.ring) this.addRing(def.ring[0], def.ring[1]);
      if (def.moon) this.addMoon();

      // faint orbit line
      const pts = [];
      for (let i = 0; i <= 160; i++) { const a = i / 160 * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * def.orbit, 0, Math.sin(a) * def.orbit)); }
      this.orbitLine = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: 0x8fa6ff, transparent: true, opacity: .16, depthWrite: false }));
      this.orbitLine.userData.base = .16;
      this.fadeables.push(this.orbitLine.material);

      this.speed = .55 * Math.pow(1 / def.orbit, 1.5);         // Kepler-ish: inner planets move faster
    }
    addAtmosphere(color) {
      const m = new THREE.ShaderMaterial({
        uniforms: { uC: { value: new THREE.Color(color) }, uFade: { value: 1 } },
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide,
        vertexShader: `varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
        fragmentShader: `uniform vec3 uC; uniform float uFade; varying vec3 vN;
          void main(){ float f = pow(1. - abs(vN.z), 2.5); gl_FragColor = vec4(uC * f * 1.3 * uFade, f * uFade); }`
      });
      this.atmo = new THREE.Mesh(new THREE.SphereGeometry(this.def.r * 1.18, 32, 16), m);
      this.body.add(this.atmo);
    }
    addRing(inner, outer) {
      const geo = new THREE.RingGeometry(inner, outer, 128, 1);
      const pos = geo.attributes.position, uv = geo.attributes.uv, v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); uv.setXY(i, (v.length() - inner) / (outer - inner), .5); } // radial UVs
      const mat = new THREE.MeshBasicMaterial({ map: PlanetTexture.ring(inner, outer), transparent: true, side: THREE.DoubleSide, depthWrite: false });
      this.ring = new THREE.Mesh(geo, mat);
      this.ring.rotation.x = -Math.PI / 2 + .45;
      this.body.add(this.ring);
      this.fadeables.push(mat);
    }
    addMoon() {
      this.moonPivot = new THREE.Object3D();
      const mat = new THREE.MeshStandardMaterial({ map: PlanetTexture.make({ kind: 'rocky', r: .1, colors: ['#5f5f62', '#a9a9ad'] }, 99), roughness: 1, transparent: true });
      const moon = new THREE.Mesh(new THREE.SphereGeometry(this.def.r * .27, 24, 12), mat);
      moon.position.x = this.def.r * 2.1;
      this.moonPivot.add(moon); this.body.add(this.moonPivot);
      this.fadeables.push(mat);
    }
    update(dt) {
      this.pivot.rotation.y += this.speed * dt;
      this.mesh.rotation.y += (this.def.spin || .5) * dt;
      if (this.moonPivot) this.moonPivot.rotation.y += 1.6 * dt;
    }
    setFade(f) {
      this.fadeables.forEach(m => { m.opacity = (m === this.orbitLine.material ? .16 : 1) * f; });
      if (this.atmo) this.atmo.material.uniforms.uFade.value = f;
    }
  }

  /* ------------------------------------------------------------------ SolarSystem */
  class SolarSystem {
    static PLANETS = [
      { name: 'Mercury', r: .07, orbit: 1.0, kind: 'rocky', colors: ['#6e6a66', '#b5b0aa'], spin: .3 },
      { name: 'Venus', r: .12, orbit: 1.35, kind: 'smooth', colors: ['#c9a46a', '#f0d9a8', '#e2c08a'], spin: .1 },
      { name: 'Earth', r: .13, orbit: 1.75, kind: 'earth', atmosphere: '#5aa0ff', moon: true, tilt: .41, spin: .9 },
      { name: 'Mars', r: .09, orbit: 2.15, kind: 'rocky', colors: ['#7a2f12', '#c1440e', '#e0864f'], caps: true, spin: .85 },
      { name: 'Jupiter', r: .32, orbit: 3.15, kind: 'bands', bands: 13, spot: true, colors: ['#a8784f', '#e9d2b0', '#c8955f', '#f3e6cf'], spin: 1.6 },
      { name: 'Saturn', r: .27, orbit: 3.85, kind: 'bands', bands: 9, colors: ['#b8945a', '#ead7a4', '#d1b47a'], ring: [.36, .62], tilt: .2, spin: 1.4 },
      { name: 'Uranus', r: .18, orbit: 4.35, kind: 'smooth', colors: ['#7fc6cf', '#b6e6ea'], atmosphere: '#9fe3ea', tilt: 1.7, spin: .8 },
      { name: 'Neptune', r: .17, orbit: 4.75, kind: 'smooth', colors: ['#2a46b8', '#4f78e6', '#3a5fd0'], atmosphere: '#5b7cff', spin: .85 }
    ];

    static BELT_SIZE = .038; // asteroid point size at scale 1

    constructor() {
      this.root = new THREE.Group();
      this.root.visible = false;
      this.sun = new Sun(.6);
      this.root.add(this.sun.group);
      this.ambient = new THREE.AmbientLight(0x8a9cc8, .42); // fill light so night sides stay readable
      this.root.add(this.ambient);
      this.planets = SolarSystem.PLANETS.map((d, i) => new Planet(d, i));
      this.planets.forEach(p => { this.root.add(p.pivot); this.root.add(p.orbitLine); });
      this.belt = this.makeBelt(2.45, 2.8, innerWidth < 700 ? 900 : 1800);
      this.root.add(this.belt);
      this.fade = 0;
    }
    makeBelt(r0, r1, n) {
      const pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, r = r0 + Math.random() * (r1 - r0);
        pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = (Math.random() - .5) * .08; pos[i * 3 + 2] = Math.sin(a) * r;
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      return new THREE.Points(g, new THREE.PointsMaterial({ color: 0xc9b89c, size: SolarSystem.BELT_SIZE * .74, transparent: true, opacity: .8, depthWrite: false }));
    }
    /** scale the whole system; point sprites don't follow object scale, so the belt is resized by hand */
    setScale(k) {
      this.root.scale.setScalar(k);
      this.belt.material.size = SolarSystem.BELT_SIZE * k;
    }
    update(dt, t) {
      this.sun.update(dt, t);
      this.planets.forEach(p => p.update(dt));
      this.belt.rotation.y += dt * .04;
    }
    setFade(f) {
      this.fade = f;
      this.root.visible = f > .002;
      this.sun.setFade(f);
      this.planets.forEach(p => p.setFade(f));
      this.belt.material.opacity = .8 * f;
      this.ambient.intensity = .42 * f;
    }
  }

  Space.SolarSystem = SolarSystem;
})();
