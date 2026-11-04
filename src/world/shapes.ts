/**
 * Particle target shapes. Every shape returns N points packed as vec4 (x, y, z, w).
 * w carries a per-point brightness hint (1 = normal) the shader can use.
 * All shapes are centred on the origin; layout offsets/scales are applied on the GPU.
 */

export const SHAPES = ['dust', 'ribbon', 'sphere', 'city', 'galaxy', 'word'] as const;
export type ShapeName = (typeof SHAPES)[number];

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(r: () => number) {
  let u = 0;
  let v = 0;
  while (u === 0) u = r();
  while (v === 0) v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function rotX(p: number[], a: number) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const y = p[1] * c - p[2] * s;
  const z = p[1] * s + p[2] * c;
  p[1] = y;
  p[2] = z;
}
function rotY(p: number[], a: number) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const x = p[0] * c + p[2] * s;
  const z = -p[0] * s + p[2] * c;
  p[0] = x;
  p[2] = z;
}
function rotZ(p: number[], a: number) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const x = p[0] * c - p[1] * s;
  const y = p[0] * s + p[1] * c;
  p[0] = x;
  p[1] = y;
}

/** One random hue per particle, 0..1 across the five spectrum colours. */
export function makeHues(n: number) {
  const r = rng(7);
  const h = new Float32Array(n);
  for (let i = 0; i < n; i++) h[i] = r();
  return h;
}

export function dust(n: number) {
  const r = rng(11);
  const out = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    out[i * 4] = (r() - 0.5) * 15;
    out[i * 4 + 1] = (r() - 0.5) * 8.6;
    out[i * 4 + 2] = -4.5 + r() * 6.5;
    out[i * 4 + 3] = 0.35 + r() * 0.65;
  }
  return out;
}

/** A twisting band where x follows the particle's hue, so the band reads as a spectrum. */
export function ribbon(n: number, hues: Float32Array) {
  const r = rng(23);
  const out = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const x = -6.6 + hues[i] * 13.2;
    const v = r() - 0.5;
    const w = 1.05 + 0.35 * Math.sin(x * 0.7);
    const tw = x * 0.42;
    const y = Math.sin(x * 0.52) * 0.85 + v * w * Math.cos(tw);
    const z = Math.cos(x * 0.4) * 0.8 + v * w * Math.sin(tw) - 0.6;
    out[i * 4] = x + gauss(r) * 0.03;
    out[i * 4 + 1] = y + gauss(r) * 0.035;
    out[i * 4 + 2] = z + gauss(r) * 0.035;
    out[i * 4 + 3] = 0.8 + r() * 0.4;
  }
  return out;
}

/** Personal sites: a single planet with its own orbit. */
export function sphere(n: number) {
  const r = rng(31);
  const out = new Float32Array(n * 4);
  const shell = Math.floor(n * 0.7);
  const golden = Math.PI * (3 - Math.sqrt(5));
  const p = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    if (i < shell) {
      const y = 1 - (i / (shell - 1)) * 2;
      const rad = Math.sqrt(1 - y * y);
      const th = golden * i;
      const R = 1.72 + gauss(r) * 0.025;
      p[0] = Math.cos(th) * rad * R;
      p[1] = y * R;
      p[2] = Math.sin(th) * rad * R;
      out[i * 4 + 3] = 0.75 + r() * 0.35;
    } else {
      const a = r() * Math.PI * 2;
      const R = 2.45 + Math.pow(r(), 1.6) * 0.55;
      p[0] = Math.cos(a) * R;
      p[1] = gauss(r) * 0.02;
      p[2] = Math.sin(a) * R;
      rotX(p, 1.22);
      rotZ(p, 0.38);
      out[i * 4 + 3] = 1.1 + r() * 0.4;
    }
    out[i * 4] = p[0];
    out[i * 4 + 1] = p[1];
    out[i * 4 + 2] = p[2];
  }
  return out;
}

/** Company sites: a small city of glowing towers (edges + window rows), seen from above at an angle. */
export function city(n: number) {
  const r = rng(47);
  const G = 7;
  const step = 0.56;
  const foot = 0.36;
  const towers: { x: number; z: number; h: number }[] = [];
  for (let gx = 0; gx < G; gx++) {
    for (let gz = 0; gz < G; gz++) {
      const x = (gx - (G - 1) / 2) * step;
      const z = (gz - (G - 1) / 2) * step;
      const d = Math.hypot(x, z) / ((G * step) / 2);
      const h = 0.22 + Math.pow(1 - Math.min(d, 1), 1.3) * 2.1 * (0.45 + r() * 0.75);
      towers.push({ x, z, h });
    }
  }
  // edges: 4 vertical + 8 horizontal per tower
  type Seg = [number, number, number, number, number, number, number];
  const segs: Seg[] = [];
  const hf = foot / 2;
  for (const t of towers) {
    const cs = [[-hf, -hf], [hf, -hf], [hf, hf], [-hf, hf]];
    for (let c = 0; c < 4; c++) {
      const [ax, az] = cs[c];
      const [bx, bz] = cs[(c + 1) % 4];
      segs.push([t.x + ax, 0, t.z + az, t.x + ax, t.h, t.z + az, 1]);
      segs.push([t.x + ax, t.h, t.z + az, t.x + bx, t.h, t.z + bz, 1.25]);
      segs.push([t.x + ax, 0, t.z + az, t.x + bx, 0, t.z + bz, 0.7]);
    }
  }
  const lens = segs.map((sg) => Math.hypot(sg[3] - sg[0], sg[4] - sg[1], sg[5] - sg[2]));
  const total = lens.reduce((a, b) => a + b, 0);
  const cdf: number[] = [];
  let acc = 0;
  for (const l of lens) {
    acc += l / total;
    cdf.push(acc);
  }
  const out = new Float32Array(n * 4);
  const p = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    let bright = 1;
    const pick = r();
    if (pick < 0.62) {
      const u = r();
      let k = 0;
      while (cdf[k] < u) k++;
      const sg = segs[k];
      const t = r();
      p[0] = sg[0] + (sg[3] - sg[0]) * t + gauss(r) * 0.006;
      p[1] = sg[1] + (sg[4] - sg[1]) * t + gauss(r) * 0.006;
      p[2] = sg[2] + (sg[5] - sg[2]) * t + gauss(r) * 0.006;
      bright = sg[6];
    } else if (pick < 0.9) {
      // window rows on the facades
      const t = towers[Math.floor(r() * towers.length)];
      const rows = Math.max(1, Math.floor(t.h / 0.09));
      const yv = ((Math.floor(r() * rows) + 0.5) / rows) * t.h;
      const s2 = (Math.floor(r() * 4) - 1.5) / 4 * foot * 0.8;
      const side = Math.floor(r() * 4);
      if (side === 0) { p[0] = t.x + hf; p[2] = t.z + s2; }
      else if (side === 1) { p[0] = t.x - hf; p[2] = t.z + s2; }
      else if (side === 2) { p[0] = t.x + s2; p[2] = t.z + hf; }
      else { p[0] = t.x + s2; p[2] = t.z - hf; }
      p[1] = yv;
      bright = 0.75;
    } else {
      // street grid on the ground
      const L = (G * step) / 2 + 0.35;
      const along = (r() - 0.5) * 2 * L;
      const line = (Math.floor(r() * (G + 1)) - G / 2) * step;
      if (r() < 0.5) { p[0] = along; p[2] = line; } else { p[0] = line; p[2] = along; }
      p[1] = 0;
      bright = 0.45;
    }
    p[1] -= 0.85;
    rotY(p, Math.PI / 4);
    rotX(p, 0.52);
    out[i * 4] = p[0] * 1.08;
    out[i * 4 + 1] = p[1] * 1.08;
    out[i * 4 + 2] = p[2] * 1.08;
    out[i * 4 + 3] = bright;
  }
  return out;
}

/** 3D landing pages: a spinning three-armed galaxy (rotation is applied in the shader). */
export function galaxy(n: number) {
  const r = rng(59);
  const out = new Float32Array(n * 4);
  const p = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    let bright = 1;
    if (r() < 0.14) {
      const R = Math.pow(r(), 2) * 0.55;
      const a = r() * Math.PI * 2;
      const b = Math.acos(2 * r() - 1);
      p[0] = Math.sin(b) * Math.cos(a) * R;
      p[1] = Math.cos(b) * R * 0.6;
      p[2] = Math.sin(b) * Math.sin(a) * R;
      bright = 1.5;
    } else {
      const R = 0.35 + Math.pow(r(), 0.75) * 2.9;
      const arm = Math.floor(r() * 3);
      const a = arm * ((Math.PI * 2) / 3) + R * 1.75 + gauss(r) * (0.32 / (0.6 + R * 0.4));
      p[0] = Math.cos(a) * R;
      p[1] = gauss(r) * 0.08 * (1.2 - R / 3.4);
      p[2] = Math.sin(a) * R;
      bright = 0.7 + (1 - R / 3.3) * 0.6 + r() * 0.2;
    }
    out[i * 4] = p[0];
    out[i * 4 + 1] = p[1];
    out[i * 4 + 2] = p[2];
    out[i * 4 + 3] = bright;
  }
  return out;
}

/** Samples filled pixels of text drawn on a 2D canvas (handles Arabic shaping natively). */
export function word(n: number, text: string, font: string, width = 6.6) {
  const W = 1400;
  const H = 640;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.direction = 'rtl';
  g.font = font;
  g.fillText(text, W / 2, H / 2);
  const data = g.getImageData(0, 0, W, H).data;
  const px: number[] = [];
  let minX = W, maxX = 0, minY = H, maxY = 0;
  for (let y = 0; y < H; y += 2) {
    for (let x = 0; x < W; x += 2) {
      if (data[(y * W + x) * 4 + 3] > 140) {
        px.push(x, y);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const out = new Float32Array(n * 4);
  const r = rng(71);
  const count = px.length / 2;
  if (count === 0) return dust(n);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const s = width / Math.max(1, maxX - minX);
  for (let i = 0; i < n; i++) {
    const k = Math.floor(r() * count);
    const x = px[k * 2] + (r() - 0.5) * 2;
    const y = px[k * 2 + 1] + (r() - 0.5) * 2;
    out[i * 4] = (x - cx) * s;
    out[i * 4 + 1] = -(y - cy) * s;
    out[i * 4 + 2] = gauss(r) * 0.08;
    out[i * 4 + 3] = 0.85 + r() * 0.35;
  }
  return out;
}
