/* ============================================================
   conrado.cloud — WIP: "Stage"
   One window, pinned to the screen, morphs between a rectangle per
   section while the page scrolls over it. Text is ink on paper and
   turns white where it passes over the window.
   ============================================================ */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { DofPass } from './dof.js';

const qs = new URLSearchParams(location.search);
const isMobile = matchMedia('(max-width: 760px), (pointer: coarse)').matches;
const quality = qs.get('q') || (isMobile ? 'low' : 'high');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const Q = {
  high: { blades: 380000, flowers: 5200, dpr: 1.5, gridX: 900, gridY: 300, bloom: true },
  mid:  { blades: 220000, flowers: 3000, dpr: 1.25, gridX: 720, gridY: 240, bloom: true },
  low:  { blades: 90000,  flowers: 1400, dpr: 1,    gridX: 480, gridY: 160, bloom: false },
}[quality] || null;

const canvas = document.getElementById('meadow');
const root = document.documentElement;

/* ---------- renderer ---------- */
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (e) {
  document.documentElement.classList.add('no-webgl');
  throw e;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, Q.dpr));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 1200);

/* ---------- palette (authored in sRGB, converted to linear) ---------- */
const C = (hex) => new THREE.Color(hex);
const PAL = {
  zenith:   C('#1f55b0'),
  horizon:  C('#bcd3e4'),
  haze:     C('#b9cdd6'),
  sun:      C('#fff1dc'),
  grassBase:C('#16300d'),
  grassMid: C('#3c6a1b'),
  grassTip: C('#a9c455'),
  grassDry: C('#c7b865'),
  trans:    C('#d9e86a'),
  skyAmb:   C('#6d8fb3'),
  soil:     C('#2e3d1c'),
};
const SUN_DIR = new THREE.Vector3(-0.66, 0.66, -0.36).normalize();
PAL.tree = C('#1f3a17');
PAL.skyMid = C('#6d93cc'); PAL.cloudLit = new THREE.Color(1.16, 1.12, 1.06); PAL.cloudShade = C('#9aa6bb'); PAL.glow = C('#fff1dc').multiplyScalar(0.25);
const clonePal = (base, over) => ({ ...Object.fromEntries(Object.entries(base).map(([k, v]) => [k, v.clone()])), ...over });
const DAY = {}; for (const k in PAL) DAY[k] = PAL[k].clone();
// sunset: fired orange at the horizon, rose then violet above, clouds lit orange from beneath
const DUSK = clonePal(DAY, {
  zenith: C('#252a66'), skyMid: C('#b24a78'), horizon: C('#ff8836'), haze: C('#d9703f'), sun: C('#ff6a2a'),
  skyAmb: C('#8a5a7a'), trans: C('#ff9550'), tree: C('#26191d'),
  cloudLit: C('#ffb070'), cloudShade: C('#7a4a78'), glow: C('#ff7a2e') });
// sunrise: softer; peach at the horizon, pink and lavender above, rose-gold clouds
const DAWN = clonePal(DAY, {
  zenith: C('#3b4b8c'), skyMid: C('#cf8fbe'), horizon: C('#ffc295'), haze: C('#e8ab98'), sun: C('#ffb877'),
  skyAmb: C('#9c89aa'), trans: C('#ffc794'), tree: C('#2b2a31'),
  cloudLit: C('#ffcbb0'), cloudShade: C('#77689a'), glow: C('#ffa888') });
const NIGHT = clonePal(DAY, {
  zenith: C('#040917'), skyMid: C('#0a1330'), horizon: C('#15213a'), haze: C('#0c1426'),
  sun: C('#9db3e0').multiplyScalar(0.42), skyAmb: C('#2a3d63').multiplyScalar(0.6),
  trans: C('#7fa2a8').multiplyScalar(0.28), tree: C('#060a10'), grassTip: C('#8fb26a'),
  cloudLit: C('#27314c'), cloudShade: C('#0b1020'), glow: C('#000000') });
const SUN_H = new THREE.Vector2(-0.66, -0.36).normalize();
const SKY_SUN = new THREE.Vector3().copy(SUN_DIR), MOON_DIR = new THREE.Vector3(0.4, 0.55, -0.73).normalize();
function dirFrom(v, x, z, elDeg) {
  const l = Math.hypot(x, z) || 1, e = THREE.MathUtils.degToRad(elDeg);
  return v.set(x / l * Math.cos(e), Math.sin(e), z / l * Math.cos(e));
}
// the meadow through a year (albedo only, so it works by day or by night)
const SEASON_KEYS = ['grassBase', 'grassMid', 'grassTip', 'grassDry', 'tree'];
const SEASONS = [ // Jan, Apr, Jul, Oct — the year wraps back to winter
  { grassBase: C('#262b22'), grassMid: C('#687060'), grassTip: C('#b4bcac'), grassDry: C('#98988a'), tree: C('#2f3530'), snow: 0.75, bloom: 0 },
  { grassBase: C('#16300d'), grassMid: C('#3c6a1b'), grassTip: C('#a9c455'), grassDry: C('#c7b865'), tree: C('#1f3a17'), snow: 0, bloom: 1 },
  { grassBase: C('#1b340c'), grassMid: C('#4f7a1c'), grassTip: C('#c4c65a'), grassDry: C('#d4b85a'), tree: C('#1c3614'), snow: 0, bloom: 0.55 },
  { grassBase: C('#2c2410'), grassMid: C('#7d6224'), grassTip: C('#d6a449'), grassDry: C('#c98a3a'), tree: C('#553a1c'), snow: 0, bloom: 0 },
];
const SEASON_U = { uSnow: { value: 0 }, uBloom: { value: 1 } };
const TOD = {}; // the time-of-day grass colours, before any season is applied
const _sc = new THREE.Color();
function applySeason(weight, phase) {
  const f = ((phase % 1) + 1) % 1 * 4, i = Math.floor(f) % 4, j = (i + 1) % 4;
  const x = f - Math.floor(f), e = x * x * (3 - 2 * x);
  for (const k of SEASON_KEYS) {
    _sc.copy(SEASONS[i][k]).lerp(SEASONS[j][k], e);
    PAL[k].copy(TOD[k]).lerp(_sc, weight);
  }
  SEASON_U.uSnow.value = weight * (SEASONS[i].snow + (SEASONS[j].snow - SEASONS[i].snow) * e);
  SEASON_U.uBloom.value = 1 + (SEASONS[i].bloom + (SEASONS[j].bloom - SEASONS[i].bloom) * e - 1) * weight;
}
let nightT = 0;           // 0 = day, 1 = night; the toggle animates it through dusk
function applyTime(t, rising, w = 0) {
  const late = t > 0.5, k = (x) => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  const mid = rising ? DAWN : DUSK;
  const a = late ? mid : DAY, b = late ? NIGHT : mid, u = k(late ? (t - 0.5) * 2 : t * 2);
  for (const key in PAL) PAL[key].copy(a[key]).lerp(b[key], u);
  // the sun: one steady arc from its daytime place down to its setting point and on below the
  // horizon (a sunrise is the same path played backwards, on the other side). It never turns back.
  const sd = clamp01(t / 0.62), sEl = 41 + (-7 - 41) * sd;
  const highX = rising ? SUN_H.x + (-SUN_H.x - SUN_H.x) * w : SUN_H.x;
  const lowX = highX + ((rising ? 0.36 : -0.36) - highX) * w, lowZ = SUN_H.y + (-0.93 - SUN_H.y) * w;
  dirFrom(SKY_SUN, highX + (lowX - highX) * sd, SUN_H.y + (lowZ - SUN_H.y) * sd, sEl);
  // the moon: its own path, rising on the opposite side once the sun is down
  const mr = THREE.MathUtils.smoothstep(t, 0.5, 1);
  dirFrom(MOON_DIR, rising ? -0.55 : 0.55, -0.83, -6 + (32 + 6) * mr);
  // the meadow is lit by whichever is up, handed over while the light is at its dimmest
  const hand = THREE.MathUtils.smoothstep(t, 0.46, 0.62);
  SUN_DIR.copy(SKY_SUN).lerp(MOON_DIR, hand);
  SUN_DIR.y = Math.max(SUN_DIR.y, 0.05);
  SUN_DIR.normalize();
}

/* ---------- shared GLSL ---------- */
const NOISE = /* glsl */`
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
  return mix(mix(hash12(i),hash12(i+vec2(1,0)),u.x), mix(hash12(i+vec2(0,1)),hash12(i+vec2(1,1)),u.x),u.y); }
float fbm3(vec2 p){ float a=.5, s=0.; for(int i=0;i<3;i++){ s+=a*vnoise(p); p=p*2.03+17.1; a*=.5; } return s/.875; }
float fbm6(vec2 p){ float a=.5, s=0.; mat2 m=mat2(1.6,1.2,-1.2,1.6); for(int i=0;i<6;i++){ s+=a*vnoise(p); p=m*p+11.7; a*=.5; } return s/.984; }
`;

const WORD_GLSL = /* glsl */`
vec2 occlusion(vec3 p, vec3 L){ return vec2(0.0, 1.0); }
float occFlatten(vec2 base, float H){ return 0.0; }
`;

/* ---------- sky ---------- */
const skyUniforms = {
  uTime: { value: 0 }, uSunDir: { value: SKY_SUN }, uMoonDir: { value: MOON_DIR },
  uZenith: { value: PAL.zenith }, uHorizon: { value: PAL.horizon }, uHaze: { value: PAL.haze },
  uSunCol: { value: PAL.sun }, uSunDisk: { value: 1 }, uNight: { value: 0 }, uDusk: { value: 0 },
  uSkyMid: { value: PAL.skyMid }, uCloudLit: { value: PAL.cloudLit }, uCloudShade: { value: PAL.cloudShade }, uGlow: { value: PAL.glow },
};
const SKY_FRAG = /* glsl */`
uniform float uTime; uniform vec3 uSunDir, uMoonDir, uZenith, uHorizon, uHaze, uSunCol, uSkyMid, uCloudLit, uCloudShade, uGlow;
uniform float uSunDisk, uNight, uDusk;
varying vec3 vDir;
${NOISE}
vec3 sky(vec3 d){
  float y = max(d.y, 0.0);
  // three stops: the horizon, a coloured middle band (rose, violet at dusk), the zenith
  vec3 col = mix(uHorizon, uSkyMid, smoothstep(0.0, 0.28, pow(y, 0.8)));
  col = mix(col, uZenith, smoothstep(0.12, 0.85, pow(y, 0.7)));
  float sd = max(dot(d, uSunDir), 0.0);
  // on the sun's side the horizon burns; the glow spreads along it and fades upward
  vec2 hz = normalize(d.xz + 1e-5), sh = normalize(uSunDir.xz + 1e-5);
  float side = pow(max(dot(hz, sh), 0.0), 2.0);
  col += uGlow * (side * exp(-y * 7.0) * 1.1 + pow(sd, 8.0) * 0.8) * uDusk;
  col += uSunCol * (0.10*pow(sd, 5.0) + 0.35*pow(sd, 60.0)) * (1.0 - uNight);
  float cloudMask = 0.0;
  if(d.y > 0.0){
    vec2 p = d.xz / (d.y + 0.06) * 0.55 + vec2(uTime*0.006, uTime*0.0025);
    float n  = fbm6(p*1.1);
    float n2 = fbm6(p*1.1 + uSunDir.xz*0.06);
    float cov = smoothstep(0.60 - 0.06*uDusk, 0.86, n);
    float lit = clamp(0.5 + (n - n2)*7.0, 0.0, 1.0);
    // clouds carry the light: white by day, fired orange/rose from underneath at dusk, silver at night
    vec3 cc = mix(uCloudShade, uCloudLit, clamp(lit + 0.3*uDusk, 0.0, 1.0));
    float under = (1.0 - smoothstep(0.55, 0.92, n)) * (0.35 + 0.65*side);
    cc += uGlow * under * 1.5 * uDusk;
    cc += uSunCol * 0.9 * pow(sd, 10.0) * (1.0 - smoothstep(0.55,0.95,n)) * (1.0 - uNight);
    float fade = smoothstep(0.0, 0.22, d.y);
    col = mix(col, cc, cov * fade * 0.96);
    cloudMask = cov * fade;
    if(uNight > 0.01){
      vec3 q3 = d * 380.0; vec3 cell = floor(q3); vec3 fr = fract(q3) - 0.5;
      float h = fract(sin(dot(cell, vec3(127.1, 311.7, 74.7))) * 43758.5453);
      float star = step(0.982, h) * smoothstep(0.22, 0.0, length(fr)) * (0.4 + 0.6*fract(h*91.7));
      float tw = 0.65 + 0.35*sin(uTime*(1.5 + h*3.0) + h*60.0);
      col += vec3(0.86, 0.9, 1.0) * star * tw * 2.6 * uNight * smoothstep(0.03, 0.3, d.y) * (1.0 - cloudMask);
    }
  } else {
    col = mix(uHorizon, uHaze*0.55, smoothstep(0.0, 0.06, -d.y));
  }
  // the sun's disk by day and at dusk (bigger, deeper near the horizon); by night a cool moon
  float disk = smoothstep(0.99972 - 0.00022*uDusk, 0.99990 - 0.00012*uDusk, sd);
  float halo = pow(sd, 1400.0)*0.8 + pow(sd, 180.0)*0.2;
  col += uSunCol * ((18.0 - 6.0*uDusk) * disk + halo * 3.0) * uSunDisk * (1.0 - uNight) * (1.0 - cloudMask*0.6);
  float md = max(dot(d, uMoonDir), 0.0);
  float moon = smoothstep(0.99978, 0.99990, md);
  col += vec3(0.92, 0.95, 1.0) * uNight * (moon * 4.0 * (0.85 + 0.15*vnoise(d.xz*9000.0)) + pow(md, 380.0)*0.35 + pow(md, 24.0)*0.05) * (1.0 - cloudMask*0.8);
  return col;
}
void main(){
  gl_FragColor = vec4(sky(normalize(vDir)), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
const SKY_VERT = /* glsl */`
varying vec3 vDir;
void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`;

function makeSky(radius, u) {
  const m = new THREE.ShaderMaterial({ uniforms: u, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 32), m);
  mesh.frustumCulled = false; mesh.renderOrder = -10;
  return mesh;
}
const sky = makeSky(900, skyUniforms);
scene.add(sky);

const ease = (x) => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

const lerp = (a, b, t) => a + (b - a) * t;
// haze: shared by every material, so a scene can lift it ("understand" clears the air)
const FOG = { value: 0.0068 }, FOGK = { value: 1 };
// the pointer as a breeze over the meadow: ground x, z and the breeze's push (x, z); its reach in metres
const TOUCH = { value: new THREE.Vector4(0, 0, 0, 0) }, TOUCHR = { value: 0 };

/* ---------- ground ---------- */
const groundUniforms = {
  ...SEASON_U,
  uSunDir: { value: SUN_DIR }, uSunCol: { value: PAL.sun }, uSoil: { value: PAL.soil },
  uGrassMid: { value: PAL.grassMid }, uGrassTip: { value: PAL.grassTip }, uSkyAmb: { value: PAL.skyAmb },
  uFogCol: { value: PAL.horizon }, uFogDensity: FOG, uCamPos: { value: camera.position },
  
};
const groundMat = new THREE.ShaderMaterial({
  uniforms: groundUniforms,
  vertexShader: /* glsl */`
    varying vec3 vWorld;
    void main(){ vec4 w = modelMatrix * vec4(position,1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: /* glsl */`
    uniform vec3 uSunDir, uSunCol, uSoil, uGrassMid, uGrassTip, uSkyAmb, uFogCol, uCamPos; uniform float uFogDensity, uSnow;
    varying vec3 vWorld;
    ${NOISE}
    ${WORD_GLSL}
    void main(){
      vec2 p = vWorld.xz;
      float dist = length(vWorld - uCamPos);
      float n = fbm3(p*3.0), big = fbm3(p*0.08);
      // near: shadowed soil between blades. far: reads as a grass carpet seen at a grazing angle
      vec3 near = uSoil * (0.7 + 0.6*n);
      vec3 carpet = mix(uGrassMid, uGrassTip, 0.25 + 0.45*big) * (0.8 + 0.3*fbm3(p*0.9));
      float farT = smoothstep(4.0, 22.0, length(p));
      vec3 col = mix(near, carpet*0.8, farT);
      col = mix(col, vec3(0.82, 0.86, 0.9) * (0.9 + 0.1*n), uSnow * 0.85);
      vec2 o = occlusion(vWorld, uSunDir);
      float sunL = (1.0 - o.x*0.9) * o.y;
      vec3 lit = col * (uSkyAmb*0.55 + uSunCol*0.95*uSunDir.y*sunL) * mix(0.55, 1.0, farT);
      float fog = 1.0 - exp(-pow(dist*uFogDensity, 1.6));
      gl_FragColor = vec4(mix(lit, uFogCol, fog), 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
});
const ground = new THREE.Mesh(new THREE.CircleGeometry(700, 96).rotateX(-Math.PI / 2), groundMat);
scene.add(ground);

/* ---------- distant tree line: aerial perspective does the work ---------- */
function makeTreeLine() {
  const seg = 3000, rIn = 150;
  const pos = [], col = [], idx = [];
  const h = (a) => {
    let v = 0; // rolling hills + canopy lumps
    v += 4 * (0.5 + 0.5 * Math.sin(a * 3 + 1.3)) * (0.5 + 0.5 * Math.sin(a * 5.2 + 0.2));
    // round canopy crowns, not peaks
    v += 2.6 * Math.sqrt(Math.abs(Math.sin(a * 37 + Math.sin(a * 7)))) + 1.3 * Math.sqrt(Math.abs(Math.sin(a * 97 + 2.1))) + 0.6 * Math.sqrt(Math.abs(Math.sin(a * 211)));
    return 3 + v;
  };
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
    const r = rIn + 25 * Math.sin(a * 4 + 0.7);
    pos.push(ca * r, -1, sa * r, ca * r, h(a), sa * r);
    col.push(0, 0, 0, 1, 1, 1);
    if (i < seg) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aTop', new THREE.Float32BufferAttribute(col.filter((_, i) => i % 3 === 0), 1));
  g.setIndex(idx);
  const m = new THREE.ShaderMaterial({
    uniforms: { uFogCol: { value: PAL.horizon }, uDark: { value: PAL.tree }, uCamPos: { value: camera.position }, uSunDir: { value: SUN_DIR }, uFogK: FOGK },
    side: THREE.DoubleSide,
    vertexShader: /* glsl */`attribute float aTop; varying float vTop; varying vec3 vWorld;
      void main(){ vTop=aTop; vec4 w = modelMatrix*vec4(position,1.0); vWorld=w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: /* glsl */`uniform vec3 uFogCol, uDark, uCamPos, uSunDir; uniform float uFogK; varying float vTop; varying vec3 vWorld;
      ${NOISE}
      void main(){
        vec2 q = vec2(atan(vWorld.z, vWorld.x)*120.0, vWorld.y*0.9);
        float leaf = fbm3(q);
        vec3 c = uDark * (0.7 + 0.6*leaf) * (0.6 + 0.4*vTop);
        vec3 toSun = normalize(uSunDir); vec3 dir = normalize(vWorld - uCamPos);
        float back = pow(max(dot(dir, toSun), 0.0), 2.0);
        float d = length(vWorld.xz - uCamPos.xz);
        float fog = clamp((0.4 + d*0.0009 + back*0.12)*uFogK, 0.0, 0.85);
        gl_FragColor = vec4(mix(c, uFogCol, fog), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; return mesh;
}
scene.add(makeTreeLine());

/* ---------- grass ---------- */
const PATCH_R = 26;
function makeGrass(count) {
  const S = 7;
  const verts = [];
  for (let i = 0; i < S; i++) { const t = i / S; verts.push(-0.5, t, 0, 0.5, t, 0); }
  verts.push(0, 1, 0);
  const idx = [];
  for (let i = 0; i < S - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const last = (S - 1) * 2; idx.push(last, last + 1, S * 2);

  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setIndex(idx);
  const iPos = new Float32Array(count * 3), iShape = new Float32Array(count * 4);
  const rnd = mulberry32(7);
  for (let i = 0; i < count; i++) {
    // denser toward the centre, where the camera actually looks
    const u = rnd();
    const r = PATCH_R * Math.pow(u, 0.72);
    const a = rnd() * Math.PI * 2;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const grow = 1 + (r / PATCH_R) * 1.6;
    const patch = valueNoise2(x * 0.35, z * 0.35);
    iPos[i * 3] = x; iPos[i * 3 + 1] = z; iPos[i * 3 + 2] = rnd() * Math.PI * 2;
    iShape[i * 4] = (0.2 + 0.2 * patch + rnd() * 0.16) * (1 + (r / PATCH_R) * 0.5);
    iShape[i * 4 + 1] = (0.022 + rnd() * 0.02) * grow;
    iShape[i * 4 + 2] = (rnd() - 0.5) * 0.9;
    iShape[i * 4 + 3] = rnd();
  }
  const m = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 }, uWind: { value: reduceMotion ? 0.35 : 1 }, uClear: { value: 1.1 }, uTouch: TOUCH, uTouchR: TOUCHR,
      uSunDir: { value: SUN_DIR }, uSunCol: { value: PAL.sun }, uCamPos: { value: camera.position },
      uBase: { value: PAL.grassBase }, uMid: { value: PAL.grassMid }, uTip: { value: PAL.grassTip }, uDry: { value: PAL.grassDry }, ...SEASON_U,
      uTrans: { value: PAL.trans }, uSkyAmb: { value: PAL.skyAmb }, uFogCol: { value: PAL.horizon }, uFogDensity: FOG,
      
    },
    vertexShader: /* glsl */`
      uniform float uTime, uWind, uClear; uniform vec3 uSunDir, uCamPos; uniform vec4 uTouch; uniform float uTouchR;
      attribute vec3 iPos; attribute vec4 iShape;
      varying float vY, vRand, vShadow, vAO, vDry; varying vec3 vN, vWorld;
      ${NOISE}
      ${WORD_GLSL}
      void main(){
        float t = position.y, side = position.x;
        float Hraw = iShape.x;
        float H = Hraw * smoothstep(uClear*0.22, uClear, length(iPos.xy - uCamPos.xz));
        float W = iShape.y, lean = iShape.z, rnd = iShape.w;
        vec2 base = iPos.xy; float yaw = iPos.z;
        vec2 f = vec2(cos(yaw), sin(yaw));
        vec2 bd = vec2(-f.y, f.x);
        // wind: slow gust field rolling across the meadow + per-blade flutter
        vec2 wp = base*0.16 - vec2(uTime*0.28, uTime*0.13);
        float gust = fbm3(wp);
        float w = ((gust - 0.4)*1.5 + sin(uTime*2.1 + rnd*6.283 + base.x*0.8)*0.07) * uWind;
        vec2 windDir = normalize(vec2(1.0, 0.45));
        vec2 bend = bd*lean + windDir*w*0.85;
        // the pointer is a breeze: a wide, soft push along the way it moves, rippling a little
        if(uTouchR > 0.0){
          float dl = length(base - uTouch.xy);
          float kT = 1.0 - smoothstep(0.0, uTouchR, dl); kT *= kT;
          bend += uTouch.zw * kT * (0.8 + 0.2*sin(uTime*5.0 - dl*3.0 + rnd*2.0));
        }
        // the chrome form presses a nest into the grass
        H *= 1.0 - 0.72*occFlatten(base, H);
        float bl = length(bend); if(bl > 1.35) bend *= 1.35/bl;
        float t2 = t*t;
        vec2 horiz = bend * t2 * H * 0.95;
        float y = H * t * (1.0 - 0.28*t2*min(bl,1.35));
        float width = W * (1.0 - 0.8*pow(t, 1.4));
        vec3 pos = vec3(base.x + f.x*side*width + horiz.x, y, base.y + f.y*side*width + horiz.y);
        vec3 tw = vec3(f.x, 0.0, f.y);
        vec3 up = normalize(vec3(bend.x*1.9*t, 1.0, bend.y*1.9*t));
        vec3 n = normalize(cross(tw, up));
        vN = normalize(n + tw*side*1.1);
        vec2 o = occlusion(pos, uSunDir);
        vShadow = o.x; vAO = mix(0.3, 1.0, pow(t, 0.8)) * o.y;
        vY = t; vRand = rnd; vDry = smoothstep(0.55, 0.85, fbm3(base*0.22 + 4.0));
        vWorld = pos;
        gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uSunDir, uSunCol, uCamPos, uBase, uMid, uTip, uDry, uTrans, uSkyAmb, uFogCol; uniform float uFogDensity, uSnow;
      varying float vY, vRand, vShadow, vAO, vDry; varying vec3 vN, vWorld;
      void main(){
        vec3 col = mix(uBase, uMid, smoothstep(0.0, 0.5, vY));
        col = mix(col, uTip, smoothstep(0.35, 1.0, vY) * (0.55 + 0.45*vRand));
        col = mix(col, uDry*0.8, vDry * smoothstep(0.3, 1.0, vY) * (0.35 + 0.4*vRand));
        col *= 0.78 + 0.44*vRand;
        col = mix(col, vec3(0.86, 0.9, 0.95), uSnow * smoothstep(0.3, 1.0, vY) * (0.6 + 0.4*vRand));
        vec3 N = normalize(vN); if(!gl_FrontFacing) N = -N;
        vec3 V = normalize(uCamPos - vWorld);
        float ndl = dot(N, uSunDir);
        float diff = max(ndl, 0.0)*0.8 + 0.2;
        // light through the blade: backlit grass glows
        float thru = pow(clamp(dot(-V, uSunDir), 0.0, 1.0), 4.0)*1.1 + max(-ndl, 0.0)*0.45;
        vec3 Hh = normalize(V + uSunDir);
        float spec = pow(max(dot(N, Hh), 0.0), 48.0) * 0.22 * vY;
        float sunVis = 1.0 - vShadow*0.88;
        vec3 amb = uSkyAmb * (0.6 + 0.35*N.y);
        vec3 lit = col * (amb*vAO + uSunCol*(diff + thru*uTrans*vY)*sunVis*vAO) + uSunCol*spec*sunVis*vAO;
        float dist = length(vWorld - uCamPos);
        float fog = 1.0 - exp(-pow(dist*uFogDensity, 1.6));
        gl_FragColor = vec4(mix(lit, uFogCol, fog), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  // split the meadow into tiles: each is culled on its own, so a long lens or a look at the sky
  // only pays for the grass actually in frame
  const CELL = 5, group = new THREE.Group();
  const buckets = new Map();
  for (let k = 0; k < count; k++) {
    const key = Math.floor(iPos[k * 3] / CELL) + ',' + Math.floor(iPos[k * 3 + 1] / CELL);
    (buckets.get(key) || buckets.set(key, []).get(key)).push(k);
  }
  const posAttr = g.getAttribute('position'), index = g.getIndex();
  const lowIdx = [];
  for (const r of [0, 2, 4]) { const a = r * 2, b2 = (r + 2) * 2; lowIdx.push(a, a + 1, b2, a + 1, b2 + 1, b2); }
  lowIdx.push(12, 13, 14);
  const lowIndex = new THREE.Uint16BufferAttribute(lowIdx, 1);
  for (const [key, list] of buckets) {
    const [cx, cz] = key.split(',').map((v) => (parseInt(v, 10) + 0.5) * CELL);
    const tp = new Float32Array(list.length * 3), ts = new Float32Array(list.length * 4);
    list.forEach((k, j) => { tp.set(iPos.subarray(k * 3, k * 3 + 3), j * 3); ts.set(iShape.subarray(k * 4, k * 4 + 4), j * 4); });
    const cg = new THREE.InstancedBufferGeometry();
    cg.setAttribute('position', posAttr); cg.setIndex(index);
    cg.setAttribute('iPos', new THREE.InstancedBufferAttribute(tp, 3));
    cg.setAttribute('iShape', new THREE.InstancedBufferAttribute(ts, 4));
    cg.instanceCount = list.length;
    cg.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx, 0.35, cz), CELL * 0.72 + 1.3);
    const mesh = new THREE.Mesh(cg, m);
    mesh.userData = { full: list.length, center: new THREE.Vector2(cx, cz), hi: index, lo: lowIndex, isLo: false };
    group.add(mesh);
  }
  group.material = m;
  group.density = 1;
  // level of detail: full blades near the lens, half the segments and thinned out further away
  // (instances are in random order, so the first N of a tile are an even sample of it)
  group.updateLod = (cam) => {
    for (const t of group.children) {
      const u = t.userData, d = Math.hypot(u.center.x - cam.position.x, u.center.y - cam.position.z);
      const keep = (d < 9 ? 1 : d < 24 ? 1 - (d - 9) / 15 * 0.62 : 0.38) * group.density;
      t.geometry.instanceCount = Math.max(1, Math.floor(u.full * keep));
      const lo = d > 11;
      if (lo !== u.isLo) { t.geometry.setIndex(lo ? u.lo : u.hi); u.isLo = lo; }
    }
  };
  return group;
}

/* ---------- daisies ---------- */
function makeDaisyGeometry() {
  const pos = [], nor = [], col = [], idx = [];
  const white = new THREE.Color(1.0, 0.99, 0.96), yellow = C('#e3a51c'), green = C('#3b5f1b');
  let v = 0;
  const push = (x, y, z, c, nx = 0, ny = 1, nz = 0) => { pos.push(x, y, z); nor.push(nx, ny, nz); col.push(c.r, c.g, c.b); return v++; };
  const petals = 13;
  for (let p = 0; p < petals; p++) {
    const a = (p / petals) * Math.PI * 2 + (p % 2) * 0.05;
    const ca = Math.cos(a), sa = Math.sin(a);
    const len = 0.06 + ((p * 7) % 5) * 0.003, wd = 0.0105;
    const segs = 2, rowStart = v;
    for (let s = 0; s <= segs; s++) {
      const t = s / segs, r = 0.009 + len * t;
      const lift = 0.004 + t * t * 0.014 - (s === segs ? 0.004 : 0);
      const w = wd * Math.sin(Math.PI * Math.min(0.97, 0.18 + t * 0.82)) * (s === segs ? 0.35 : 1);
      const cx = ca * r, cz = sa * r, px = -sa * w, pz = ca * w;
      const tone = white.clone().multiplyScalar(0.86 + 0.14 * t);
      push(cx + px, lift, cz + pz, tone); push(cx - px, lift, cz - pz, tone);
    }
    for (let s = 0; s < segs; s++) { const a0 = rowStart + s * 2; idx.push(a0, a0 + 2, a0 + 1, a0 + 1, a0 + 2, a0 + 3); }
  }
  // disc florets: a small dome
  const ring = 8, rows = 2, c0 = v;
  push(0, 0.014, 0, yellow);
  for (let r = 1; r <= rows; r++) for (let k = 0; k < ring; k++) {
    const a = (k / ring) * Math.PI * 2, rr = 0.013 * r / rows, h = 0.014 * Math.cos((r / rows) * Math.PI / 2) + 0.003;
    push(Math.cos(a) * rr, h, Math.sin(a) * rr, yellow.clone().multiplyScalar(0.8 + 0.2 * (1 - r / rows)), Math.cos(a) * r / rows, 1, Math.sin(a) * r / rows);
  }
  for (let k = 0; k < ring; k++) idx.push(c0, c0 + 1 + k, c0 + 1 + ((k + 1) % ring));
  for (let r = 1; r < rows; r++) for (let k = 0; k < ring; k++) {
    const a0 = c0 + 1 + (r - 1) * ring + k, a1 = c0 + 1 + (r - 1) * ring + ((k + 1) % ring);
    const b0 = a0 + ring, b1 = a1 + ring; idx.push(a0, b0, a1, a1, b0, b1);
  }
  // stem: a thin ribbon down into the grass
  const sw = 0.0035, s0 = v;
  push(-sw, -0.45, 0, green, 0, 0, 1); push(sw, -0.45, 0, green, 0, 0, 1); push(-sw, 0.0, 0, green, 0, 0, 1); push(sw, 0.0, 0, green, 0, 0, 1);
  idx.push(s0, s0 + 1, s0 + 2, s0 + 1, s0 + 3, s0 + 2);
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}
function makeDaisies(count) {
  const g = makeDaisyGeometry();
  const iPos = new Float32Array(count * 4), iRot = new Float32Array(count * 3);
  const rnd = mulberry32(21);
  let n = 0, guard = 0;
  while (n < count && guard++ < count * 40) {
    const r = 16 * Math.sqrt(rnd()), a = rnd() * Math.PI * 2;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    // daisies grow in drifts, not evenly
    const drift = valueNoise2(x * 0.45 + 9, z * 0.45 - 3);
    if (rnd() > Math.pow(drift, 2.6) * 2.2) continue;
    iPos[n * 4] = x; iPos[n * 4 + 1] = z; iPos[n * 4 + 2] = 0.26 + rnd() * 0.2; iPos[n * 4 + 3] = 0.75 + rnd() * 0.5;
    iRot[n * 3] = rnd() * Math.PI * 2; iRot[n * 3 + 1] = (rnd() - 0.5) * 0.9; iRot[n * 3 + 2] = (rnd() - 0.5) * 0.9;
    n++;
  }
  g.setAttribute('iPos', new THREE.InstancedBufferAttribute(iPos, 4));
  g.setAttribute('iRot', new THREE.InstancedBufferAttribute(iRot, 3));
  g.instanceCount = n;
  const m = new THREE.ShaderMaterial({
    side: THREE.DoubleSide, vertexColors: true,
    uniforms: {
      uTime: { value: 0 }, uWind: { value: reduceMotion ? 0.35 : 1 }, uClear: { value: 1.1 }, uTouch: TOUCH, uTouchR: TOUCHR, ...SEASON_U, uSunDir: { value: SUN_DIR }, uSunCol: { value: PAL.sun },
      uSkyAmb: { value: PAL.skyAmb }, uCamPos: { value: camera.position }, uFogCol: { value: PAL.horizon }, uFogDensity: FOG,
      
    },
    vertexShader: /* glsl */`
      uniform float uTime, uWind, uClear, uBloom; uniform vec3 uSunDir, uCamPos; uniform vec4 uTouch; uniform float uTouchR;
      attribute vec4 iPos; attribute vec3 iRot;
      varying vec3 vCol, vN, vWorld; varying float vShadow;
      ${NOISE}
      ${WORD_GLSL}
      mat3 rotY(float a){ float c=cos(a), s=sin(a); return mat3(c,0,-s, 0,1,0, s,0,c); }
      mat3 rotX(float a){ float c=cos(a), s=sin(a); return mat3(1,0,0, 0,c,s, 0,-s,c); }
      mat3 rotZ(float a){ float c=cos(a), s=sin(a); return mat3(c,s,0, -s,c,0, 0,0,1); }
      void main(){
        vec2 base = iPos.xy; float H = iPos.z, S = iPos.w * smoothstep(uClear*0.3, uClear, length(iPos.xy - uCamPos.xz));
        vec2 wp = base*0.16 - vec2(uTime*0.28, uTime*0.13);
        float w = ((fbm3(wp) - 0.4)*1.5) * uWind;
        vec2 windDir = normalize(vec2(1.0, 0.45));
        vec2 sway = windDir * w * 0.12 + vec2(sin(uTime*1.7 + base.x*3.0), cos(uTime*1.3 + base.y*3.0))*0.006*uWind;
        vec2 push = vec2(0.0);
        if(uTouchR > 0.0){ float dl = length(base - uTouch.xy); float kT = 1.0 - smoothstep(0.0, uTouchR, dl); push = uTouch.zw * kT * kT * 0.14; }
        H *= 1.0 - 0.8*occFlatten(base, H);
        mat3 R = rotY(iRot.x) * rotX(iRot.y*0.6 + sway.y*2.0) * rotZ(iRot.z*0.6 - sway.x*2.0);
        vec3 local = position; float isStem = step(position.y, -0.001);
        local.y *= mix(1.0, H/0.45, isStem);
        vec3 p = R * (local * S);
        vec3 head = vec3(base.x + sway.x + push.x, H, base.y + sway.y + push.y);
        vec3 pos = head + p;
        vN = normalize(R * normal);
        vCol = color;
        vShadow = occlusion(pos, uSunDir).x;
        vWorld = pos;
        gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uSunDir, uSunCol, uSkyAmb, uCamPos, uFogCol; uniform float uFogDensity;
      varying vec3 vCol, vN, vWorld; varying float vShadow;
      void main(){
        vec3 N = normalize(vN); if(!gl_FrontFacing) N = -N;
        vec3 V = normalize(uCamPos - vWorld);
        float diff = max(dot(N, uSunDir), 0.0)*0.8 + 0.25;
        float thru = pow(clamp(dot(-V, uSunDir), 0.0, 1.0), 3.0)*0.6;
        vec3 lit = vCol * (uSkyAmb*0.7 + uSunCol*(diff*1.15 + thru)*(1.0 - vShadow*0.85));
        float dist = length(vWorld - uCamPos);
        float fog = 1.0 - exp(-pow(dist*uFogDensity, 1.6));
        gl_FragColor = vec4(mix(lit, uFogCol, fog), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.userData = { iPos, n }; return mesh;
}

const grass = makeGrass(Q.blades);
scene.add(grass);
const daisies = makeDaisies(Q.flowers);
scene.add(daisies);

/* ---------- fireflies: they come out with the dark ---------- */
function makeFireflies(n) {
  const pos = new Float32Array(n * 3), seed = new Float32Array(n);
  const rnd = mulberry32(333);
  for (let i = 0; i < n; i++) {
    // most drift where the camera looks: the hero meadow and the path through the grass
    const onPath = rnd() < 0.35;
    const x = onPath ? 0.84 + (rnd() - 0.5) * 5 : (rnd() - 0.5) * 30;
    const z = onPath ? 6 - rnd() * 12 : (rnd() - 0.5) * 30 - 2;
    pos.set([x, 0.15 + Math.pow(rnd(), 1.6) * 1.5, z], i * 3); seed[i] = rnd();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uNight: { value: 0 }, uScale: { value: 500 } },
    vertexShader: /* glsl */`
      uniform float uTime, uNight, uScale; attribute float aSeed; varying float vGlow;
      void main(){
        float s = aSeed * 6.2831;
        vec3 p = position + vec3(sin(uTime*0.23 + s)*0.9 + sin(uTime*0.61 + s*2.0)*0.25,
                                 sin(uTime*0.37 + s*3.0)*0.22,
                                 cos(uTime*0.19 + s)*0.9 + cos(uTime*0.53 + s*1.7)*0.25);
        // each one breathes on its own rhythm: long dark, a slow bloom
        float blink = pow(max(0.0, sin(uTime*(0.55 + aSeed*0.6) + s*5.0)), 2.5);
        vGlow = blink * uNight;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = uScale * 0.14 / -mv.z * (0.55 + 0.45*blink);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      varying float vGlow;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        float halo = smoothstep(0.5, 0.0, d), core = smoothstep(0.1, 0.0, d);
        vec3 c = vec3(1.0, 0.84, 0.38) * (halo*halo*halo*0.7 + core*3.5) * vGlow;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false; return pts;
}
const fireflies = makeFireflies(quality === 'low' ? 160 : 320);
scene.add(fireflies);

/* ---------- post: scene with a real depth buffer → depth of field → tone mapping ---------- */
const baseRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
baseRT.depthTexture = new THREE.DepthTexture(1, 1);
const composer = new EffectComposer(renderer, baseRT);
composer.renderTarget2.depthTexture = new THREE.DepthTexture(1, 1);
composer.renderTarget1.depthTexture = baseRT.depthTexture;
// the scene is rendered into the window's rectangle only: tight frustum (so off-frame grass is culled) and no wasted pixels
class WindowRenderPass extends RenderPass {
  constructor(sc, cam) { super(sc, cam); this.win = new THREE.Vector4(0, 0, 1, 1); this.pad = new THREE.Vector4(0, 0, 1, 1); }
  render(renderer, writeBuffer, readBuffer, dt, mask) {
    readBuffer.viewport.copy(this.win); readBuffer.scissor.copy(this.win); readBuffer.scissorTest = true;
    super.render(renderer, writeBuffer, readBuffer, dt, mask);
    readBuffer.viewport.set(0, 0, readBuffer.width, readBuffer.height);
    for (const rt of [readBuffer, writeBuffer]) { rt.scissor.copy(this.pad); rt.scissorTest = true; }
  }
}
const scenePass = new WindowRenderPass(scene, camera);
composer.addPass(scenePass);
const dof = new DofPass(camera);
composer.addPass(dof);
composer.addPass(new OutputPass());

/* ---------- the shots: one per section ---------- */
const pointer = { x: 0, y: 0, sx: 0, sy: 0, cx: -1, cy: -1, t: 0 };
const winNow = { x: 0, y: 0, w: 1, h: 1 };
addEventListener('pointermove', (e) => { pointer.x = e.clientX / innerWidth * 2 - 1; pointer.y = e.clientY / innerHeight * 2 - 1; pointer.cx = e.clientX; pointer.cy = e.clientY; pointer.t = performance.now(); }, { passive: true });
document.addEventListener('pointerleave', () => { pointer.t = 0; });
const _p = new THREE.Vector3(), _t = new THREE.Vector3();
const FOCUS = new THREE.Vector3(0, 0.3, 0);
const vfovFor = (hfovDeg, aspect, maxV) => Math.min(maxV, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(hfovDeg) / 2) / aspect)));
const SUN_AZ = Math.atan2(SUN_DIR.x, SUN_DIR.z);
let rack = 0, rackTarget = 0;
const still = qs.has('still');
const drift = (time, amt) => (reduceMotion || still) ? 0 : Math.sin(time * 0.06) * amt;

// one spot in the meadow, one journey: every shot starts where the last one ends
const SPOT = new THREE.Vector3(0.84, 0.95, 5.5);
const breathe = (time, amt) => (reduceMotion || still) ? 0 : Math.sin(time * 0.05) * amt;
// aim so the horizon sits at a given height of the frame (0 top, 1 bottom), whatever its shape
function horizonAt(out, pos, dx, dz, fovDeg, frac) {
  const pitch = THREE.MathUtils.degToRad((frac - 0.5) * fovDeg);
  const d = Math.hypot(dx, dz) || 1;
  return out.set(pos.x + dx, pos.y + Math.tan(pitch) * d, pos.z + dz);
}
/* about: keyframed. each key is held while its phrase is on screen, and eased between */
let HERO_DAISY = null;
function heroDaisy() {
  if (HERO_DAISY) return HERO_DAISY;
  const { iPos, n } = daisies.userData;
  let best = null, score = 1e9;
  for (let k = 0; k < n; k++) {
    const dx = iPos[k * 4] - SPOT.x, dz = iPos[k * 4 + 1] - SPOT.z, d = Math.hypot(dx, dz);
    if (dz > -1 || d < 1.8 || d > 3.4) continue;
    const sc = Math.abs(dx + 0.35) * 2 + Math.abs(d - 2.4) * 0.5 - iPos[k * 4 + 2] * 6;   // near the line of sight, tall
    if (sc < score) { score = sc; best = k; }
  }
  HERO_DAISY = best === null ? new THREE.Vector3(SPOT.x - 0.4, 0.4, SPOT.z - 2.4)
    : new THREE.Vector3(iPos[best * 4], iPos[best * 4 + 2] + 0.012, iPos[best * 4 + 1]);
  return HERO_DAISY;
}
const _k = new THREE.Vector3(), _kt = new THREE.Vector3(), _endP = new THREE.Vector3(), _endT = new THREE.Vector3();
const ABOUT_KEYS = [
  // I'm Conrado … all three at once: one still frame, looking down over the field. The words do the
  // work; the only thing that moves is the meadow itself, and the visitor's own breeze
  { at: [0, 0.5], f: (v, time) => ({ p: [SPOT.x - 2.5, 5.2 + breathe(time, 0.04), SPOT.z + 2.2], t: [SPOT.x - 2.2 + breathe(time + 4, 0.08), -1.4, SPOT.z - 8], h: 72, focus: 10, ap: 0, clear: 1.2 }) },
  // care / understand: one scene for the whole passage. Low in the grass, into golden light, easing
  // forward; on "understand" the focus pulls from the nearest blades all the way to the trees.
  // It ends rising, ready to lift into the sky of the timeline, where the day carries on from this light.
  { at: [0.58, 1], f: (v, time) => { const r = easeIO(smooth(0.1, 0.3, v));
    return { p: [lerp(SPOT.x - 1.2, SPOT.x - 0.6, v), 0.5 + 0.15 * v, lerp(SPOT.z - 3.4, SPOT.z - 7, v)],
      t: [lerp(SPOT.x - 9, SPOT.x - 5, v), 1.1 + breathe(time, 0.05), lerp(SPOT.z - 14, SPOT.z - 18, v)],
      h: 52, focus: lerp(1.1, 30, r * r), ap: lerp(1.1, 0.12, r), clear: 0.2 }; } },
];
function keyState(key, u, time) {
  const v = clamp01((u - key.at[0]) / Math.max(1e-4, key.at[1] - key.at[0]));
  return key.f(v, time);
}
function aboutShot(u, time, aspect) {
  let i = 0; while (i < ABOUT_KEYS.length - 1 && u >= ABOUT_KEYS[i + 1].at[0]) i++;
  const A = keyState(ABOUT_KEYS[i], u, time);
  let S = A;
  const nx = ABOUT_KEYS[i + 1];
  if (nx && u > ABOUT_KEYS[i].at[1]) {
    const e = easeIO(clamp01((u - ABOUT_KEYS[i].at[1]) / (nx.at[0] - ABOUT_KEYS[i].at[1])));
    const B = keyState(nx, u, time);
    S = { p: A.p.map((q, j) => lerp(q, B.p[j], e)), t: A.t.map((q, j) => lerp(q, B.t[j], e)), h: lerp(A.h, B.h, e),
      focus: Math.exp(lerp(Math.log(A.focus), Math.log(B.focus), e)), ap: lerp(A.ap, B.ap, e), clear: lerp(A.clear, B.clear, e) };
  }
  // the last stretch of About glides into the timeline's own frame, so the section ends exactly where
  // the next one begins and the hand-over itself has nothing left to move
  const L = easeIO(smooth(0.84, 1, u));
  let fov = vfovFor(S.h, aspect, S.h * 0.75);
  if (L > 0) {
    const T = SHOTS.track(0, time, aspect);
    _endP.copy(T.pos); _endT.copy(T.target);
    _p.set(...S.p).lerp(_endP, L); _t.set(...S.t).lerp(_endT, L);
    return { pos: _p, target: _t, fov: lerp(fov, T.fov, L), focus: Math.exp(lerp(Math.log(S.focus), Math.log(T.focus), L)),
      aperture: lerp(S.ap, T.aperture, L), clear: lerp(S.clear, T.clear, L) };
  }
  _p.set(...S.p); _t.set(...S.t);
  return { pos: _p, target: _t, fov, focus: S.focus, aperture: S.ap, clear: S.clear };
}
const SHOTS = {
  // hero: standing in the meadow, looking out. Still, apart from a slow breath.
  garden: (local, time, aspect) => {
    _p.copy(SPOT); _p.y += breathe(time + 2, 0.03);
    const fov = vfovFor(64, aspect, 52);
    _t.set(SPOT.x - 0.9 + breathe(time, 0.25) + pointer.sx * 0.15, 1.12, SPOT.z - 5.6);
    // as the window closes around the intro row, the horizon drops below the words
    if (heroK > 0) { horizonAt(_k, _p, _t.x - _p.x, -40, fov, heroHorizon); _t.lerp(_k, easeIO(heroK)); }
    return { pos: _p, target: _t, fov, focus: 10, aperture: 0, clear: 1.1 };
  },
  // work: the same spot, a long lens toward the horizon; hovering a project pulls focus to the flowers in front
  // work: the window is the selected project's card; each project looks at its own slice of the meadow
  view: (local, time, aspect) => {
    // each project is one step of the climb toward About's view down over the field
    const k = workStep(), e = easeIO(k);
    _p.set(lerp(SPOT.x, SPOT.x - 2.5, e), lerp(SPOT.y - 0.1, 5.2, e), lerp(SPOT.z, SPOT.z + 2.2, e));
    _t.set(lerp(SPOT.x - 1.2, SPOT.x - 2.2, k) + breathe(time, 0.3 * (1 - k)), lerp(0.3, -1.4, k), lerp(SPOT.z - 40, SPOT.z - 8, k));
    const hf = lerp(lerp(30, 64, clamp01((aspect - 1.2) / 4)), 72, k);
    return { pos: _p, target: _t, fov: vfovFor(hf, aspect, lerp(30, 54, k)), focus: lerp(16, 10, k), aperture: lerp(1.6, 0, k), clear: lerp(0.5, 1.2, k) };
  },
  // about: every phrase gets its own camera. identity = one flower, singled out by focus;
  // information = rise until the flowers read as a pattern; motion = the gust, tracked across;
  // care = lean in toward warm light; understand = rise into a wide, sharp, clear view
  about: (local, time, aspect) => aboutShot(local, time, aspect),
  // experience: from where you rose, look up; the sky holds the timeline while the day passes
  track: (local, time, aspect) => {
    _p.set(SPOT.x + Math.sin(3.0) * 0.3, 1.35, SPOT.z - 9);
    const fov = vfovFor(74, aspect, 48);
    return { pos: _p, target: horizonAt(_t, _p, 0.8, -40, fov, 0.74), fov, focus: 10, aperture: 0, clear: 1.2 };
  },
  // education & tools: the long lens again, toward the far meadow
  tools: (local, time, aspect) => {
    _p.set(SPOT.x + Math.sin(3.0) * 0.3, 1.0, SPOT.z - 9);
    return { pos: _p, target: _t.set(_p.x + 9 + breathe(time, 0.4), 0.35, _p.z - 40),
      fov: vfovFor(26, aspect, 24), focus: 16, aperture: 2.2, clear: 0.5 };
  },
  // contact: step forward and sink into the grass; walk through it at blade height, focus on the
  // nearest blades, the sky showing through the gaps. The address waits in the middle of it.
  contact: (local, time, aspect) => {
    const u = local, d = easeIO(smooth(0, 0.42, u));
    const x0 = SPOT.x + Math.sin(3.0) * 0.3, z0 = SPOT.z - 9;
    const z = z0 - u * 3.2, x = x0 - 0.5 * d + Math.sin(u * 3.0) * 0.25 + breathe(time, 0.05);
    const y = lerp(1.0, 0.13, d) + breathe(time + 1, 0.012);
    _p.set(x, y, z);
    const pitch = lerp(-0.12, 0.22, d);
    return { pos: _p, target: _t.set(x - 0.08 + breathe(time + 3, 0.06), y + pitch, z - 1), fov: vfovFor(84, aspect, 56),
      focus: lerp(30, 0.45, d * d), aperture: lerp(0, 0.75, d), clear: lerp(0.8, 0.09, d) };
  },
};

/* ---------- the window: pinned to the screen, one rectangle per section ---------- */
const R = 14; // one corner radius for every state
/* how the window travels between two shapes: the edge heading the way it's going leaves first and the
   trailing edge follows, so it stretches like something liquid, and at the midpoint it draws in a
   little and softens its corners, like a breath, before settling into the new shape */
let morphP = 0;
function morph(A, B, u) {
  u = clamp01(u);
  if (u <= 0) return { ...A }; if (u >= 1) return { ...B };
  // Two states with the same rectangle (About into Experience, say) have nothing
  // to travel between. Without this the breath still plays, and a window that
  // pinches and rounds itself while standing still reads as a glitch, not a move.
  if (Math.abs(A.x - B.x) < 1.5 && Math.abs(A.y - B.y) < 1.5 &&
      Math.abs(A.w - B.w) < 1.5 && Math.abs(A.h - B.h) < 1.5) return { ...B };
  const lead = easeIO(clamp01(u / 0.7)), lag = easeIO(clamp01((u - 0.3) / 0.7)), mid = easeIO(u);
  const dy = (B.y + B.h / 2) - (A.y + A.h / 2), dx = (B.x + B.w / 2) - (A.x + A.w / 2);
  const pick = (d, move) => Math.abs(d) < 2 ? mid : (Math.sign(move) === Math.sign(d) ? lead : lag);
  const y0 = lerp(A.y, B.y, pick(dy, B.y - A.y)), y1 = lerp(A.y + A.h, B.y + B.h, pick(dy, B.y + B.h - A.y - A.h));
  const x0 = lerp(A.x, B.x, pick(dx, B.x - A.x)), x1 = lerp(A.x + A.w, B.x + B.w, pick(dx, B.x + B.w - A.x - A.w));
  const p = Math.sin(Math.PI * u), inset = p * Math.min(18, (x1 - x0) * 0.02);
  morphP = Math.max(morphP, p);
  return { x: x0 + inset, y: y0, w: Math.max(1, x1 - x0 - 2 * inset), h: Math.max(1, y1 - y0) };
}
function windowFor(id, W, H) {
  const pad = Math.max(20, Math.min(56, W * 0.04)), top = 68;
  const narrow = W < 820;
  // one band under every window: the footer and the day/night button live in it
  const bottom = H - (narrow ? 64 : 76);
  const full = { x: pad, y: top, w: W - 2 * pad, h: bottom - top };
  const right = narrow ? { x: pad, y: top, w: W - 2 * pad, h: H * 0.36 } : { x: W * 0.56, y: top, w: W * 0.44 - pad, h: bottom - top };
  switch (id) {
    case 'garden': {
      const band = { x: pad, y: top, w: W - 2 * pad, h: H * (narrow ? 0.5 : 0.6) - top };
      // scrolling on, the window closes around the intro row and gives it a moment of its own
      if (heroK <= 0 || !heroBox.h) return band;
      // tall enough below the words for the meadow: the words sit in the sky, the grass beneath them
      const m = narrow ? 22 : 34, below = Math.max(narrow ? 120 : 150, H * (narrow ? 0.17 : 0.22));
      const f = { x: pad, y: heroBox.y - m, w: W - 2 * pad, h: heroBox.h + m + below };
      heroHorizon = Math.min(0.9, (m + heroBox.h + below * 0.3) / f.h);
      return morph(band, f, heroK);
    }
    case 'view':    return workRect(W, H) || right;
    case 'about':   return full;
    case 'track':   return full;
    case 'tools':   return right;
    case 'contact': return full;
  }
  return full;
}

/* ---------- smooth scroll: both text layers and the window move in the same frame ---------- */
const layers = [...document.querySelectorAll('[data-layer]')];
const scrollers = layers.map((l) => l.querySelector('[data-scroller]'));
const spacer = document.querySelector('[data-spacer]');
const inkLayer = layers.find((l) => l.dataset.layer === 'ink');
const lightLayer = layers.find((l) => l.dataset.layer === 'light');
let sections = [], snaps = [];
/* ---------- work: the window becomes the selected project's card ---------- */
const workRows = [...scrollers[0].querySelectorAll('.s-work .index__row')];
const workPans = workRows.map((r) => parseFloat(r.dataset.pan || 0));
let hoverRow = -1, sel = -1;
/* ---------- where you are: the section's name in the band under the window ---------- */
const stageEl = document.querySelector('[data-stage]');
const stageName = stageEl && stageEl.querySelector('[data-stage-name]');
const stageMeta = stageEl && stageEl.querySelector('[data-stage-meta]');
let stageKey = null, stageSwap = 0;
function setStage(label, meta) {
  if (!stageEl) return;
  const key = label + '|' + meta;
  if (key === stageKey) return;
  stageKey = key;
  const wasIn = stageEl.classList.contains('is-in');
  stageEl.classList.remove('is-in');
  clearTimeout(stageSwap);
  const apply = () => {
    stageName.textContent = label; stageMeta.textContent = meta;
    if (label || meta) stageEl.classList.add('is-in');
  };
  // let the old name fade out before the new one takes its place
  if (wasIn) stageSwap = setTimeout(apply, 340); else apply();
}

const heroFoot = scrollers[0].querySelector('.s-hero .hero__foot');
const heroBox = { y: 0, h: 0 }; let heroK = 0, heroSnap = 0, heroHorizon = 0.75;
let heroDt = 0.016;
function stepHero() {
  if (!heroFoot || cur > innerHeight * 2.2) return;
  const b = heroFoot.getBoundingClientRect(); heroBox.y = b.top; heroBox.h = b.height;
  // scroll sets where it's heading; the window follows with a little weight of its own
  const k = heroSnap > 0 ? clamp01((cur - heroSnap * 0.15) / (heroSnap * 0.85)) : 0;
  heroK = (still || reduceMotion) ? k : heroK + (k - heroK) * (1 - Math.exp(-heroDt * 5));
}
const workBoxes = workRows.map(() => ({ x: 0, y: 0, w: 0, h: 0 }));
function stepWork(dt) {
  if (!workRows.length) return;
  const H = innerHeight, vs = sections.find((q) => q.id === 'view');
  if (vs && (cur < vs.top - 1.5 * H || cur > vs.top + vs.h + 0.5 * H) && sel >= 0) return;   // off stage: no layout reads
  let best = 0, bd = 1e9;
  workRows.forEach((r, i) => {
    const b = r.getBoundingClientRect(), o = workBoxes[i];
    o.x = b.left; o.y = b.top; o.w = b.width; o.h = b.height;
    const d = Math.abs(b.top + b.height / 2 - H * 0.5);
    if (d < bd) { bd = d; best = i; }
  });
  const target = hoverRow >= 0 ? hoverRow : best;
  if (sel < 0 || reduceMotion || still) sel = target;
  else { sel += (target - sel) * (1 - Math.exp(-dt * 11)); if (Math.abs(target - sel) < 0.002) sel = target; }
}
function workRect() {
  if (sel < 0 || !workRows.length) return null;
  const i0 = Math.floor(sel), i1 = Math.min(workRows.length - 1, i0 + 1), f = sel - i0;
  const a = workBoxes[i0], b = workBoxes[i1];
  return morph(a, b, f);
}
function workStep() { return sel < 0 || workRows.length < 2 ? 0 : clamp01(sel / (workRows.length - 1)); }
function measure() {
  const sc = scrollers[0];
  spacer.style.height = sc.scrollHeight + 'px';
  sections = [...sc.querySelectorAll('[data-shot]')].map((el) => ({ id: el.dataset.shot, top: el.offsetTop, h: el.offsetHeight, pinned: el.hasAttribute('data-pinned'), lead: parseFloat(el.dataset.lead || 0), label: el.dataset.label || '', meta: el.dataset.meta || '' }));
  // where each section looks best: pinned sections at their start, others with their heading just under the nav
  snaps = [...sc.querySelectorAll('[data-shot]')].map((el) => {
    if (el.hasAttribute('data-snap-end')) return Math.max(0, el.offsetTop + el.offsetHeight - innerHeight);
    const a = el.querySelector('[data-snap]');
    return Math.max(0, a ? el.offsetTop + a.offsetTop - 92 : el.offsetTop);
  });
  // the year: as big as the room between the list and the window's bottom edge allows
  const tl = sc.querySelector('.s-exp .tl'), pinEl = sc.querySelector('.s-exp [data-pin]'), yr = sc.querySelector('.s-exp .year');
  if (tl && pinEl && yr) {
    const H = innerHeight, band = innerWidth < 820 ? 64 : 76;
    const gap = parseFloat(getComputedStyle(yr).bottom) || band + 24;
    const room = H - gap - (tl.getBoundingClientRect().bottom - pinEl.getBoundingClientRect().top) - 18;
    root.style.setProperty('--year-size', Math.round(Math.min(136, Math.max(40, room / 0.9), innerWidth * 0.1)) + 'px');
  }
  // the intro row is a stop: its middle on the middle of the screen
  if (heroFoot) { const b = heroFoot.getBoundingClientRect(); heroSnap = Math.max(0, b.top + cur + b.height / 2 - innerHeight * 0.5); snaps.push(heroSnap); }
  // each project card is a stop of its own: its middle on the middle of the screen
  for (const r of workRows) { const b = r.getBoundingClientRect(); snaps.push(Math.max(0, b.top + cur + b.height / 2 - innerHeight * 0.5)); }
  snaps.sort((a, b) => a - b);
}
new ResizeObserver(measure).observe(scrollers[0]);
document.fonts?.ready.then(measure);
measure();
let cur = 0, lastTf = '';
const maxScroll = () => Math.max(1, scrollers[0].scrollHeight - innerHeight);
function updateScroll(dt) {
  const goal = still && qs.has('y') ? Math.min(parseFloat(qs.get('y')), maxScroll()) : scrollY;
  cur += (goal - cur) * (still || reduceMotion ? 1 : 1 - Math.exp(-dt * 9));
  if (Math.abs(goal - cur) < 0.05) cur = goal;
  const tf = `translate3d(0, ${(-cur).toFixed(2)}px, 0)`;
  if (tf === lastTf) return;
  lastTf = tf;
  for (const s of scrollers) s.style.transform = tf;
}
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#"]'); if (!a) return;
  const el = scrollers[0].querySelector(a.getAttribute('href')); if (!el) return;
  e.preventDefault(); scrollTo({ top: el.hasAttribute('data-snap-end') ? el.offsetTop + el.offsetHeight - innerHeight : el.offsetTop, behavior: reduceMotion ? 'auto' : 'smooth' });
});
document.querySelectorAll('.s-work .index__row').forEach((row) => {
  const i = [...row.parentNode.children].indexOf(row);
  const on = () => { hoverRow = i; }, off = () => { if (hoverRow === i) hoverRow = -1; };
  row.addEventListener('pointerenter', on); row.addEventListener('focusin', on);
  row.addEventListener('pointerleave', off); row.addEventListener('focusout', off);
});
// scrolling hands the choice back to the page (a touch "hover" shouldn't stick)
addEventListener('scroll', () => { if (hoverRow >= 0 && performance.now() - pointer.t > 250) hoverRow = -1; }, { passive: true });

const easeIO = (x) => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
const _pa = new THREE.Vector3(), _ta = new THREE.Vector3(), _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();
let shotName = '', lastInset = '';
let progress = () => 0;
let stage = -1; // which section's state is showing; fractional while switching
function direct(time, dt) {
  const W = canvas.clientWidth, H = canvas.clientHeight;
  // each state holds until the next section reaches the middle of the screen, then the window
  // and the camera switch to it in about half a second (and back, the same way)
  let target = 0;
  for (let k = 0; k < sections.length; k++) if (cur >= sections[k].top - H * 0.5) target = k;
  if (stage < 0 || still || reduceMotion) stage = target;
  else { stage += (target - stage) * (1 - Math.exp(-dt * 6.5)); if (Math.abs(target - stage) < 0.002) stage = target; }
  const i0 = Math.floor(stage), i1 = Math.min(sections.length - 1, i0 + 1);
  const a = sections[i0], b = stage === i0 ? a : sections[i1];
  const t = stage === i0 ? 1 : easeIO(stage - i0);
  // data-lead: the story starts that many screens before the section pins (the moment its shot takes over)
  const local = (s) => s.pinned ? clamp01((cur - s.top + s.lead * H) / Math.max(1, s.h - H + s.lead * H)) : clamp01((cur - s.top + H) / (s.h + H));
  progress = (id) => { const s = sections.find((q) => q.id === id); return s ? local(s) : 0; };
  const A = windowFor(a.id, W, H), B = windowFor(b.id, W, H);
  const win = stage === i0 ? { ...B } : morph(A, B, stage - i0);
  const aspect = win.w / Math.max(1, win.h);
  winNow.x = win.x; winNow.y = win.y; winNow.w = win.w; winNow.h = win.h;
  // both shots stay live through the change
  const sb = SHOTS[b.id](local(b), time, aspect);
  _pa.copy(sb.pos); _ta.copy(sb.target);
  let { fov, focus, aperture, clear } = sb;
  camera.up.set(0, 1, 0);
  camera.position.copy(_pa); camera.lookAt(_ta); _qb.copy(camera.quaternion);
  if (t < 1) {
    const sa = SHOTS[a.id](local(a), time, aspect);
    camera.position.copy(sa.pos); camera.lookAt(sa.target); _qa.copy(camera.quaternion);
    _pa.lerpVectors(sa.pos, _pa, t);
    camera.quaternion.slerpQuaternions(_qa, _qb, t);
    fov = lerp(sa.fov, fov, t); focus = lerp(sa.focus, focus, t); aperture = lerp(sa.aperture, aperture, t); clear = lerp(sa.clear, clear, t);
  } else camera.quaternion.copy(_qb);
  shotName = t < 1 ? `${a.id} → ${b.id} ${(t * 100) | 0}%` : b.id;
  { const cs = t < 0.5 ? a : b; setStage(cs.label, cs.meta); }
  camera.position.copy(_pa);
  camera.fov = fov; camera.aspect = aspect;
  camera.updateProjectionMatrix();
  dof.focus = focus; dof.aperture = aperture;
  grass.material.uniforms.uClear.value = clear;
  daisies.material.uniforms.uClear.value = clear;
  // the window in render-target pixels (measured from the real target, whatever the resolution)
  const k = composer.renderTarget1.width / Math.max(1, W), RH = composer.renderTarget1.height;
  const wx = Math.floor(win.x * k), wy = Math.floor((H - win.y - win.h) * k), ww = Math.ceil(win.w * k), wh = Math.ceil(win.h * k);
  scenePass.win.set(wx, wy, ww, wh);
  fireflies.material.uniforms.uScale.value = wh / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2));
  const m = Math.ceil(24 * k);
  scenePass.pad.set(Math.max(0, wx - m), Math.max(0, wy - m), ww + 2 * m, wh + 2 * m);
  dof.clamp.set((wx + 1.5) / composer.renderTarget1.width, (wy + 1.5) / RH, (wx + ww - 1.5) / composer.renderTarget1.width, (wy + wh - 1.5) / RH);
  // one shape, three uses: the scene shows inside it, light text inside it, ink text outside it
  const r = Math.min(R + 20 * morphP, win.w / 2, win.h / 2);
  morphP = 0;
  const inset = `inset(${win.y.toFixed(1)}px ${(W - win.x - win.w).toFixed(1)}px ${(H - win.y - win.h).toFixed(1)}px ${win.x.toFixed(1)}px round ${r}px)`;
  if (inset === lastInset) return;
  lastInset = inset;
  canvas.style.clipPath = inset;
  lightLayer.style.clipPath = inset;
  const x0 = win.x, y0 = win.y, x1 = win.x + win.w, y1 = win.y + win.h;
  inkLayer.style.clipPath = `path(evenodd, "M0 0H${W}V${H}H0Z M${x0 + r} ${y0}H${x1 - r}A${r} ${r} 0 0 1 ${x1} ${y0 + r}V${y1 - r}A${r} ${r} 0 0 1 ${x1 - r} ${y1}H${x0 + r}A${r} ${r} 0 0 1 ${x0} ${y1 - r}V${y0 + r}A${r} ${r} 0 0 1 ${x0 + r} ${y0}Z")`;
}

/* ---------- touch: one ray from the pointer to the ground per frame; the shaders do the rest ---------- */
const _ray = new THREE.Vector3(), _hit = new THREE.Vector2(), _last = new THREE.Vector2(), _wind = new THREE.Vector2();
let touchHas = false, touchR = 2;
function touch(dt) {
  const inside = pointer.cx >= winNow.x && pointer.cx <= winNow.x + winNow.w && pointer.cy >= winNow.y && pointer.cy <= winNow.y + winNow.h;
  let gx = 0, gz = 0, on = false;
  if (inside && performance.now() - pointer.t < 400) {
    const nx = (pointer.cx - winNow.x) / winNow.w * 2 - 1, ny = -((pointer.cy - winNow.y) / winNow.h * 2 - 1);
    _ray.set(nx, ny, 0.5).unproject(camera).sub(camera.position).normalize();
    if (_ray.y < -0.02) {
      const d = -camera.position.y / _ray.y;
      if (d < 40) { gx = camera.position.x + _ray.x * d; gz = camera.position.z + _ray.z * d; on = true; touchR = Math.min(4.5, Math.max(0.9, 0.5 + d * 0.22)); }
    }
  }
  // the breeze follows the pointer's movement over the ground, and dies down when it stops
  if (on) {
    if (!touchHas) { _last.set(gx, gz); _hit.set(gx, gz); touchHas = true; }
    const vx = (gx - _last.x) / Math.max(dt, 1e-3), vz = (gz - _last.y) / Math.max(dt, 1e-3);
    _last.set(gx, gz);
    // GAIN is how hard the pointer leans on the grass; CAP is how fast a swipe can
    // get before it stops counting for more. Both were raised about 40% from the
    // first pass, which was legible but easy to miss.
    const sp = Math.hypot(vx, vz), cap = touchR * 1.9, k = sp > cap ? cap / sp : 1;
    _wind.x += (vx * k / touchR * 0.78 - _wind.x) * (1 - Math.exp(-dt * 6));
    _wind.y += (vz * k / touchR * 0.78 - _wind.y) * (1 - Math.exp(-dt * 6));
    _hit.x += (gx - _hit.x) * (1 - Math.exp(-dt * 8)); _hit.y += (gz - _hit.y) * (1 - Math.exp(-dt * 8));
  } else {
    touchHas = false;
    _wind.multiplyScalar(Math.exp(-dt * 2.5));
  }
  const wl = _wind.length();
  if (wl > 1.25) _wind.multiplyScalar(1.25 / wl);   // ceiling, so a fast swipe never flattens the field
  TOUCH.value.set(_hit.x, _hit.y, _wind.x, _wind.y);
  TOUCHR.value = wl > 0.004 ? touchR : 0;   // 0 = the shaders skip it entirely
}

/* ---------- choreography: pinned stages, text beats, the timeline, the wind ---------- */
// [data-pin] holds still inside its section while the section scrolls past (both text copies)
const pins = [...document.querySelectorAll('[data-pin]')];
// [data-in] / [data-out]: appear (and leave) at a point of the section's progress; text comes into focus as it arrives
const beats = [...document.querySelectorAll('[data-in]')].map((el) => ({ el, id: el.closest('[data-shot]').dataset.shot,
  a: parseFloat(el.dataset.in), b: el.dataset.out ? parseFloat(el.dataset.out) : 9, noBlur: el.classList.contains('scrim'),
  // data-slide="left": comes in from the side instead of rising, for blocks that
  // arrive with a change of shot rather than with the reader's scroll
  x: el.dataset.slide === 'left',
  // how much scroll the arrival takes; a short plain section needs a longer
  // window than a 520vh pinned one for the same move to read as a fade
  sp: parseFloat(el.dataset.span || 0.05) }));
const bars = [...document.querySelectorAll('[data-bar]')].map((el) => ({ el, l: parseFloat(el.dataset.l), w: parseFloat(el.dataset.w) }));
const rows = [...document.querySelectorAll('[data-row]')].map((el) => ({ el, l: parseFloat(el.dataset.row) }));
const years = [...document.querySelectorAll('[data-year]')];
const heads = [...document.querySelectorAll('[data-playhead]')];
let lastYear = '';
// the timeline's year range comes from the markup (<div class="tl" data-from data-to>), so it can grow without code changes
const tlEl = document.querySelector('[data-scroller] .s-exp .tl');
const AXIS = { from: parseFloat(tlEl?.dataset.from || 2017.5), to: parseFloat(tlEl?.dataset.to || 2027) };
AXIS.first = Math.ceil(AXIS.from); AXIS.last = Math.min(new Date().getFullYear(), Math.ceil(AXIS.to) - 1);
const scrims = [...document.querySelectorAll('[data-scrim]')];
const pinPresence = {};
const cycle = { t: 0, rising: false, w: 0 };
const aboutLight = { warm: 0, crisp: 0 };
const WARM_DAY = 0.27, WARM_NIGHT = 0.27;   // the same golden hour by day and by night
const pinSec = pins.map((el) => el.closest('[data-shot]').dataset.shot);
// data-exit="left": the stage holds its place and slides away sideways as the
// window begins to morph, instead of scrolling off the top under its own fade
const pinExit = pins.map((el) => el.closest('[data-shot]').dataset.exit === 'left');
const setIf = (el, key, v) => { if (el['_' + key] !== v) { el['_' + key] = v; el.style[key] = v; } };
function choreograph() {
  const H = innerHeight;
  pins.forEach((el, i) => {
    const sec = sections.find((q) => q.id === pinSec[i]); if (!sec) return;
    const d = cur - sec.top, span = Math.max(0, sec.h - H);
    // the stretch over which the stage leaves, ending just before the shot changes
    const out = smooth(span + 0.02 * H, span + 0.42 * H, d);
    // a stage that leaves sideways keeps holding its place while it goes, so the
    // words travel left rather than being carried up by the page
    const y = Math.min(Math.max(d, 0), pinExit[i] ? span + 0.42 * H : span);
    const x = pinExit[i] ? -out * 70 : 0;
    setIf(el, 'transform', `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`);
    // a pinned stage fades in as it arrives and out as it leaves, so two stages never overlap
    const k = Math.round(smooth(-0.5 * H, -0.08 * H, d) * (1 - out) * 100) / 100;
    setIf(el, 'opacity', String(k));
    setIf(el, 'visibility', k <= 0 ? 'hidden' : 'visible');
    pinPresence[pinSec[i]] = k;
  });
  for (const bt of beats) {
    const u = progress(bt.id);
    const k = Math.round((bt.a <= 0 ? 1 : smooth(bt.a, bt.a + bt.sp, u)) * (1 - smooth(bt.b, bt.b + bt.sp, u)) * 200) / 200;
    setIf(bt.el, 'visibility', k <= 0 ? 'hidden' : 'visible');
    if (k <= 0) continue;
    setIf(bt.el, 'opacity', String(k));
    setIf(bt.el, 'transform', bt.x
      ? `translate3d(${(-(1 - k) * 66).toFixed(1)}px, 0, 0)`
      : `translate3d(0, ${((1 - k) * 18).toFixed(1)}px, 0)`);
    if (!bt.noBlur) setIf(bt.el, 'filter', k >= 1 ? 'none' : `blur(${((1 - k) * (bt.x ? 4 : 10)).toFixed(1)}px)`);
  }
  // the timeline: a playhead runs 2018 → 2026 while the camera tracks; each bar draws as the years reach it
  const u = progress('track');
  const ph = lerp(0.03, 1.0, smooth(0.08, 0.86, u));
  // the shade arrives with the words it sits under, not before them
  for (const sc of scrims) {
    const at = sc.dataset.scrimIn ? parseFloat(sc.dataset.scrimIn) : null;
    const k = (pinPresence[sc.dataset.scrim] || 0) * (at === null ? 1 : smooth(at, at + 0.05, progress(sc.dataset.scrim)));
    setIf(sc, 'opacity', String(Math.round(k * 100) / 100));
  }
  // about: the light plays the last two lines. care warms it, understand clears it
  const au = progress('about'), aw = pinPresence.about || 0;
  // (the golden light holds to the end of About and hands over to the timeline, which starts from it)
  aboutLight.warm = aw * smooth(0.53, 0.59, au) * (1 - smooth(0.84, 1, au));
  aboutLight.crisp = aw * smooth(0.63, 0.71, au) * 0.5;
  for (const b of bars) setIf(b.el, 'transform', `scaleX(${clamp01((ph - b.l) / b.w).toFixed(3)})`);
  // each role arrives from the left as the playhead reaches its first year, the
  // same direction the bars draw in, so the list reads as one movement
  for (const r of rows) {
    // 0.08 of the playhead is roughly 150px of scroll: long enough that the
    // travel reads as travel rather than the row appearing already in place
    const k = Math.round(smooth(r.l - 0.03, r.l + 0.05, ph) * 100) / 100;
    setIf(r.el, 'opacity', String(k));
    setIf(r.el, 'transform', `translate3d(${(-(1 - k) * 48).toFixed(1)}px, 0, 0)`);
  }
  for (const h of heads) setIf(h, 'left', (ph * 100).toFixed(2) + '%');
  // a whole day plays across the timeline, starting and ending on the page's own theme:
  // day → sunset → night → sunrise → day (or the reverse at night), midnight around 2022
  const c = smooth(0.02, 0.98, ph), half = c < 0.5, q = half ? c * 2 : (c - 1) * -2;
  const arc = Math.min(1, smooth(0, 0.92, q) * 1.02);
  const startsDark = nightTarget > 0.5;
  // it picks up from About's golden hour (by night, the first light before dawn) instead of starting over
  cycle.t = startsDark ? 1 - arc : arc;
  cycle.rising = startsDark ? half : !half;
  cycle.w = pinPresence.track || 0;
  const yr = String(Math.min(AXIS.last, Math.max(AXIS.first, Math.floor(AXIS.from + ph * (AXIS.to - AXIS.from)))));
  if (yr !== lastYear) { for (const y of years) y.textContent = yr; lastYear = yr; }
  // the wind is the meadow's own: time moves it, scrolling never does (the pointer can add a breeze)
  const wind = reduceMotion ? 0.35 : 1;
  grass.material.uniforms.uWind.value = wind;
  daisies.material.uniforms.uWind.value = wind;
}

/* ---------- magnetic scroll: settle on the best position of a section when you stop near one ---------- */
let snapAnim = null, lastInput = performance.now(), lastY = scrollY, dir = 1, touching = false, settled = true;
addEventListener('scroll', () => {
  if (snapAnim) return;
  if (scrollY !== lastY) dir = Math.sign(scrollY - lastY) || dir;
  lastY = scrollY; lastInput = performance.now(); settled = false;
}, { passive: true });
for (const ev of ['wheel', 'keydown', 'pointerdown']) addEventListener(ev, () => { snapAnim = null; lastInput = performance.now(); settled = false; }, { passive: true });
addEventListener('touchstart', () => { touching = true; snapAnim = null; }, { passive: true });
addEventListener('touchend', () => { touching = false; lastInput = performance.now(); settled = false; }, { passive: true });
const navEl = document.querySelector('.nav'), veilEl = document.querySelector('.veil');
let navLast = 0;
function navHide() {
  if (!navEl) return;
  const y = scrollY;
  if (Math.abs(y - navLast) < 6) return;
  const hide = y > 200 && y > navLast;
  navEl.classList.toggle('is-hidden', hide);
  veilEl?.classList.toggle('is-hidden', hide);
  navLast = y;
}
function magnet(now) {
  if (snapAnim) {
    const t = clamp01((now - snapAnim.t0) / snapAnim.dur);
    const e = 1 - Math.pow(1 - t, 3);
    scrollTo(0, snapAnim.from + (snapAnim.to - snapAnim.from) * e);
    lastY = scrollY;
    if (t >= 1) snapAnim = null;
    return;
  }
  if (settled || touching || reduceMotion || still || now - lastInput < 170) return;
  settled = true;
  const H = innerHeight, y = scrollY, reach = H * 0.5, slack = H * 0.08;
  let to = null;
  if (dir > 0) { for (const p of snaps) if (p >= y - slack && p - y < reach) { to = p; break; } }
  else { for (let i = snaps.length - 1; i >= 0; i--) { const p = snaps[i]; if (p <= y + slack && y - p < reach) { to = p; break; } } }
  if (to === null || Math.abs(to - y) < 2) return;
  snapAnim = { from: y, to, t0: now, dur: Math.min(900, Math.max(380, Math.abs(to - y) / H * 900)) };
}

/* ---------- resize ---------- */
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  // share the window's margins with the page, so text and buttons align to its edges
  root.style.setProperty('--wpad', Math.max(20, Math.min(56, w * 0.04)) + 'px');
  root.style.setProperty('--band', (w < 820 ? 64 : 76) + 'px');
  renderer.setSize(w, h, false);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(w, h);
  lastInset = '';
}
function setDpr(r) { renderer.setPixelRatio(r); resize(); }
const DPR_MAX = Math.min(devicePixelRatio, Q.dpr);
addEventListener('resize', resize);
resize();

/* ---------- dev panel ---------- */
const hud = document.querySelector('[data-hud]');
const fpsEl = document.querySelector('[data-fps]');
const shotEl = document.querySelector('[data-shotname]');
let paused = false;
document.querySelector('[data-pause]')?.addEventListener('click', (e) => { paused = !paused; e.currentTarget.textContent = paused ? 'Play' : 'Pause'; });
addEventListener('keydown', (e) => { if (e.key === 'h' || e.key === 'H') hud?.classList.toggle('is-hidden'); });

/* ---------- day / night: the site's own theme toggle drives the sunset ---------- */
let nightTarget = root.getAttribute('data-theme') === 'dark' ? 1 : 0;
nightT = nightTarget;
if (qs.has('night')) nightT = nightTarget = parseFloat(qs.get('night'));
const themeBtn = document.querySelector('[data-theme-toggle]');
function setTheme(t) {
  root.setAttribute('data-theme', t);
  try { localStorage.setItem('cc-theme', t); } catch (e) {}
  if (themeBtn) themeBtn.setAttribute('aria-label', t === 'dark' ? 'Switch to day' : 'Switch to night');
  nightTarget = t === 'dark' ? 1 : 0;
}
themeBtn?.addEventListener('click', () => setTheme(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'));
function stepNight(dt) {
  if (nightT === nightTarget) return false;
  const dur = reduceMotion ? 0.3 : 0.65;     // a switch, not a performance
  nightT = nightTarget > nightT ? Math.min(1, nightT + dt / dur) : Math.max(0, nightT - dt / dur);
  return true;
}
function applyNight() {
  // two scenes can steer the light: the timeline's day and About's golden hour. Blended by weight so the
  // hand-off between them never dips back to plain daylight
  const cw = cycle.w, aw = aboutLight.warm, sum = cw + aw;
  const warmT = nightT > 0.5 ? WARM_NIGHT : WARM_DAY;
  const target = sum > 1e-4 ? (cycle.t * cw + warmT * aw) / sum : nightT;
  const t = lerp(nightT, target, Math.min(1, sum));
  const rising = cw > 0.001 ? cycle.rising : false;
  applyTime(t, sum > 0.001 && rising, Math.min(1, sum));
  FOG.value = 0.0068 * (1 - 0.7 * aboutLight.crisp);
  FOGK.value = 1 - 0.55 * aboutLight.crisp;
  skyUniforms.uNight.value = smooth(0.45, 0.92, t);
  skyUniforms.uDusk.value = Math.pow(Math.max(0, 1 - Math.abs(t - 0.5) * 2.4), 1.2);
  fireflies.material.uniforms.uNight.value = smooth(0.62, 1, t);
}
applyNight();

/* ---------- GPU context loss (laptop sleep, driver reset): recover cleanly ---------- */
canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); visible = false; });
canvas.addEventListener('webglcontextrestored', () => location.reload());

/* ---------- loop ---------- */
const clock = new THREE.Clock();
let stillFrames = 0, realT = 0, slowTicks = 0, fastTicks = 0, time = qs.has('t') ? parseFloat(qs.get('t')) : 0, frames = 0, fpsT = 0, visible = true;
document.addEventListener('visibilitychange', () => { visible = !document.hidden; });

function frame() {
  const raw = clock.getDelta();
  const dt = Math.min(raw, 0.05);
  realT += raw;
  if (!paused) time += dt;
  pointer.sx += (pointer.x - pointer.sx) * (1 - Math.exp(-dt * 2));
  pointer.sy += (pointer.y - pointer.sy) * (1 - Math.exp(-dt * 2));
  rack += (rackTarget - rack) * (1 - Math.exp(-dt * 2.2));
  magnet(performance.now());
  navHide();
  updateScroll(dt);
  if (visible) {
    skyUniforms.uTime.value = time;
    grass.material.uniforms.uTime.value = time;
    daisies.material.uniforms.uTime.value = time;
    fireflies.material.uniforms.uTime.value = time;
    stepNight(dt);
    heroDt = dt; stepHero();
    stepWork(dt);
    direct(time, dt);
    touch(dt);
    choreograph();
    applyNight();
    sky.position.copy(camera.position);
    grass.updateLod(camera);
    renderer.info.reset();
    composer.render(dt);
    if (shotEl) shotEl.textContent = shotName;
  }
  frames++; fpsT += raw;
  if (fpsT > 0.5) {
    const fps = frames / fpsT;
    if (fpsEl) fpsEl.textContent = `${Math.round(fps)} fps · ${renderer.getPixelRatio().toFixed(2)}x`;
    const dpr = renderer.getPixelRatio();
    if (!still && visible && realT > 2) {
      if (fps < 48 && (dpr > 1.01 || grass.density > 0.36)) { if (++slowTicks >= 2) {
        // first trade resolution, then grass: an older laptop keeps a smooth scroll either way
        if (dpr > 1.01) setDpr(Math.max(1, dpr - 0.25)); else grass.density = Math.max(0.35, grass.density * 0.8);
        slowTicks = 0; fastTicks = 0; } }
      else slowTicks = 0;
      if (fps > 58 && (grass.density < 1 || dpr < DPR_MAX - 0.01)) { if (++fastTicks >= 10) {
        if (grass.density < 1) grass.density = Math.min(1, grass.density * 1.15); else setDpr(Math.min(DPR_MAX, dpr + 0.125));
        fastTicks = 0; } }
      else fastTicks = 0;
    }
    frames = 0; fpsT = 0;
  }
  if (still && ++stillFrames > 1) { window.__done = true; return; }
  requestAnimationFrame(frame);
}
renderer.info.autoReset = false;
window.__stats = () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, dpr: renderer.getPixelRatio() });
requestAnimationFrame(() => { document.documentElement.classList.add('is-ready'); frame(); });

/* ---------- helpers ---------- */
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function h2(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
function valueNoise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = h2(xi, yi), b = h2(xi + 1, yi), c = h2(xi, yi + 1), d = h2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
