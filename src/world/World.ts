import * as THREE from 'three/webgpu';
import { pass } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { Particles } from './Particles';
import { Prism } from './Prism';
import { makeBackdrop, makeEnvScene } from './Backdrop';
import { Layers } from './Layers';
import * as S from './shapes';

export type Tier = 'high' | 'mid' | 'low';

export interface WorldInfo {
  backend: 'WebGPU' | 'WebGL 2';
  count: number;
  tier: Tier;
}

const isMobile = () => matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 720;

/** Shape indices, matching shapes.ts order. */
export const SHAPE = { dust: 0, ribbon: 1, sphere: 2, city: 3, galaxy: 4, word: 5 } as const;

/**
 * The fixed, full-screen 3D world behind the page. One renderer, one scene:
 * aurora backdrop, the glass prism with its light beams, the GPU particles and the
 * exploded website layers. Scroll scenes only change `state`; the loop eases toward it.
 */
export class World {
  renderer!: THREE.WebGPURenderer;
  pipeline!: THREE.RenderPipeline;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  particles!: Particles;
  prism = new Prism();
  layers!: Layers;
  backdrop = makeBackdrop();
  info!: WorldInfo;
  reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** what scroll scenes ask for; the loop eases toward it */
  state = {
    prism: 1,
    prismLift: 0,
    beams: 1,
    glow: 1,
    size: 1,
    opacity: 1,
    flow: 0.35,
    spring: 2.6,
    layers: 0,
    layersProgress: 0,
    aurora: 1,
    weights: [1, 0, 0, 0, 0, 0],
  };
  private cur = { prism: 1, beams: 1, glow: 1, size: 1, opacity: 1, layers: 0, aurora: 1, prismLift: 0 };

  private view = { w: 10, h: 5.6, aspect: 1.7 };
  private pointer = { x: 0, y: 0, nx: 0, ny: 0, active: 0, last: 0 };
  private clock = new THREE.Timer();
  private fps = 60;
  private slow = 0;
  private dpr = 1;
  onFrame?: (fps: number) => void;
  private noPost = false;
  private rawDt = 1 / 60;
  private noCompute = false;

  async init(canvas: HTMLCanvasElement, opts: { forceWebGL?: boolean; count?: number; noPost?: boolean; parts?: string[] } = {}) {
    const mobile = isMobile();
    this.renderer = new THREE.WebGPURenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
      forceWebGL: opts.forceWebGL ?? false,
    });
    await this.renderer.init();
    const webgpu = (this.renderer.backend as any).isWebGPUBackend === true;
    const tier: Tier = mobile ? 'low' : webgpu ? 'high' : 'mid';
    const count = opts.count ?? (tier === 'high' ? 65536 : tier === 'mid' ? 32768 : webgpu ? 16384 : 12288);
    this.info = { backend: webgpu ? 'WebGPU' : 'WebGL 2', count, tier };

    this.dpr = Math.min(window.devicePixelRatio || 1, tier === 'high' ? 1.75 : 1.5);
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.setClearColor('#07060c', 1);

    // environment for glass and metal
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(makeEnvScene(), 0.035).texture;

    // particles
    const hues = S.makeHues(count);
    const fontAr = '800 360px Alexandria, "Segoe UI", Tahoma, sans-serif';
    const shapes = [S.dust(count), S.ribbon(count, hues), S.sphere(count), S.city(count), S.galaxy(count), S.word(count, 'طيف', fontAr, 6.6)];
    this.particles = new Particles(count, shapes, hues);

    this.layers = new Layers();

    const parts = opts.parts ?? ['backdrop', 'prism', 'particles', 'layers'];
    if (parts.includes('backdrop')) this.scene.add(this.backdrop.mesh);
    if (parts.includes('prism')) this.scene.add(this.prism.group);
    if (parts.includes('particles')) this.scene.add(this.particles.mesh);
    if (parts.includes('layers')) this.scene.add(this.layers.group);
    this.noPost = !!opts.noPost;
    this.noCompute = !parts.includes('particles');

    // post
    this.pipeline = new THREE.RenderPipeline(this.renderer);
    const scenePass = pass(this.scene, this.camera);
    const col = scenePass.getTextureNode('output');
    const bl = bloom(col, tier === 'low' ? 0.7 : 0.85, 0.55, 0.22);
    this.pipeline.outputNode = col.add(bl);

    this.camera.position.set(0, 0, 10);
    this.resize();
    addEventListener('resize', () => this.resize());
    addEventListener('pointermove', (e) => this.onPointer(e.clientX, e.clientY), { passive: true });
    addEventListener('touchmove', (e) => e.touches[0] && this.onPointer(e.touches[0].clientX, e.touches[0].clientY), { passive: true });

    // run one compute + render so shaders are compiled before the preloader leaves
    if (!this.noCompute) this.renderer.compute(this.particles.compute);
    this.frame(0.016, 0);
    return this.info;
  }

  start() {
    this.clock.reset();
    this.renderer.setAnimationLoop(() => {
      this.clock.update();
      const raw = Math.max(this.clock.getDelta(), 1e-4);
      this.rawDt = raw;
      this.frame(Math.min(raw, 1 / 30), this.clock.getElapsed(), Math.min(raw, 0.1));
    });
  }

  private onPointer(x: number, y: number) {
    this.pointer.nx = (x / innerWidth) * 2 - 1;
    this.pointer.ny = -((y / innerHeight) * 2 - 1);
    this.pointer.last = performance.now();
  }

  resize() {
    const w = innerWidth;
    const h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const vh = 2 * this.camera.position.z * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    this.view = { w: vh * this.camera.aspect, h: vh, aspect: this.camera.aspect };
    const bd = this.backdrop.mesh;
    const z = -14;
    const scaleAt = (10 - z) / 10;
    bd.position.set(0, 0, z);
    bd.scale.set(this.view.w * scaleAt * 1.15, this.view.h * scaleAt * 1.15, 1);
    this.layout();
  }

  /** Where each shape sits for the current screen shape. */
  private layout() {
    const { w, h, aspect } = this.view;
    const P = this.particles;
    const portrait = aspect < 0.9;
    const side = portrait ? new THREE.Vector3(0, h * 0.12, 0) : new THREE.Vector3(-w * 0.21, -0.05, 0);
    const sideScale = portrait ? Math.min(0.52, (w * 0.7) / 6) : Math.min(1.05, w / 10.5);
    const set = (k: number, o: THREE.Vector3, s: number) => {
      P.offsets[k].value.copy(o);
      P.scales[k].value = s;
    };
    set(SHAPE.dust, new THREE.Vector3(0, 0, 0), Math.max(1, w / 14));
    set(SHAPE.ribbon, new THREE.Vector3(0, portrait ? h * 0.12 : 0, 0), portrait ? w / 11 : w / 13.5);
    set(SHAPE.sphere, side, sideScale);
    set(SHAPE.city, side.clone().add(new THREE.Vector3(0, -0.05, 0)), sideScale);
    set(SHAPE.galaxy, side, sideScale);
    set(SHAPE.word, new THREE.Vector3(0, portrait ? h * 0.24 : h * 0.23, 0), portrait ? Math.min(0.6, w / 8.5) : Math.min(0.82, w / 12));
    this.layers.layout(w, h, portrait);
  }

  /**
   * Fit a shape into a DOM box (screen rect), so 3D always lands in the space the layout leaves for it.
   * `native` is the shape's size in world units at scale 1.
   */
  anchorShape(k: number, r: DOMRect, native: { w: number; h: number }, fill = 0.9) {
    const { w, h } = this.view;
    const perPx = w / innerWidth;
    const cx = (r.left + r.width / 2) / innerWidth - 0.5;
    const cy = 0.5 - (r.top + r.height / 2) / innerHeight;
    this.particles.offsets[k].value.set(cx * w, cy * h, 0);
    this.particles.scales[k].value = Math.max(0.05, Math.min((r.width * perPx * fill) / native.w, (r.height * perPx * fill) / native.h));
  }

  /** Same idea for the exploded website layers. */
  anchorLayers(r: DOMRect, fill = 0.9) {
    const { w, h } = this.view;
    const perPx = w / innerWidth;
    const cx = (r.left + r.width / 2) / innerWidth - 0.5;
    const cy = 0.5 - (r.top + r.height / 2) / innerHeight;
    const s = Math.max(0.1, Math.min((r.width * perPx * fill) / 4.8, (r.height * perPx * fill) / 3.6));
    this.layers.anchor(cx * w, cy * h, s);
  }

  /** Jump to the requested state and let the particles settle (used for previews and tests). */
  settle(steps = 160) {
    const st = this.state as any;
    for (const key of Object.keys(this.cur)) (this.cur as any)[key] = st[key];
    const u = this.particles.u;
    this.particles.setWeights(st.weights);
    u.dt.value = 1 / 30;
    u.damping.value = 0.9;
    u.spring.value = st.spring;
    u.flow.value = this.reduced ? 0 : st.flow;
    for (let i = 0; i < steps; i++) this.renderer.compute(this.particles.compute);
  }

  private frame(dt: number, time: number, ease = dt) {
    const st = this.state;
    const c = this.cur;
    const k = 1 - Math.exp(-ease * 3);
    for (const key of ['prism', 'beams', 'glow', 'size', 'opacity', 'layers', 'aurora', 'prismLift'] as const) {
      c[key] += ((st as any)[key] - c[key]) * k;
    }
    const P = this.particles;
    const u = P.u;
    P.setWeights(st.weights);

    // pointer: active while it moves, fades after
    const idle = performance.now() - this.pointer.last;
    const want = idle < 1200 && !this.reduced ? 1 : 0;
    this.pointer.active += (want - this.pointer.active) * (1 - Math.exp(-dt * 4));
    this.pointer.x += (this.pointer.nx - this.pointer.x) * (1 - Math.exp(-dt * 8));
    this.pointer.y += (this.pointer.ny - this.pointer.y) * (1 - Math.exp(-dt * 8));
    u.pointer.value.set((this.pointer.x * this.view.w) / 2, (this.pointer.y * this.view.h) / 2, 0);
    u.pointerStrength.value = this.pointer.active;

    u.dt.value = dt;
    u.time.value = time;
    u.flow.value = this.reduced ? 0 : st.flow;
    u.spring.value = st.spring;
    u.damping.value = Math.pow(0.9, dt * 60);
    u.glow.value = c.glow;
    u.size.value = 0.075 * c.size * (this.info.tier === 'low' ? 1.25 : 1);
    u.opacity.value = c.opacity;
    if (!this.reduced) {
      u.spinSphere.value += dt * 0.22;
      u.spinGalaxy.value += dt * 0.32;
    }

    // prism layout
    const { w, h, aspect } = this.view;
    const portrait = aspect < 0.9;
    const pr = this.prism;
    const ps = (portrait ? Math.min(0.72, (w * 0.7) / 2.6) : Math.min(1.08, w / 9.5)) * (0.65 + 0.35 * c.prism);
    pr.group.scale.setScalar(ps);
    pr.group.position.set(portrait ? 0 : -w * 0.2, (portrait ? h * 0.2 : 0.05) + (c.prismLift + (1 - c.prism) * 0.9) * h * 0.7, 0);
    pr.group.visible = c.prism > 0.01;
    pr.u.intensity.value = c.beams * c.prism;
    pr.spread = 0;
    pr.update(time, dt, { x: this.pointer.x, y: this.pointer.y }, this.view, this.reduced);
    u.beamI.value = c.beams * c.prism;
    u.inA.value.copy(pr.inA);
    u.inB.value.copy(pr.inB);
    pr.outO.forEach((v, i) => u.outO[i].value.copy(v));
    pr.outE.forEach((v, i) => u.outE[i].value.copy(v));

    this.layers.update(c.layers, st.layersProgress, time, this.pointer);
    this.backdrop.u.time.value = time;
    this.backdrop.u.aurora.value = c.aurora;

    if (!this.noCompute) this.renderer.compute(P.compute);
    if (this.noPost) this.renderer.render(this.scene, this.camera);
    else this.pipeline.render();

    // fps + adaptive resolution
    this.fps += (1 / this.rawDt - this.fps) * 0.05;
    if (this.fps < 38) this.slow += dt;
    else this.slow = Math.max(0, this.slow - dt);
    if (this.slow > 2.5 && this.dpr > 0.85) {
      this.dpr = Math.max(0.75, this.dpr - 0.25);
      this.renderer.setPixelRatio(this.dpr);
      this.resize();
      this.slow = 0;
    }
    this.onFrame?.(this.fps);
  }
}
