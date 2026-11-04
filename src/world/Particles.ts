import * as THREE from 'three/webgpu';
import {
  Fn, instancedArray, instanceIndex, uniform, vec3, vec4, float, mix, smoothstep,
  mx_noise_vec3, uv, exp, varying, hash, cos, sin,
} from 'three/tsl';
import { spectrum } from './palette';

export const BEAM_COUNT = 5;

// TSL uniform nodes are used both as GPU values and as { value } holders
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type U<T> = any & { value: T };

/**
 * GPU particle system: positions and velocities live in storage buffers and are
 * integrated by a compute shader every frame (WebGPU compute, or transform feedback on WebGL 2).
 * Each particle springs toward a weighted blend of target shapes, drifts in a noise flow field,
 * gets pushed by the pointer, and is lit by the hero light beams.
 */
export class Particles {
  readonly count: number;
  readonly mesh: THREE.Sprite;
  readonly compute: any;
  readonly weights: U<number>[] = [];
  readonly offsets: U<THREE.Vector3>[] = [];
  readonly scales: U<number>[] = [];

  readonly u = {
    dt: uniform(0.016),
    time: uniform(0),
    spring: uniform(2.6),
    damping: uniform(0.92),
    flow: uniform(0.35),
    flowScale: uniform(0.32),
    pointer: uniform(new THREE.Vector3(99, 99, 0)),
    pointerRadius: uniform(1.3),
    pointerStrength: uniform(0),
    spinSphere: uniform(0),
    spinGalaxy: uniform(0),
    size: uniform(0.05),
    glow: uniform(1),
    opacity: uniform(1),
    beamI: uniform(0),
    beamW: uniform(0.16),
    inA: uniform(new THREE.Vector3()),
    inB: uniform(new THREE.Vector3()),
    outO: [] as U<THREE.Vector3>[],
    outE: [] as U<THREE.Vector3>[],
  };

  constructor(count: number, shapes: Float32Array[], hues: Float32Array) {
    this.count = count;
    const u = this.u;

    // initial state: start from the first shape, hue stored in position.w
    const pos0 = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      pos0[i * 4] = shapes[0][i * 4] * 1.6;
      pos0[i * 4 + 1] = shapes[0][i * 4 + 1] * 1.6;
      pos0[i * 4 + 2] = shapes[0][i * 4 + 2];
      pos0[i * 4 + 3] = hues[i];
    }
    const positions = instancedArray(pos0, 'vec4');
    const velocities = instancedArray(new Float32Array(count * 4), 'vec4');
    // read-only targets: storage buffers on WebGPU, texture (PBO) reads on WebGL 2,
    // so transform feedback only has to write positions and velocities
    const targets = shapes.map((s) => instancedArray(s, 'vec4').setPBO(true).toReadOnly());

    shapes.forEach((_, k) => {
      this.weights.push(uniform(k === 0 ? 1 : 0) as U<number>);
      this.offsets.push(uniform(new THREE.Vector3()) as U<THREE.Vector3>);
      this.scales.push(uniform(1) as U<number>);
    });
    for (let b = 0; b < BEAM_COUNT; b++) {
      u.outO.push(uniform(new THREE.Vector3()) as U<THREE.Vector3>);
      u.outE.push(uniform(new THREE.Vector3()) as U<THREE.Vector3>);
    }

    const SPHERE = 2;
    const GALAXY = 4;

    this.compute = Fn(() => {
      const P = positions.element(instanceIndex);
      const V = velocities.element(instanceIndex);
      const pos = P.xyz.toVar();
      const vel = V.xyz.toVar();
      const tgt = vec3(0).toVar();
      const bri = float(0).toVar();

      targets.forEach((buf, k) => {
        const T = buf.element(instanceIndex);
        let p: any = T.xyz;
        if (k === SPHERE) {
          const a = u.spinSphere;
          p = vec3(p.x.mul(cos(a)).add(p.z.mul(sin(a))), p.y, p.z.mul(cos(a)).sub(p.x.mul(sin(a))));
        }
        if (k === GALAXY) {
          const a = u.spinGalaxy;
          const q = vec3(p.x.mul(cos(a)).add(p.z.mul(sin(a))), p.y, p.z.mul(cos(a)).sub(p.x.mul(sin(a))));
          // tilt toward the camera
          const b = float(1.08);
          p = vec3(q.x, q.y.mul(cos(b)).sub(q.z.mul(sin(b))), q.y.mul(sin(b)).add(q.z.mul(cos(b))));
        }
        const w = this.weights[k];
        tgt.addAssign(p.mul(this.scales[k]).add(this.offsets[k]).mul(w));
        bri.addAssign(T.w.mul(w));
      });

      const n = mx_noise_vec3(pos.mul(u.flowScale).add(vec3(u.time.mul(0.07), u.time.mul(0.11), u.time.mul(0.05))));
      const force = tgt.sub(pos).mul(u.spring).add(n.mul(u.flow)).toVar();

      const d = pos.sub(u.pointer);
      const dist = d.length();
      const fall = float(1).sub(smoothstep(0, u.pointerRadius, dist)).mul(u.pointerStrength);
      force.addAssign(d.div(dist.add(0.0001)).mul(fall).mul(9));

      vel.assign(vel.add(force.mul(u.dt)).mul(u.damping));
      pos.addAssign(vel.mul(u.dt));
      P.assign(vec4(pos, P.w));
      V.assign(vec4(vel, bri));
    })().compute(count);

    // ---------- render ----------
    const mat = new THREE.PointsNodeMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    const P = positions.toAttribute();
    const V = velocities.toAttribute();
    const seed = hash(instanceIndex);
    mat.positionNode = P.xyz;

    const segDist = (p: any, a: any, b: any) => {
      const pa = p.sub(a);
      const ba = b.sub(a);
      const h = pa.dot(ba).div(ba.dot(ba).add(1e-5)).clamp(0, 1);
      return pa.sub(ba.mul(h)).length();
    };

    const colorV = Fn(() => {
      const p = P.xyz;
      const hue = P.w;
      const b = V.w.max(0.2);
      const speed = V.xyz.length();
      const base = spectrum(hue).mul(b).mul(u.glow).mul(0.55);
      // light beams: dust inside a beam takes the beam's colour
      const w2 = u.beamW.mul(u.beamW);
      const lit = vec3(0).toVar();
      const dIn = segDist(p, u.inA, u.inB);
      lit.addAssign(vec3(1, 0.97, 0.94).mul(exp(dIn.mul(dIn).div(w2).negate())).mul(0.9));
      for (let k = 0; k < BEAM_COUNT; k++) {
        const dk = segDist(p, u.outO[k], u.outE[k]);
        lit.addAssign(spectrum(float(k / (BEAM_COUNT - 1))).mul(exp(dk.mul(dk).div(w2.mul(1.8)).negate())).mul(1.5));
      }
      const fast = smoothstep(0.4, 3.0, speed).mul(0.6);
      return base.add(lit.mul(u.beamI)).add(spectrum(hue).mul(fast));
    });
    mat.colorNode = varying(colorV());

    mat.sizeNode = u.size.mul(mix(0.55, 1.45, seed)).mul(V.w.clamp(0.5, 1.5));
    const r = uv().sub(0.5).length();
    mat.opacityNode = float(1).sub(smoothstep(0.0, 0.5, r)).pow(1.6).mul(u.opacity);

    this.mesh = new THREE.Sprite(mat);
    this.mesh.count = count;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
  }

  /** Normalised weights so the target is always a proper blend. */
  setWeights(w: number[]) {
    let s = 0;
    for (const v of w) s += v;
    s = s || 1;
    w.forEach((v, k) => (this.weights[k].value = v / s));
  }
}
