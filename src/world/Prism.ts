import * as THREE from 'three/webgpu';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { color, float, uv, smoothstep, mx_noise_float, vec2, uniform, positionLocal, vec3, mix, exp } from 'three/tsl';
import { SPECTRUM } from './palette';
import { BEAM_COUNT } from './Particles';

const PLATES = 5;

/**
 * The Tayf mark as real glass: five twisted plates with transmission + dispersion.
 * A white beam enters from one side and leaves the stack as five coloured beams,
 * one per plate. The beam source follows the pointer.
 */
export class Prism {
  readonly group = new THREE.Group();
  readonly stack = new THREE.Group();
  readonly plates: THREE.Mesh[] = [];
  readonly beamIn: THREE.Mesh;
  readonly beamsOut: THREE.Mesh[] = [];
  readonly flare: THREE.Mesh;
  readonly u = {
    time: uniform(0),
    intensity: uniform(1),
  };
  /** 0 = assembled, 1 = spread apart (scroll) */
  spread = 0;
  twist = 1;
  aimY = 0.2;
  /** world-space beam geometry for the particle lighting */
  readonly inA = new THREE.Vector3();
  readonly inB = new THREE.Vector3();
  readonly outO = Array.from({ length: BEAM_COUNT }, () => new THREE.Vector3());
  readonly outE = Array.from({ length: BEAM_COUNT }, () => new THREE.Vector3());

  constructor() {
    const geo = new RoundedBoxGeometry(1.55, 0.09, 1.55, 4, 0.04);
    for (let i = 0; i < PLATES; i++) {
      const tint = SPECTRUM[i];
      const m = new THREE.MeshPhysicalNodeMaterial({
        color: new THREE.Color().copy(tint).lerp(new THREE.Color('#ffffff'), 0.7),
        metalness: 0,
        roughness: 0.05,
        transmission: 1,
        thickness: 0.9,
        ior: 1.52,
        dispersion: 6,
        attenuationColor: tint,
        attenuationDistance: 1.1,
        specularIntensity: 1,
        clearcoat: 1,
        clearcoatRoughness: 0.04,
        iridescence: 0.45,
        iridescenceIOR: 1.3,
        envMapIntensity: 1.25,
      });
      // a faint inner glow so each plate reads as its colour even on a dark page
      m.emissiveNode = color(tint).mul(0.1);
      const mesh = new THREE.Mesh(geo, m);
      this.plates.push(mesh);
      this.stack.add(mesh);
    }
    this.group.add(this.stack);

    // ---- beams ----
    const t = this.u.time;
    const beamMat = (c: THREE.Color, startWidth: number, isIn: boolean) => {
      const mat = new THREE.MeshBasicNodeMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      // widen along the length (fan)
      mat.positionNode = vec3(positionLocal.x, positionLocal.y.mul(mix(float(startWidth), float(1), uv().x)), positionLocal.z);
      const across = uv().y.sub(0.5).mul(2);
      const core = exp(across.mul(across).mul(-7));
      const hot = exp(across.mul(across).mul(-60)).mul(0.6);
      const along = isIn
        ? smoothstep(0.0, 0.35, uv().x)
        : smoothstep(0.0, 0.04, uv().x).mul(float(1).sub(smoothstep(0.55, 1.0, uv().x)));
      const flicker = mx_noise_float(vec2(uv().x.mul(5).sub(t.mul(0.9)), t.mul(0.3))).mul(0.18).add(0.9);
      mat.colorNode = color(c).mul(1.6);
      mat.opacityNode = core.add(hot).mul(along).mul(flicker).mul(this.u.intensity).mul(isIn ? 0.55 : 0.85);
      return mat;
    };
    const plane = new THREE.PlaneGeometry(1, 1, 24, 1);
    plane.translate(0.5, 0, 0); // origin at the start of the beam
    this.beamIn = new THREE.Mesh(plane, beamMat(new THREE.Color('#fff6ee'), 1, true));
    this.beamIn.renderOrder = 3;
    this.group.add(this.beamIn);
    for (let k = 0; k < BEAM_COUNT; k++) {
      const b = new THREE.Mesh(plane, beamMat(SPECTRUM[k], 0.12, false));
      b.renderOrder = 3;
      this.beamsOut.push(b);
      this.group.add(b);
    }

    // soft flare where the light hits the glass
    const fm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const r = uv().sub(0.5).length().mul(2);
    fm.colorNode = color('#ffffff');
    fm.opacityNode = exp(r.mul(r).mul(-9)).mul(0.55).mul(this.u.intensity);
    this.flare = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), fm);
    this.flare.renderOrder = 4;
    this.group.add(this.flare);
  }

  /** layout + animation, called every frame */
  update(time: number, dt: number, pointer: { x: number; y: number }, view: { w: number; h: number }, reduced: boolean) {
    this.u.time.value = time;
    const g = this.stack;
    const gap = 0.24 + this.spread * 0.55;
    const sway = reduced ? 0 : 1;
    this.plates.forEach((m, i) => {
      const bob = Math.sin(time * 1.1 + i * 0.8) * 0.03 * sway;
      m.position.y = (i - (PLATES - 1) / 2) * gap + bob;
      m.rotation.y = THREE.MathUtils.degToRad((i * 11 - 22) * this.twist) + Math.sin(time * 0.45 + i) * 0.03 * sway;
    });
    const k = 1 - Math.exp(-dt * 3.5);
    const spin = reduced ? 0.6 : 0.6 + time * 0.12;
    g.rotation.y += (spin + pointer.x * 0.35 - g.rotation.y) * k;
    g.rotation.x += (0.62 + pointer.y * 0.12 - g.rotation.x) * k;

    // beams, in the group's local space (group has no rotation)
    this.aimY += (pointer.y * 0.8 - this.aimY) * k;
    const s = this.group.scale.x;
    const gx = this.group.position.x;
    const gy = this.group.position.y;
    const entry = new THREE.Vector2(0.62, 0.05);
    // the light comes from the top-right corner; the pointer slides it along the top edge
    const src = new THREE.Vector2((view.w * 0.5 + 1.2 - pointer.x * 1.5 - gx) / s, (view.h * 0.5 + 0.8 + this.aimY - gy) / s);
    this.place(this.beamIn, src, entry, 0.34);
    this.inA.set(gx + src.x * s, gy + src.y * s, 0);
    this.inB.set(gx + entry.x * s, gy + entry.y * s, 0);
    const slope = (src.y - entry.y) / (src.x - entry.x);
    for (let b = 0; b < BEAM_COUNT; b++) {
      const yi = (b - (BEAM_COUNT - 1) / 2) * gap * 0.95;
      const o = new THREE.Vector2(-0.55, yi * 0.8);
      const ang = Math.PI + Math.atan(slope) * 0.45 + (b - 2) * 0.09;
      const len = view.w / s + 2;
      const e = new THREE.Vector2(o.x + Math.cos(ang) * len, o.y + Math.sin(ang) * len);
      this.place(this.beamsOut[b], o, e, 0.95 + b * 0.04);
      this.outO[b].set(gx + o.x * s, gy + o.y * s, 0);
      this.outE[b].set(gx + e.x * s, gy + e.y * s, 0);
    }
    this.flare.position.set(entry.x, entry.y, 0.6);
    this.flare.scale.setScalar(1.3 + Math.sin(time * 2.1) * 0.06 * sway);
  }

  private place(mesh: THREE.Mesh, a: THREE.Vector2, b: THREE.Vector2, width: number) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    mesh.position.set(a.x, a.y, -0.05);
    mesh.rotation.z = Math.atan2(dy, dx);
    mesh.scale.set(Math.hypot(dx, dy), width, 1);
  }
}
