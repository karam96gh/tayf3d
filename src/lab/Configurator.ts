import * as THREE from 'three/webgpu';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { pass, color, uv, float, smoothstep, mx_fractal_noise_float, vec3, uniform, mix, exp, positionLocal, atan, sin, materialAttenuationColor, positionWorld, normalView, positionViewDirection } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { makeStudioEnv } from '../world/Backdrop';
import { spectrum } from '../world/palette';

export const LIQUIDS = [
  { id: 'rose', name: 'وردي', hex: '#FF4FA3' },
  { id: 'violet', name: 'بنفسجي', hex: '#9B4DFF' },
  { id: 'indigo', name: 'نيلي', hex: '#4F49FF' },
  { id: 'sky', name: 'أزرق', hex: '#2E8EFF' },
  { id: 'aqua', name: 'فيروزي', hex: '#33E1EE' },
  { id: 'amber', name: 'عنبري', hex: '#FFA51F' },
] as const;

export const FINISHES = {
  gold: { name: 'ذهبي', color: '#E5BF73', metalness: 1, roughness: 0.2, iridescence: 0 },
  chrome: { name: 'كروم', color: '#F1F3F8', metalness: 1, roughness: 0.05, iridescence: 0 },
  black: { name: 'أسود مطفي', color: '#16131D', metalness: 0.35, roughness: 0.58, iridescence: 0 },
  prism: { name: 'طيفي', color: '#2A2A36', metalness: 1, roughness: 0.16, iridescence: 1 },
} as const;
export type FinishId = keyof typeof FINISHES;

/**
 * Live product configurator: a faceted glass perfume bottle (transmission + dispersion),
 * liquid you can recolour and refill, and a cap in four finishes. Drag to turn it.
 */
export class Configurator {
  renderer!: THREE.WebGPURenderer;
  pipeline!: THREE.RenderPipeline;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
  bottle = new THREE.Group();
  private glassMat!: THREE.MeshPhysicalNodeMaterial;
  private liquidMat!: THREE.MeshPhysicalNodeMaterial;
  private capMat!: THREE.MeshPhysicalNodeMaterial;
  private liquid!: THREE.Mesh;
  private ringU = { time: uniform(0) };
  private target = {
    liquid: new THREE.Color(LIQUIDS[0].hex),
    fill: 0.72,
    cap: { ...FINISHES.gold, color: new THREE.Color(FINISHES.gold.color) },
  };
  private fill = 0.72;
  private yaw = -0.5;
  private yawVel = 0;
  private dragging = false;
  private lastX = 0;
  private lastInteract = 0;
  private clock = new THREE.Timer();
  private running = false;
  private host: HTMLElement;
  private canvas: HTMLCanvasElement;
  auto = true;
  reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor(host: HTMLElement, canvas: HTMLCanvasElement) {
    this.host = host;
    this.canvas = canvas;
  }

  async init() {
    this.renderer = new THREE.WebGPURenderer({ canvas: this.canvas, antialias: true, alpha: false });
    await this.renderer.init();
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.setClearColor('#0b0914', 1);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(makeStudioEnv(), 0.015).texture;

    this.buildBackdrop();
    this.buildPedestal();
    this.buildBottle();

    this.camera.position.set(0, 1.7, 7.4);
    this.camera.lookAt(0, 1.0, 0);

    this.pipeline = new THREE.RenderPipeline(this.renderer);
    const sp = pass(this.scene, this.camera);
    const col = sp.getTextureNode('output');
    this.pipeline.outputNode = col.add(bloom(col, 0.32, 0.4, 0.55));

    this.resize();
    new ResizeObserver(() => this.resize()).observe(this.host);
    this.bindPointer();
    this.frame(0.016, 0);
    new IntersectionObserver(([e]) => (e.isIntersecting ? this.start() : this.stop()), { rootMargin: '120px' }).observe(this.host);
  }

  private buildBackdrop() {
    const m = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false });
    const p = uv();
    const t = this.ringU.time.mul(0.05);
    const n = mx_fractal_noise_float(vec3(p.x.mul(6).add(t), p.y.mul(3), t), 3, 2, 0.5);
    const glow = exp(p.y.sub(0.52).mul(p.y.sub(0.52)).mul(-60));
    const hue = p.x.mul(2).fract();
    // studio backlight right behind the bottle: what the liquid glows with when it refracts
    const pw = positionWorld;
    const spot = exp(pw.x.mul(pw.x).div(5).add(pw.y.add(1.0).mul(pw.y.add(1.0)).div(16)).negate()).mul(smoothstep(4.0, -8.0, pw.z));
    m.colorNode = mix(color('#06050b'), color('#130f24'), smoothstep(0.2, 0.55, p.y))
      .add(spectrum(hue).mul(glow).mul(n.mul(0.5).add(0.5)).mul(0.22))
      .add(color('#cfc6ff').mul(spot).mul(0.42));
    const sky = new THREE.Mesh(new THREE.SphereGeometry(18, 48, 24), m);
    sky.position.y = 1;
    this.scene.add(sky);
  }

  private buildPedestal() {
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(1.3, 1.42, 0.26, 96),
      new THREE.MeshPhysicalNodeMaterial({ color: '#0d0b14', roughness: 0.42, metalness: 0.1, clearcoat: 0.5, clearcoatRoughness: 0.2 }),
    );
    base.position.y = -0.13;
    this.scene.add(base);

    // animated spectrum light ring around the pedestal
    const rm = new THREE.MeshBasicNodeMaterial();
    const ang = atan(positionLocal.z, positionLocal.x).div(Math.PI * 2).add(0.5);
    rm.colorNode = spectrum(ang.add(this.ringU.time.mul(0.05)).fract()).mul(sin(ang.mul(Math.PI * 6).add(this.ringU.time)).mul(0.25).add(1.6));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.36, 0.018, 12, 160), rm);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.005;
    this.scene.add(ring);

    // soft contact shadow under the bottle
    const sm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
    const r = uv().sub(0.5).length().mul(2);
    sm.colorNode = color('#000000');
    sm.opacityNode = float(1).sub(smoothstep(0.0, 1.0, r)).pow(2).mul(0.75);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.9), sm);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.006;
    this.scene.add(shadow);
  }

  private buildBottle() {
    const SEG = 8;
    const facet = Math.PI / SEG;
    const v = (x: number, y: number) => new THREE.Vector2(x, y);
    const glassProfile = [v(0, 0), v(0.5, 0), v(0.6, 0.06), v(0.62, 0.16), v(0.62, 1.16), v(0.58, 1.27), v(0.38, 1.4), v(0.24, 1.46), v(0.24, 1.62)];
    const glassGeo = new THREE.LatheGeometry(glassProfile, SEG, facet);
    // clear glass shell: pure reflections added on top (fresnel, strip lights, a hint of iridescence)
    this.glassMat = new THREE.MeshPhysicalNodeMaterial({
      color: '#000000',
      metalness: 0,
      roughness: 0.02,
      clearcoat: 1,
      clearcoatRoughness: 0.02,
      specularIntensity: 1,
      iridescence: 0.25,
      iridescenceIOR: 1.4,
      envMapIntensity: 1.5,
      flatShading: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const glass = new THREE.Mesh(glassGeo, this.glassMat);
    glass.renderOrder = 5;

    // thick glass base: real transmission with dispersion (splits the ring light into colours)
    const baseProfile = [v(0, 0), v(0.5, 0), v(0.6, 0.06), v(0.615, 0.12), v(0, 0.12)];
    const baseMat = new THREE.MeshPhysicalNodeMaterial({
      color: '#ffffff', roughness: 0.01, metalness: 0, transmission: 1, thickness: 0.4, ior: 1.52, dispersion: 6,
      specularIntensity: 1, envMapIntensity: 1.5, flatShading: true,
    });
    const base = new THREE.Mesh(new THREE.LatheGeometry(baseProfile, SEG, facet), baseMat);
    base.renderOrder = 1;

    // the perfume itself: tinted, refracting liquid
    const liquidProfile = [v(0, 0), v(0.53, 0), v(0.56, 0.03), v(0.56, 1), v(0, 1)];
    const liquidGeo = new THREE.LatheGeometry(liquidProfile, SEG, facet);
    this.liquidMat = new THREE.MeshPhysicalNodeMaterial({
      color: '#ffffff',
      roughness: 0.04,
      metalness: 0,
      transmission: 1,
      thickness: 1.1,
      ior: 1.36,
      dispersion: 3,
      attenuationColor: this.target.liquid,
      attenuationDistance: 0.26,
      specularIntensity: 0.7,
      envMapIntensity: 1,
      flatShading: true,
    });
    // a little self-glow so dark colours still read on a dark page
    this.liquidMat.emissiveNode = materialAttenuationColor.mul(normalView.dot(positionViewDirection).abs().pow(1.5).mul(0.42).add(0.08));
    this.liquid = new THREE.Mesh(liquidGeo, this.liquidMat);
    this.liquid.position.y = 0.12;
    this.liquid.renderOrder = 2;

    this.capMat = new THREE.MeshPhysicalNodeMaterial({
      color: this.target.cap.color,
      metalness: 1,
      roughness: 0.2,
      clearcoat: 0.6,
      iridescenceIOR: 1.85,
      iridescenceThicknessRange: [250, 900],
    });
    const cap = new THREE.Mesh(new RoundedBoxGeometry(0.72, 0.56, 0.72, 5, 0.08), this.capMat);
    cap.position.y = 1.62 + 0.28;
    cap.rotation.y = Math.PI / 4;
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.07, 48), this.capMat);
    collar.position.y = 1.62;

    // etched label on the front facet
    const lc = document.createElement('canvas');
    lc.width = 512;
    lc.height = 512;
    const g = lc.getContext('2d')!;
    g.fillStyle = 'rgba(255,255,255,0.92)';
    g.textAlign = 'center';
    g.font = '600 74px Unbounded, sans-serif';
    g.fillText('TAYF', 256, 230);
    g.font = '400 40px Alexandria, sans-serif';
    g.direction = 'rtl';
    g.fillText('عطر طيف · 50 مل', 256, 310);
    g.fillRect(176, 258, 160, 3);
    const lt = new THREE.CanvasTexture(lc);
    lt.colorSpace = THREE.SRGBColorSpace;
    const lm = new THREE.MeshBasicNodeMaterial({ map: lt, transparent: true, depthWrite: false });
    lm.opacity = 0.85;
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), lm);
    const front = 0.62 * Math.cos(facet) + 0.004;
    label.position.set(0, 0.68, front);
    label.renderOrder = 3;

    this.bottle.add(base, this.liquid, glass, label, cap, collar);
    this.scene.add(this.bottle);
  }

  setLiquid(hex: string) {
    this.target.liquid.set(hex);
    this.poke();
  }
  setFill(v: number) {
    this.target.fill = THREE.MathUtils.clamp(v, 0.15, 0.98);
    this.poke();
  }
  setFinish(id: FinishId) {
    const f = FINISHES[id];
    this.target.cap = { ...f, color: new THREE.Color(f.color) } as any;
    this.poke();
  }
  /** jump straight to the target look (no easing), e.g. for the first frame */
  snap() {
    this.liquidMat.attenuationColor.copy(this.target.liquid);
    this.fill = this.target.fill;
    const c = this.target.cap;
    this.capMat.color.copy(c.color);
    this.capMat.metalness = c.metalness;
    this.capMat.roughness = c.roughness;
    this.capMat.iridescence = c.iridescence;
  }
  private poke() {
    this.lastInteract = performance.now();
    if (!this.running) this.frame(0.016, this.clock.getElapsed());
  }

  private bindPointer() {
    const el = this.canvas;
    el.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      this.lastX = e.clientX;
      el.setPointerCapture(e.pointerId);
      this.lastInteract = performance.now();
    });
    el.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.lastX;
      this.lastX = e.clientX;
      this.yawVel = dx * 0.0085;
      this.yaw += this.yawVel;
      this.lastInteract = performance.now();
    });
    const up = () => (this.dragging = false);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') this.yawVel = -0.06;
      else if (e.key === 'ArrowRight') this.yawVel = 0.06;
      else return;
      e.preventDefault();
      this.lastInteract = performance.now();
    });
  }

  resize() {
    const r = this.host.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // keep the whole bottle in frame on narrow screens
    this.camera.position.z = w / h < 0.9 ? 9.4 : 7.4;
    this.camera.lookAt(0, 1.0, 0);
    this.camera.updateProjectionMatrix();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.clock.reset();
    this.renderer.setAnimationLoop(() => {
      this.clock.update();
      const dt = Math.min(Math.max(this.clock.getDelta(), 0), 1 / 30);
      this.frame(dt, this.clock.getElapsed());
    });
  }
  stop() {
    this.running = false;
    this.renderer?.setAnimationLoop(null);
  }

  private frame(dt: number, time: number) {
    this.ringU.time.value = time;
    const k = 1 - Math.exp(-dt * 6);
    // liquid colour and level
    this.liquidMat.attenuationColor.lerp(this.target.liquid, k);
    this.fill += (this.target.fill - this.fill) * k;
    this.liquid.scale.y = this.fill * 1.04;
    // cap finish
    const c = this.target.cap;
    this.capMat.color.lerp(c.color, k);
    this.capMat.metalness += (c.metalness - this.capMat.metalness) * k;
    this.capMat.roughness += (c.roughness - this.capMat.roughness) * k;
    this.capMat.iridescence += (c.iridescence - this.capMat.iridescence) * k;
    // rotation: drag inertia, then a slow idle turn
    const idle = performance.now() - this.lastInteract > 2500;
    if (!this.dragging) {
      this.yawVel *= Math.pow(0.92, dt * 60);
      const autoV = this.auto && idle && !this.reduced ? 0.28 * dt : 0;
      this.yaw += this.yawVel + autoV;
    }
    this.bottle.rotation.y = this.yaw;
    this.bottle.position.y = this.reduced ? 0.02 : 0.02 + Math.sin(time * 1.2) * 0.025;
    this.pipeline.render();
  }
}
