/**
 * The Tayf mark rendered as real glass, per pixel:
 * five rounded plates (signed distance field), refraction in and out of the glass,
 * chromatic dispersion (one exit ray per colour channel), Fresnel reflections of a
 * procedural studio, and a soft rainbow the prism throws on the floor.
 */
export const VERT = /* glsl */ `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

export const FRAG = /* glsl */ `#version 300 es
precision highp float;
out vec4 outColor;

uniform vec2  uRes;
uniform float uTime;
uniform mat3  uInv;      // world -> object rotation
uniform vec3  uObj;      // object centre (world)
uniform float uZoom;     // object scale
uniform float uFade;     // object visibility
uniform vec2  uPlate[5]; // cos/sin of each plate's own turn
uniform float uY[5];     // plate heights
uniform float uX[5];     // plate side offsets (focus)
uniform float uGlow[5];  // extra glow per plate
uniform float uBound;    // bounding radius in object space
uniform vec3  uCam;      // camera position
uniform float uFloor;    // rainbow on the floor (0..1)
uniform float uSteps;    // quality: 1 = full
uniform vec3  uUp;       // the plates' up axis in world space

const vec3 B = vec3(0.62, 0.046, 0.62);
const float RR = 0.04;

vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }
vec3 spectrum(float h) {
  h = clamp(h, 0.0, 1.0) * 4.0;
  vec3 c0 = lin(vec3(1.000, 0.549, 0.776));
  vec3 c1 = lin(vec3(0.788, 0.545, 1.000));
  vec3 c2 = lin(vec3(0.549, 0.525, 1.000));
  vec3 c3 = lin(vec3(0.384, 0.706, 1.000));
  vec3 c4 = lin(vec3(0.561, 0.969, 1.000));
  vec3 c = mix(c0, c1, clamp(h, 0.0, 1.0));
  c = mix(c, c2, clamp(h - 1.0, 0.0, 1.0));
  c = mix(c, c3, clamp(h - 2.0, 0.0, 1.0));
  c = mix(c, c4, clamp(h - 3.0, 0.0, 1.0));
  return c;
}
vec3 plateColor(int i) {
  if (i == 0) return lin(vec3(1.000, 0.549, 0.776));
  if (i == 1) return lin(vec3(0.788, 0.545, 1.000));
  if (i == 2) return lin(vec3(0.549, 0.525, 1.000));
  if (i == 3) return lin(vec3(0.384, 0.706, 1.000));
  return lin(vec3(0.561, 0.969, 1.000));
}

float sdRoundBox(vec3 p, vec3 b, float r) {
  vec3 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r;
}

// object-space distance; returns the nearest plate id
float mapObj(vec3 q, out int id) {
  float d = 1e9;
  id = 0;
  for (int i = 0; i < 5; i++) {
    vec3 r = q - vec3(uX[i], uY[i], 0.0);
    vec2 cs = uPlate[i];
    r.xz = mat2(cs.x, -cs.y, cs.y, cs.x) * r.xz;
    float di = sdRoundBox(r, B, RR);
    if (di < d) { d = di; id = i; }
  }
  return d;
}
float map(vec3 p, out int id) {
  return mapObj(uInv * (p - uObj) / uZoom, id) * uZoom;
}
vec3 normalAt(vec3 p) {
  const vec2 k = vec2(1.0, -1.0);
  float e = 0.0008 * uZoom;
  int id;
  return normalize(k.xyy * map(p + k.xyy * e, id) + k.yyx * map(p + k.yyx * e, id) +
                   k.yxy * map(p + k.yxy * e, id) + k.xxx * map(p + k.xxx * e, id));
}

// the studio the glass reflects and refracts (never shown directly)
vec3 env(vec3 d) {
  float y = d.y;
  float az = atan(d.x, d.z);
  vec3 c = mix(vec3(0.003, 0.002, 0.007), vec3(0.03, 0.022, 0.06), smoothstep(-0.5, 0.9, y));
  c += vec3(1.0) * 2.4 * smoothstep(0.72, 0.93, y);
  float strip = smoothstep(-0.25, 0.25, y) * smoothstep(0.95, 0.55, y);
  c += vec3(1.0) * 3.2 * exp(-pow((az - 1.0) / 0.05, 2.0)) * strip;
  c += vec3(1.0) * 2.2 * exp(-pow((az + 1.3) / 0.035, 2.0)) * strip;
  float h = fract(az / 6.28318 + 0.5 + uTime * 0.008);
  c += spectrum(abs(h * 2.0 - 1.0)) * 1.7 * exp(-pow((y - 0.04) / 0.11, 2.0));
  c += spectrum(0.55) * 0.5 * exp(-pow((y + 0.35) / 0.2, 2.0));
  return c;
}

// what you see where the rays miss: deep ink, a quiet glow, and the rainbow on the floor
vec3 background(vec3 ro, vec3 rd, vec2 uv) {
  vec3 c = mix(lin(vec3(0.051, 0.043, 0.094)), lin(vec3(0.027, 0.024, 0.047)), smoothstep(0.0, 1.2, length(uv)));
  // glow behind the object
  vec3 toObj = normalize(uObj - ro);
  float g = max(dot(rd, toObj), 0.0);
  c += lin(vec3(0.42, 0.34, 0.86)) * pow(g, 260.0 / (uZoom * uZoom + 0.2)) * 0.32 * uFade;
  // floor rainbow + soft contact shadow
  if (rd.y < 0.0 && uFloor > 0.001) {
    float fy = uObj.y - 0.72 * uZoom;
    float t = (fy - ro.y) / rd.y;
    if (t > 0.0) {
      vec3 hp = ro + rd * t - uObj;
      vec2 f = hp.xz / uZoom;
      // the beam leaves towards the lower left, fanning into colour
      vec2 a = f - vec2(-0.15, 0.15);
      float along = dot(a, normalize(vec2(-1.0, 0.45)));
      float across = dot(a, normalize(vec2(0.45, 1.0)));
      float fan = 0.18 + max(along, 0.0) * 0.32;
      float hue = across / fan * 0.5 + 0.5;
      float band = smoothstep(0.0, 0.12, hue) * smoothstep(1.0, 0.88, hue);
      float fall = smoothstep(-0.15, 0.35, along) * exp(-max(along, 0.0) * 1.1);
      c += spectrum(hue) * band * fall * 0.42 * uFloor * uFade;
      float sh = exp(-dot(f, f) * 2.6);
      c *= 1.0 - sh * 0.55 * uFade;
    }
  }
  return c;
}

vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 uv = (frag - 0.5 * uRes) / uRes.y;
  vec3 ro = uCam;
  vec3 fw = normalize(-uCam);
  vec3 rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(rt, fw);
  vec3 rd = normalize(fw * 1.75 + rt * uv.x * 1.0 + up * uv.y * 1.0);

  vec3 col = background(ro, rd, uv);

  // bounding sphere: most pixels skip the expensive part
  vec3 oc = ro - uObj;
  float R = uBound * uZoom;
  float bq = dot(oc, rd);
  float cq = dot(oc, oc) - R * R;
  float disc = bq * bq - cq;
  if (disc > 0.0 && uFade > 0.002) {
    float sq = sqrt(disc);
    float tn = max(-bq - sq, 0.0);
    float tf = -bq + sq;
    float t = tn;
    int id = 0;
    bool hit = false;
    int maxS = int(40.0 + 50.0 * uSteps);
    for (int s = 0; s < 90; s++) {
      if (s >= maxS) break;
      float d = map(ro + rd * t, id);
      if (d < 0.0006 * t) { hit = true; break; }
      t += d;
      if (t > tf) break;
    }
    if (hit) {
      vec3 p = ro + rd * t;
      vec3 n = normalAt(p);
      float cosI = clamp(dot(-rd, n), 0.0, 1.0);
      float fres = 0.04 + 0.96 * pow(1.0 - cosI, 5.0);
      vec3 refl = env(reflect(rd, n));

      // into the glass
      const float IOR = 1.52;
      vec3 rdi = refract(rd, n, 1.0 / IOR);
      vec3 pi = p - n * 0.003 * uZoom;
      vec3 pe;
      vec3 ne;
      float ti;
      // the plates are thin slabs: find the exit through the flat faces exactly
      vec3 q = uInv * (pi - uObj) / uZoom;
      vec3 rq = uInv * rdi;
      float tq = rq.y > 0.0 ? (uY[id] + B.y - q.y) / rq.y : (uY[id] - B.y - q.y) / rq.y;
      vec3 qe = q + rq * tq - vec3(uX[id], uY[id], 0.0);
      vec2 cs = uPlate[id];
      vec2 lxz = mat2(cs.x, -cs.y, cs.y, cs.x) * qe.xz;
      if (abs(rq.y) > 0.04 && abs(lxz.x) < B.x - RR && abs(lxz.y) < B.z - RR) {
        ti = tq * uZoom;
        pe = pi + rdi * ti;
        ne = rq.y > 0.0 ? -uUp : uUp;
      } else {
        // through a rounded edge: trace it
        ti = 0.0;
        int idi;
        for (int s = 0; s < 40; s++) {
          float d = -map(pi + rdi * ti, idi);
          if (d < 0.0004) break;
          ti += max(d, 0.004 * uZoom);
        }
        pe = pi + rdi * ti;
        ne = -normalAt(pe);
      }
      // out of the glass, one ray per colour: this is the dispersion
      vec3 refr;
      vec3 er = refract(rdi, ne, 1.508);
      vec3 eg = refract(rdi, ne, 1.525);
      vec3 eb = refract(rdi, ne, 1.552);
      vec3 tir = reflect(rdi, ne);
      er = dot(er, er) < 0.5 ? tir : er;
      eg = dot(eg, eg) < 0.5 ? tir : eg;
      eb = dot(eb, eb) < 0.5 ? tir : eb;
      refr.r = mix(background(pe, er, uv), env(er), 0.42).r;
      refr.g = mix(background(pe, eg, uv), env(eg), 0.42).g;
      refr.b = mix(background(pe, eb, uv), env(eb), 0.42).b;

      vec3 tint = plateColor(id);
      vec3 absorb = exp(-(1.0 - tint) * (ti / uZoom) * 9.0);
      vec3 body = refr * absorb * mix(vec3(1.0), tint, 0.6);
      vec3 glass = mix(body, refl, fres);
      // colour living inside the glass, strongest at the edges like the logo's bevels
      glass += tint * (0.05 + uGlow[id] * 0.55) + tint * pow(1.0 - cosI, 2.5) * 0.32;
      col = mix(col, glass, uFade);
    }
  }

  col = aces(col * 1.05);
  col = pow(col, vec3(1.0 / 2.2));
  // dither against banding in the dark gradients
  float n = fract(sin(dot(frag, vec2(12.9898, 78.233)) + uTime) * 43758.5453);
  col += (n - 0.5) / 255.0;
  outColor = vec4(col, 1.0);
}
`;
