import * as THREE from 'three/webgpu';
import { color, float, uv, mx_fractal_noise_float, vec2, vec3, uniform, mix, smoothstep, exp } from 'three/tsl';
import { spectrum } from './palette';

/**
 * Opaque, slowly moving "aurora" far behind everything. It is the page's atmosphere,
 * and it gives the glass something real to refract.
 */
export function makeBackdrop() {
  const u = { time: uniform(0), aurora: uniform(1), lift: uniform(0) };
  const mat = new THREE.MeshBasicNodeMaterial({ depthWrite: false });
  const p = uv().sub(0.5).mul(vec2(1.8, 1));
  const r = p.length();
  const base = mix(color('#0d0a1a'), color('#06050b'), smoothstep(0.0, 0.85, r));
  const t = u.time.mul(0.035);
  const n1 = mx_fractal_noise_float(vec3(p.x.mul(1.4).add(t), p.y.mul(2.6).sub(t.mul(0.6)), t.mul(0.5)), 3, 2.0, 0.5);
  const n2 = mx_fractal_noise_float(vec3(p.x.mul(2.2).sub(t.mul(0.8)), p.y.mul(1.6).add(t), 4.0), 3, 2.0, 0.5);
  const band = exp(p.y.sub(n1.mul(0.35)).sub(0.08).mul(p.y.sub(n1.mul(0.35)).sub(0.08)).mul(-9));
  const hue = p.x.mul(0.45).add(0.5).add(n2.mul(0.25));
  const glow = spectrum(hue).mul(band).mul(n2.mul(0.5).add(0.5)).mul(0.16).mul(u.aurora);
  const vign = float(1).sub(smoothstep(0.35, 1.05, r).mul(0.65));
  mat.colorNode = base.add(glow).add(color('#2a1d5c').mul(u.lift).mul(0.08)).mul(vign);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  mesh.renderOrder = -10;
  return { mesh, u };
}

/** A small studio for reflections: dark room with spectrum light panels. */
export function makeEnvScene() {
  const scene = new THREE.Scene();
  const room = new THREE.Mesh(
    new THREE.SphereGeometry(20, 32, 16),
    new THREE.MeshBasicNodeMaterial({ color: new THREE.Color('#0a0912'), side: THREE.BackSide }),
  );
  scene.add(room);
  const panel = (c: string, power: number, pos: [number, number, number], scale: [number, number], look = new THREE.Vector3()) => {
    const m = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
    m.colorNode = color(c).mul(power);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m);
    mesh.position.set(...pos);
    mesh.scale.set(scale[0], scale[1], 1);
    mesh.lookAt(look);
    scene.add(mesh);
  };
  panel('#ffffff', 5, [0, 9, 2], [12, 4]);
  panel('#ffffff', 2.2, [0, 2, 10], [10, 3]);
  panel('#8FF7FF', 3.2, [-10, 1.5, 1], [3, 9]);
  panel('#FF8CC6', 3.2, [10, 1.5, 1], [3, 9]);
  panel('#8C86FF', 2.6, [0, 1, -10], [14, 3]);
  panel('#C98BFF', 1.8, [-6, -6, -4], [6, 2]);
  return scene;
}

/** Product studio for the configurator: tall strip lights for crisp facet highlights. */
export function makeStudioEnv() {
  const scene = new THREE.Scene();
  const room = new THREE.Mesh(
    new THREE.SphereGeometry(20, 32, 16),
    new THREE.MeshBasicNodeMaterial({ color: new THREE.Color('#121019'), side: THREE.BackSide }),
  );
  scene.add(room);
  const panel = (c: string, power: number, pos: [number, number, number], scale: [number, number]) => {
    const m = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
    m.colorNode = color(c).mul(power);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m);
    mesh.position.set(...pos);
    mesh.scale.set(scale[0], scale[1], 1);
    mesh.lookAt(0, 1, 0);
    scene.add(mesh);
  };
  panel('#ffffff', 3.5, [0, 10, 0], [9, 9]);
  panel('#ffffff', 5, [-6, 2, 4], [0.35, 10]);
  panel('#ffffff', 5, [6, 2, 4], [0.35, 10]);
  panel('#ffffff', 0.9, [0, 1.5, 9], [14, 7]);
  panel('#FF8CC6', 4, [-8, 1, -5], [2, 8]);
  panel('#8FF7FF', 4, [8, 1, -5], [2, 8]);
  panel('#8C86FF', 3, [0, 1, -9], [10, 2]);
  return scene;
}
