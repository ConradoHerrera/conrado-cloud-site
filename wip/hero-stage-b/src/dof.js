/* Depth of field for the macro shots.
   Reads the scene's real depth buffer (so the wind-bent grass is in focus or not exactly
   where it really is), builds a light and a heavy blur, and mixes them by circle of
   confusion. Aperture 0 = everything sharp and the pass costs almost nothing. */
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

const VERT = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const DOWN = /* glsl */`
uniform sampler2D tDiffuse; uniform vec2 uTexel; uniform vec4 uClamp; varying vec2 vUv;
vec2 cl(vec2 uv){ return clamp(uv, uClamp.xy, uClamp.zw); }
void main(){
  vec3 c = texture2D(tDiffuse, cl(vUv + uTexel*vec2(-1.0,-1.0))).rgb + texture2D(tDiffuse, cl(vUv + uTexel*vec2(1.0,-1.0))).rgb
         + texture2D(tDiffuse, cl(vUv + uTexel*vec2(-1.0, 1.0))).rgb + texture2D(tDiffuse, cl(vUv + uTexel*vec2(1.0, 1.0))).rgb;
  gl_FragColor = vec4(c*0.25, 1.0);
}`;
const KAWASE = /* glsl */`
uniform sampler2D tDiffuse; uniform vec2 uTexel; uniform float uOff; uniform vec4 uClamp; varying vec2 vUv;
vec2 cl(vec2 uv){ return clamp(uv, uClamp.xy, uClamp.zw); }
void main(){
  vec2 o = uTexel*(uOff + 0.5);
  vec3 c = texture2D(tDiffuse, cl(vUv + vec2(-o.x,-o.y))).rgb + texture2D(tDiffuse, cl(vUv + vec2(o.x,-o.y))).rgb
         + texture2D(tDiffuse, cl(vUv + vec2(-o.x, o.y))).rgb + texture2D(tDiffuse, cl(vUv + vec2(o.x, o.y))).rgb;
  gl_FragColor = vec4(c*0.25, 1.0);
}`;
const COMPOSE = /* glsl */`
uniform sampler2D tDiffuse, tDepth, tHalf, tQuarter;
uniform float uNear, uFar, uFocus, uAperture; uniform vec4 uClamp;
varying vec2 vUv;
float linearDepth(float d){ return uNear*uFar / (uFar - d*(uFar - uNear)); }
float coc(vec2 uv){
  float z = linearDepth(texture2D(tDepth, uv).x);
  return clamp(abs(1.0/uFocus - 1.0/z) * uAperture * 0.5, 0.0, 1.0);
}
void main(){
  vec3 sharp = texture2D(tDiffuse, vUv).rgb;
  if(uAperture <= 0.001){ gl_FragColor = vec4(sharp, 1.0); return; }
  float c = coc(vUv);
  vec2 cuv = clamp(vUv, uClamp.xy, uClamp.zw);
  vec3 half_ = texture2D(tHalf, cuv).rgb, quarter = texture2D(tQuarter, cuv).rgb;
  vec3 col = c < 0.5 ? mix(sharp, half_, c*2.0) : mix(half_, quarter, (c - 0.5)*2.0);
  gl_FragColor = vec4(col, 1.0);
}`;

export class DofPass extends Pass {
  constructor(camera) {
    super();
    this.camera = camera;
    const o = { type: THREE.HalfFloatType, depthBuffer: false };
    this.half = new THREE.WebGLRenderTarget(1, 1, o); this.halfB = new THREE.WebGLRenderTarget(1, 1, o);
    this.qa = new THREE.WebGLRenderTarget(1, 1, o); this.qb = new THREE.WebGLRenderTarget(1, 1, o);
    this.clamp = new THREE.Vector4(0, 0, 1, 1);
    const mk = (frag, extra = {}) => new THREE.ShaderMaterial({ uniforms: { tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2() }, uClamp: { value: this.clamp }, ...extra }, vertexShader: VERT, fragmentShader: frag, depthTest: false, depthWrite: false });
    this.down = mk(DOWN); this.kawase = mk(KAWASE, { uOff: { value: 0 } });
    this.compose = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, tDepth: { value: null }, tHalf: { value: null }, tQuarter: { value: null },
        uNear: { value: 0.05 }, uFar: { value: 1000 }, uFocus: { value: 1 }, uAperture: { value: 0 }, uClamp: { value: this.clamp } },
      vertexShader: VERT, fragmentShader: COMPOSE, depthTest: false, depthWrite: false,
    });
    this.quad = new FullScreenQuad(null);
    this.focus = 1; this.aperture = 0;
  }
  setSize(w, h) {
    this.half.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1)); this.halfB.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1));
    this.qa.setSize(Math.max(1, w >> 2), Math.max(1, h >> 2)); this.qb.setSize(Math.max(1, w >> 2), Math.max(1, h >> 2));
  }
  blit(renderer, mat, src, dst, off) {
    mat.uniforms.tDiffuse.value = src.texture; mat.uniforms.uTexel.value.set(1 / src.width, 1 / src.height);
    if (off !== undefined) mat.uniforms.uOff.value = off;
    this.quad.material = mat; renderer.setRenderTarget(dst); this.quad.render(renderer);
  }
  render(renderer, writeBuffer, readBuffer) {
    const u = this.compose.uniforms;
    u.tDiffuse.value = readBuffer.texture; u.tDepth.value = readBuffer.depthTexture;
    u.uNear.value = this.camera.near; u.uFar.value = this.camera.far;
    u.uFocus.value = Math.max(0.05, this.focus); u.uAperture.value = this.aperture;
    if (this.aperture > 0.001) {
      this.blit(renderer, this.down, readBuffer, this.half);
      this.blit(renderer, this.kawase, this.half, this.halfB, 1);
      this.blit(renderer, this.down, this.half, this.qa);
      this.blit(renderer, this.kawase, this.qa, this.qb, 1);
      this.blit(renderer, this.kawase, this.qb, this.qa, 2);
      this.blit(renderer, this.kawase, this.qa, this.qb, 3);
      u.tHalf.value = this.halfB.texture; u.tQuarter.value = this.qb.texture;
    }
    this.quad.material = this.compose;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }
}
