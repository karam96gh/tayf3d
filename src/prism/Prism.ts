import { FRAG, VERT } from './shader';

/** Where the glass should be and what shape it should take. Positions are in screen NDC (-1..1). */
export interface PrismTarget {
  x: number;
  y: number;
  zoom: number;
  spread: number;
  twist: number;
  fade: number;
  floor: number;
  pitch: number;
}

const KEYS = ['x', 'y', 'zoom', 'spread', 'twist', 'fade', 'floor', 'pitch'] as const;
const CAM = [0, 0.55, 5.2];

/**
 * Tiny WebGL 2 renderer for the glass Tayf mark. No engine: one full-screen triangle and one shader,
 * so it loads instantly. Resolution adapts to the device so it stays smooth.
 */
export class Prism {
  readonly canvas: HTMLCanvasElement;
  private gl!: WebGL2RenderingContext;
  private prog!: WebGLProgram;
  private u: Record<string, WebGLUniformLocation | null> = {};
  private raf = 0;
  private last = 0;
  private time = 0;
  private scale = 1;
  private frameAcc = 0;
  private frameN = 0;
  private sinceCheck = 0;
  private ready = false;

  target: PrismTarget = { x: -0.45, y: 0, zoom: 0.8, spread: 0, twist: 1, fade: 1, floor: 1, pitch: 0.5 };
  private cur: PrismTarget = { x: -0.45, y: 0.3, zoom: 0.55, spread: 0.6, twist: 2.2, fade: 0, floor: 0, pitch: 0.5 };

  /** focused plate (0..4) or -1, e.g. while a service row is hovered */
  focus = -1;
  private focusAmt = [0, 0, 0, 0, 0];

  private yaw = Math.PI / 4 - 0.35;
  private yawVel = 0;
  private pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  private dragging = false;
  private lastX = 0;
  readonly reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  onFirstFrame?: () => void;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  /** returns false if WebGL 2 is not available */
  init(): boolean {
    const gl = this.canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    if (!gl) return false;
    this.gl = gl;
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
      return s;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'link');
    this.prog = p;
    gl.useProgram(p);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    for (const n of ['uRes', 'uTime', 'uInv', 'uObj', 'uZoom', 'uFade', 'uPlate', 'uY', 'uX', 'uGlow', 'uBound', 'uCam', 'uFloor', 'uSteps', 'uUp']) {
      this.u[n] = gl.getUniformLocation(p, n);
    }
    gl.uniform3f(this.u.uCam, CAM[0], CAM[1], CAM[2]);

    const coarse = matchMedia('(pointer: coarse)').matches;
    this.scale = coarse ? 0.7 : 1;

    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      cancelAnimationFrame(this.raf);
      document.documentElement.classList.add('no-3d');
    });

    this.resize();
    addEventListener('resize', () => this.resize());
    addEventListener('pointermove', (e) => {
      this.pointer.tx = (e.clientX / innerWidth) * 2 - 1;
      this.pointer.ty = -((e.clientY / innerHeight) * 2 - 1);
      if (this.dragging) {
        const dx = e.clientX - this.lastX;
        this.lastX = e.clientX;
        this.yawVel = dx * 0.006;
        this.yaw += this.yawVel;
      }
    }, { passive: true });
    addEventListener('pointerup', () => (this.dragging = false));
    addEventListener('pointercancel', () => (this.dragging = false));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) cancelAnimationFrame(this.raf);
      else this.start();
    });
    return true;
  }

  /** let an element (e.g. the hero) spin the glass when dragged */
  dragOn(el: HTMLElement) {
    el.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('a,button,input')) return;
      this.dragging = true;
      this.lastX = e.clientX;
    });
  }

  private resize() {
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    const w = Math.max(1, Math.round(innerWidth * dpr * this.scale));
    const h = Math.max(1, Math.round(innerHeight * dpr * this.scale));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.gl.viewport(0, 0, w, h);
    this.gl.uniform2f(this.u.uRes, w, h);
  }

  start() {
    cancelAnimationFrame(this.raf);
    this.last = performance.now();
    const loop = (now: number) => {
      const raw = Math.min(0.1, Math.max(0.001, (now - this.last) / 1000));
      this.last = now;
      this.frame(raw);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  /** NDC point on screen → world point on the z = 0 plane */
  private toWorld(nx: number, ny: number) {
    const aspect = innerWidth / innerHeight;
    const ux = nx * aspect * 0.5;
    const uy = ny * 0.5;
    const len = Math.hypot(CAM[0], CAM[1], CAM[2]);
    const fw = [-CAM[0] / len, -CAM[1] / len, -CAM[2] / len];
    let rt = [fw[1] * 0 - fw[2] * 1, fw[2] * 0 - fw[0] * 0, fw[0] * 1 - fw[1] * 0];
    const rl = Math.hypot(rt[0], rt[1], rt[2]);
    rt = rt.map((v) => v / rl);
    const up = [rt[1] * fw[2] - rt[2] * fw[1], rt[2] * fw[0] - rt[0] * fw[2], rt[0] * fw[1] - rt[1] * fw[0]];
    const rd = [0, 1, 2].map((i) => fw[i] * 1.75 + rt[i] * ux + up[i] * uy);
    const t = -CAM[2] / rd[2];
    return [CAM[0] + rd[0] * t, CAM[1] + rd[1] * t, 0];
  }

  private frame(dt: number) {
    const gl = this.gl;
    const c = this.cur;
    const t = this.target;
    const k = 1 - Math.exp(-dt * (this.reduced ? 6 : 2.6));
    for (const key of KEYS) c[key] += (t[key] - c[key]) * k;

    if (!this.reduced) this.time += dt;
    const p = this.pointer;
    p.x += (p.tx - p.x) * (1 - Math.exp(-dt * 4));
    p.y += (p.ty - p.y) * (1 - Math.exp(-dt * 4));
    if (!this.dragging) {
      this.yawVel *= Math.pow(0.9, dt * 60);
      this.yaw += this.yawVel + (this.reduced ? 0 : dt * 0.14);
    }
    const yaw = this.yaw + p.x * 0.35;
    const pitch = c.pitch + p.y * 0.12;

    // world -> object rotation = (Rx(pitch) * Ry(yaw))^T, column-major for GLSL
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    // R = Rx * Ry
    const R = [
      [cy, 0, sy],
      [sp * sy, cp, -sp * cy],
      [-cp * sy, sp, cp * cy],
    ];
    // inverse = transpose; GLSL column-major: column j = row j of R^T = column j of R... pass R rows as columns
    const inv = new Float32Array([R[0][0], R[0][1], R[0][2], R[1][0], R[1][1], R[1][2], R[2][0], R[2][1], R[2][2]]);

    // plates: twist like the logo, breathe, and part when the page asks
    const gap = 0.15 + c.spread * 0.42;
    const plates = new Float32Array(10);
    const ys = new Float32Array(5);
    const xs = new Float32Array(5);
    const glow = new Float32Array(5);
    let maxY = 0;
    let maxX = 0;
    for (let i = 0; i < 5; i++) {
      const f = this.focus === i ? 1 : 0;
      this.focusAmt[i] += (f - this.focusAmt[i]) * (1 - Math.exp(-dt * 6));
      const a = ((i * 11 - 22) * Math.PI) / 180 * c.twist + Math.sin(this.time * 0.6 + i * 0.9) * 0.025 * (1 + c.spread * 2);
      plates[i * 2] = Math.cos(a);
      plates[i * 2 + 1] = Math.sin(a);
      ys[i] = (i - 2) * gap + Math.sin(this.time * 1.1 + i * 0.8) * 0.012;
      xs[i] = this.focusAmt[i] * 0.35;
      glow[i] = this.focusAmt[i];
      maxY = Math.max(maxY, Math.abs(ys[i]));
      maxX = Math.max(maxX, Math.abs(xs[i]));
    }
    const bound = Math.hypot(0.89, maxY + 0.05) + maxX + 0.02;
    const w = this.toWorld(c.x, c.y);

    gl.uniform1f(this.u.uTime, this.time);
    gl.uniformMatrix3fv(this.u.uInv, false, inv);
    gl.uniform3f(this.u.uUp, R[0][1], R[1][1], R[2][1]);
    gl.uniform3f(this.u.uObj, w[0], w[1], w[2]);
    gl.uniform1f(this.u.uZoom, c.zoom);
    gl.uniform1f(this.u.uFade, Math.max(0, Math.min(1, c.fade)));
    gl.uniform2fv(this.u.uPlate, plates);
    gl.uniform1fv(this.u.uY, ys);
    gl.uniform1fv(this.u.uX, xs);
    gl.uniform1fv(this.u.uGlow, glow);
    gl.uniform1f(this.u.uBound, bound);
    gl.uniform1f(this.u.uFloor, c.floor);
    gl.uniform1f(this.u.uSteps, this.scale);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    if (!this.ready) {
      this.ready = true;
      requestAnimationFrame(() => this.onFirstFrame?.());
    }
    this.adapt(dt);
  }

  /** keep it smooth: lower the resolution on slow devices, raise it back when there is headroom */
  private adapt(dt: number) {
    this.frameAcc += dt;
    this.frameN++;
    this.sinceCheck += dt;
    if (this.sinceCheck < 1.2) return;
    const avg = this.frameAcc / this.frameN;
    this.frameAcc = 0;
    this.frameN = 0;
    this.sinceCheck = 0;
    const before = this.scale;
    if (avg > 1 / 45 && this.scale > 0.5) this.scale = Math.max(0.5, this.scale - 0.12);
    else if (avg < 1 / 58 && this.scale < 1) this.scale = Math.min(1, this.scale + 0.06);
    if (this.scale !== before) this.resize();
  }

  /** render one frame immediately (used for previews and posters) */
  renderNow() {
    for (const key of KEYS) this.cur[key] = this.target[key];
    this.frame(0.016);
  }
}
