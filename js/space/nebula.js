/*
 * Nebula: fragment-shader clouds over the hero. DISABLED FOR NOW (this file is not loaded).
 *
 * To bring it back:
 *   1. uncomment <canvas id="nebula"> in index.html
 *   2. add <script src="js/space/nebula.js"></script> after starfield.js
 *   3. in main.js: new Space.Nebula(document.getElementById('nebula'), { starfield, pointer, reduce });
 */
(() => {
  'use strict';

  const FRAG = `precision highp float;
    uniform float t, w; uniform vec2 res, m;
    float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
    float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
      return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
    float fbm(vec2 p){ float v = 0., a = .5; mat2 r = mat2(.8,.6,-.6,.8); for(int i=0;i<5;i++){ v += a*n(p); p = r*p*2.02 + 3.1; a *= .5; } return v; }
    void main(){
      vec2 uv = (gl_FragCoord.xy - .5*res)/res.y; uv += m*.06; uv.y -= .2;
      float T = t*(1. + w*6.);
      vec2 q = vec2(fbm(uv*1.7 + T*.020), fbm(uv*1.7 + vec2(5.2,1.3) - T*.016));
      vec2 r = vec2(fbm(uv*1.7 + 3.5*q + vec2(1.7,9.2) + T*.03), fbm(uv*1.7 + 3.5*q + vec2(8.3,2.8)));
      float f = fbm(uv*1.7 + 3.5*r);
      vec3 col = mix(vec3(.03,.06,.22), vec3(.22,.4,1.), clamp(f*f*2.2, 0., 1.));
      col = mix(col, vec3(1.,.36,.62), clamp(length(q) - .45, 0., 1.)*.9);
      col = mix(col, vec3(1.,.74,.52), clamp(r.x*r.x*1.4 - .25, 0., 1.)*.8);
      vec2 e = uv*vec2(.6,1.25);
      float shape = exp(-dot(e, e)*2.1);
      float lane = smoothstep(.3, .65, fbm(uv*3.2 + r*1.5 - T*.01));
      float a = smoothstep(.36, .95, f*1.25 + .08)*shape*mix(.3, 1., lane);
      col += pow(f, 5.)*vec3(1.,.85,.95)*2.2*shape*lane;
      float st = step(.997, h(floor(gl_FragCoord.xy)))*shape*(.5 + .5*sin(t*2. + h(floor(gl_FragCoord.xy*.7))*40.));
      a = clamp(a*(1. + w*.6), 0., 1.);
      gl_FragColor = vec4(col*a*1.25 + st, a + st);
    }`;

  class Nebula {
    constructor(canvas, { starfield, pointer, reduce = false }) {
      Object.assign(this, { canvas, starfield, pointer, reduce });
      this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false });
      this.renderer.setPixelRatio(Math.min(1, devicePixelRatio) * .7);
      this.scene = new THREE.Scene();
      this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      this.u = { t: { value: 20 }, res: { value: new THREE.Vector2(1, 1) }, m: { value: new THREE.Vector2(0, 0) }, w: { value: 0 } };
      this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
        uniforms: this.u, transparent: true,
        vertexShader: `void main(){ gl_Position = vec4(position.xy, 0., 1.); }`,
        fragmentShader: FRAG
      })));
      this.resize();
      addEventListener('resize', () => this.resize());
      this.visible = true;
      new IntersectionObserver(es => (this.visible = es[0].isIntersecting)).observe(canvas);
      if (reduce) this.render();
      else { this.loop = this.loop.bind(this); requestAnimationFrame(this.loop); }
    }

    render() { this.renderer.render(this.scene, this.camera); }

    resize() {
      const r = this.canvas.getBoundingClientRect();
      this.renderer.setSize(r.width, r.height, false);
      this.renderer.getDrawingBufferSize(this.u.res.value);
      if (this.reduce) this.render();
    }

    loop() {
      requestAnimationFrame(this.loop);
      if (!this.visible) return;
      const u = this.u, p = this.pointer;
      u.t.value += .016;
      u.m.value.x += (p.x - u.m.value.x) * .04;
      u.m.value.y += (-p.y - u.m.value.y) * .04;
      u.w.value += ((this.starfield.warping ? 1 : 0) - u.w.value) * .05;
      this.render();
    }
  }

  Space.Nebula = Nebula;
})();
