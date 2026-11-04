import * as THREE from 'three/webgpu';
import { Fn, color, float, mix } from 'three/tsl';

export const SPECTRUM_HEX = ['#FF8CC6', '#C98BFF', '#8C86FF', '#62B4FF', '#8FF7FF'] as const;
export const SPECTRUM = SPECTRUM_HEX.map((h) => new THREE.Color(h));

/** hue 0..1 → one of the five brand colours, blended smoothly. */
export const spectrum = /*@__PURE__*/ Fn(([h]: [any]) => {
  const t = float(h).clamp(0, 1).mul(4);
  const c = mix(color(SPECTRUM[0]), color(SPECTRUM[1]), t.clamp(0, 1)).toVar();
  c.assign(mix(c, color(SPECTRUM[2]), t.sub(1).clamp(0, 1)));
  c.assign(mix(c, color(SPECTRUM[3]), t.sub(2).clamp(0, 1)));
  c.assign(mix(c, color(SPECTRUM[4]), t.sub(3).clamp(0, 1)));
  return c;
});
