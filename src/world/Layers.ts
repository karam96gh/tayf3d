import * as THREE from 'three/webgpu';
import { color, uniform, uv, float, smoothstep } from 'three/tsl';
import { drawBackground, drawContent, drawMotion, drawInteraction, LW, LH } from './layerArt';
import { SPECTRUM } from './palette';

const W = 3.6;
const H = (W * LH) / LW;

/**
 * A mock website split into its four layers. Scroll assembles it, turns it to an
 * isometric view and pulls the layers apart so each one can be explained.
 */
export class Layers {
  readonly group = new THREE.Group();
  readonly inner = new THREE.Group();
  readonly planes: THREE.Mesh[] = [];
  readonly frames: THREE.Mesh[] = [];
  private built = false;
  private base = new THREE.Vector3();
  private baseScale = 1;
  active = -1;

  constructor() {
    this.group.add(this.inner);
    this.group.visible = false;
  }

  /** Canvas art needs the web fonts, so textures are drawn on demand. */
  build() {
    if (this.built) return;
    this.built = true;
    const arts = [drawBackground(), drawContent(), drawMotion(), drawInteraction()];
    const geo = new THREE.PlaneGeometry(W, H);
    arts.forEach((c, i) => {
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      const m = new THREE.MeshBasicNodeMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide });
      m.toneMapped = false;
      const mesh = new THREE.Mesh(geo, m);
      mesh.renderOrder = 10 + i;
      this.planes.push(mesh);
      this.inner.add(mesh);

      // glowing outline frame for each layer
      const fm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
      const e = uv().sub(0.5).abs().mul(2);
      const d = float(1).sub(e.x).mul(W / 2).min(float(1).sub(e.y).mul(H / 2));
      const line = float(1).sub(smoothstep(0.0, 0.018, d));
      fm.colorNode = color(SPECTRUM[(i * 2) % 5]).mul(1.8);
      const op = uniform(0);
      fm.opacityNode = line.mul(op);
      (fm as any).userData.op = op;
      const frame = new THREE.Mesh(geo, fm);
      frame.renderOrder = 20 + i;
      this.frames.push(frame);
      mesh.add(frame);
    });
  }

  layout(w: number, h: number, portrait: boolean) {
    if (portrait) {
      this.base.set(0, h * 0.16, 0);
      this.baseScale = Math.min(0.9, (w * 0.9) / W);
    } else {
      this.base.set(-w * 0.17, 0, 0);
      this.baseScale = Math.min(1.25, (w * 0.5) / W);
    }
  }

  anchor(x: number, y: number, scale: number) {
    this.base.set(x, y, 0);
    this.baseScale = scale;
  }

  update(visible: number, p: number, time: number, pointer: { x: number; y: number }) {
    this.group.visible = visible > 0.01 && this.built;
    if (!this.group.visible) return;
    const ease = (t: number) => t * t * (3 - 2 * t);
    const turn = ease(THREE.MathUtils.clamp(p / 0.28, 0, 1));
    const split = ease(THREE.MathUtils.clamp((p - 0.18) / 0.4, 0, 1));
    this.group.position.copy(this.base);
    this.group.scale.setScalar(this.baseScale * (0.85 + 0.15 * visible));
    this.inner.rotation.y = THREE.MathUtils.lerp(0, -0.62, turn) + pointer.x * 0.08;
    this.inner.rotation.x = THREE.MathUtils.lerp(0.02, 0.36, turn) - pointer.y * 0.05;
    this.inner.rotation.z = THREE.MathUtils.lerp(0, 0.04, turn);
    const act = p < 0.36 ? -1 : Math.min(3, Math.floor((p - 0.36) / 0.16));
    this.active = act;
    this.planes.forEach((m, i) => {
      const z = (i - 1.5) * 0.02 + split * (i - 1.5) * 1.05;
      const lift = Math.sin(time * 0.9 + i) * 0.03 * split;
      m.position.set(split * (i - 1.5) * 0.18, lift, z);
      const focus = act < 0 ? 1 : act === i ? 1 : 0.35;
      const mat = m.material as THREE.MeshBasicNodeMaterial;
      mat.opacity = visible * THREE.MathUtils.lerp(1, focus, split);
      const op = (this.frames[i].material as any).userData.op;
      op.value = visible * split * (act === i ? 1 : 0.35);
    });
  }
}
