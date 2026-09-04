(function () {
  "use strict";

  const ROLE_ORDER = ["canonical_correct", "periodic_binary", "hard_error"];
  const FOCUS_STEPS = Object.freeze([
    Object.freeze({ role: "canonical_correct", label: "第一幕 · 真实信号与表面脉动" }),
    Object.freeze({ role: "periodic_binary", label: "第二幕 · 周期双星与轨道遮掩" }),
    Object.freeze({ role: "hard_error", label: "第三幕 · 最难错例与模型边界" }),
  ]);
  const HASH_PATTERN = /^[0-9a-f]{64}$/;
  const QUALITY_PROFILES = Object.freeze({
    cinema: Object.freeze({ dpr: 1.5, shader: 2 }),
    balanced: Object.freeze({ dpr: 1.25, shader: 1 }),
    safe: Object.freeze({ dpr: 0.85, shader: 0 }),
  });
  const SPEED_PROFILES = Object.freeze({ paused: 0, normal: 1, fast: 2 });
  const SCRIPT_SOURCE = document.currentScript && document.currentScript.src ? document.currentScript.src : window.location.href;
  const CINEMA_TEXTURE_URL = new URL("assets/stellar-photosphere-cinema-v3.jpg", SCRIPT_SOURCE).href;
  const EVIDENCE_EVENT = "astrotwin:stellar-evidence";
  const SAMPLE_EVENT = "astrotwin:stellar-sample";
  const FAILED_EVENT = "astrotwin:stellar-failed";
  const SELECT_REQUEST_EVENT = "astrotwin:stellar-select-request";
  const REDUCED_MOTION = typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : { matches: false };

  const state = {
    canvas: null,
    host: null,
    stageElement: null,
    disclaimer: null,
    ownsCanvas: false,
    ownsDisclaimer: false,
    contextKind: null,
    gl: null,
    context2d: null,
    program: null,
    buffer: null,
    baseBundle: null,
    cinemaBundle: null,
    cinemaCompileJob: null,
    cinemaCompileTimer: null,
    cinemaCompileStartedAt: null,
    parallelCompileSupported: false,
    texture: null,
    textureImage: null,
    textureReady: false,
    textureLoading: false,
    textureFailed: false,
    cinemaProgramReady: false,
    cinemaProgramFailed: false,
    cinemaProgramLoading: false,
    attributes: null,
    uniforms: null,
    resizeObserver: null,
    resizeTimer: null,
    frame: null,
    startedAt: null,
    lastTime: 0,
    visible: !document.hidden,
    destroyed: false,
    eligible: false,
    failed: false,
    failureMessage: "",
    evidenceHash: null,
    evidenceStage: null,
    evidenceSamples: new Map(),
    sample: null,
    role: "canonical_correct",
    pendingSample: null,
    quality: "balanced",
    speed: "normal",
    pointer: { x: 0, y: 0, targetX: 0, targetY: 0 },
    pointerDragging: false,
    pointerId: null,
    pointerLastX: 0,
    pointerLastY: 0,
    focusRunning: false,
    focusTimer: null,
    focusElapsed: 0,
    focusStartedAt: null,
    focusPaused: false,
    focusStep: -1,
  };

  const VERTEX_SHADER = `
    attribute vec2 aPosition;
    varying vec2 vUv;
    void main() {
      vUv = aPosition * 0.5 + 0.5;
      gl_Position = vec4(aPosition, 0.0, 1.0);
    }
  `;

  const FRAGMENT_SHADER = `
    precision highp float;
    varying vec2 vUv;
    uniform vec2 uResolution;
    uniform vec2 uPointer;
    uniform float uTime;
    uniform int uMode;
    uniform int uQuality;
#if ASTROTWIN_CINEMA
    uniform sampler2D uPhotosphere;
    uniform int uTextureReady;
#endif

    const float PI = 3.14159265359;

    float hash21(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    float hash31(vec3 p) {
      p = fract(p * 0.1031);
      p += dot(p, p.yzx + 33.33);
      return fract((p.x + p.y) * p.z);
    }

    float noise3(vec3 p) {
      vec3 cell = floor(p);
      vec3 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      float n000 = hash31(cell + vec3(0.0, 0.0, 0.0));
      float n100 = hash31(cell + vec3(1.0, 0.0, 0.0));
      float n010 = hash31(cell + vec3(0.0, 1.0, 0.0));
      float n110 = hash31(cell + vec3(1.0, 1.0, 0.0));
      float n001 = hash31(cell + vec3(0.0, 0.0, 1.0));
      float n101 = hash31(cell + vec3(1.0, 0.0, 1.0));
      float n011 = hash31(cell + vec3(0.0, 1.0, 1.0));
      float n111 = hash31(cell + vec3(1.0, 1.0, 1.0));
      float nx00 = mix(n000, n100, f.x);
      float nx10 = mix(n010, n110, f.x);
      float nx01 = mix(n001, n101, f.x);
      float nx11 = mix(n011, n111, f.x);
      return mix(mix(nx00, nx10, f.y), mix(nx01, nx11, f.y), f.z);
    }

    float fbm(vec3 p) {
      float value = 0.0;
      float amplitude = 0.54;
      for (int octave = 0; octave < 3; octave++) {
        value += amplitude * noise3(p);
        p = p * 2.03 + vec3(7.1, 3.7, 5.4);
        amplitude *= 0.49;
      }
      return value;
    }

    float ridgedFbm(vec3 p) {
      float value = 0.0;
      float amplitude = 0.56;
      for (int octave = 0; octave < 3; octave++) {
        float ridge = 1.0 - abs(noise3(p) * 2.0 - 1.0);
        value += ridge * ridge * amplitude;
        p = p * 2.11 + vec3(4.8, 8.3, 2.6);
        amplitude *= 0.48;
      }
      return value;
    }

    mat2 rotate2(float angle) {
      float s = sin(angle);
      float c = cos(angle);
      return mat2(c, -s, s, c);
    }

    vec3 starLayer(vec2 p, float scale, float threshold, float radius, float seed, float time) {
      vec2 grid = p * scale + seed * 17.0;
      vec2 cell = floor(grid);
      vec2 local = fract(grid) - 0.5;
      float random = hash21(cell + seed * 31.7);
      vec2 offset = vec2(hash21(cell + seed + 19.7), hash21(cell - seed + 41.3)) - 0.5;
      vec2 delta = local - offset * 0.76;
      float distanceToStar = length(delta);
      float visible = step(threshold, random);
      float core = (1.0 - smoothstep(0.0, radius, distanceToStar)) * visible;
      float rare = step(0.995, random) * visible;
      float horizontal = exp(-abs(delta.y) * 150.0) * exp(-abs(delta.x) * 10.0);
      float vertical = exp(-abs(delta.x) * 150.0) * exp(-abs(delta.y) * 10.0);
      float glint = (horizontal + vertical) * rare * 0.32;
      float twinkle = 0.78 + 0.22 * sin(time * (0.18 + random * 0.45) + random * 91.0);
      vec3 blue = vec3(0.24, 0.48, 1.0);
      vec3 white = vec3(0.82, 0.92, 1.0);
      vec3 warm = vec3(1.0, 0.72, 0.42);
      vec3 color = mix(blue, white, smoothstep(0.20, 0.82, random));
      color = mix(color, warm, step(0.91, hash21(cell + 7.9)) * 0.55);
      return color * (core * (0.7 + random * 2.2) * twinkle + glint);
    }

    vec3 deepSpace(vec2 p, vec2 pointer, float time) {
      vec3 background = vec3(0.0018, 0.0034, 0.012);
      background += starLayer(p + pointer * 0.015, 118.0, 0.975, 0.085, 0.17, time) * 0.24;
      if (uQuality > 0) {
        vec2 dustP = rotate2(-0.49) * (p + vec2(0.12, -0.03));
        float warp = fbm(vec3(dustP * 1.35, 3.7)) - 0.5;
        float band = exp(-pow(abs(dustP.y + warp * 0.22) * 3.15, 2.0));
        float cloud = noise3(vec3(dustP * 2.1 + vec2(time * 0.0015, 0.0), 8.1));
        float darkRift = smoothstep(0.50, 0.78, noise3(vec3(dustP * 2.7 + 11.0, 2.0)));
        vec3 nebulaColor = uQuality > 1 ? vec3(0.105, 0.015, 0.003) : vec3(0.018, 0.035, 0.105);
        background += nebulaColor * band * (0.18 + cloud * 0.42);
        background *= 1.0 - darkRift * band * 0.54;
        background += starLayer(p + pointer * 0.050, 73.0, 0.969, 0.075, 0.53, time) * 0.52;
#if ASTROTWIN_CINEMA
        if (uQuality > 1) {
          float filamentNoise = noise3(vec3(dustP * 3.8, 12.4));
          float filaments = 1.0 - abs(filamentNoise * 2.0 - 1.0);
          background += vec3(0.16, 0.022, 0.006) * band * filaments * filaments * 0.16;
          float milkyWay = exp(-pow(abs(dustP.y + warp * 0.12) * 2.35, 2.0));
          float galaxyCore = exp(-dot(dustP - vec2(0.24, -0.02), dustP - vec2(0.24, -0.02)) * 2.8);
          vec3 galaxyHue = mix(vec3(0.025, 0.075, 0.19), vec3(0.19, 0.045, 0.24), smoothstep(-0.55, 0.7, dustP.x));
          background += galaxyHue * milkyWay * (0.07 + cloud * 0.22 + galaxyCore * 0.24);
          float galaxyDust = smoothstep(0.48, 0.74, noise3(vec3(dustP * 4.9 + 19.2, 4.7)));
          background *= 1.0 - galaxyDust * milkyWay * 0.24;
          background += starLayer(p + pointer * 0.125, 39.0, 0.982, 0.068, 0.91, time) * 1.15;
        }
#endif
      }
      return background;
    }

    float plume(vec2 direction, vec2 axis, float sharpness, float reach) {
      float alignment = pow(max(dot(direction, axis), 0.0), sharpness);
      return alignment * reach;
    }

    float magneticLoop(vec2 q, float angle, float width, float height, float thickness, float phase, float time) {
      vec2 outward = vec2(cos(angle), sin(angle));
      vec2 tangent = vec2(-outward.y, outward.x);
      float x = dot(q, tangent) / width;
      float y = dot(q, outward) - 0.965;
      float arch = height * (1.0 - x * x);
      float strandA = 1.0 - smoothstep(thickness, thickness * 3.8, abs(y - arch));
      float strandB = 1.0 - smoothstep(thickness * 0.7, thickness * 3.2, abs(y - arch * 0.92 - sin(x * 8.0 + phase) * 0.006));
      float strand = strandA * 0.68 + strandB * 0.32;
      float feet = 1.0 - smoothstep(0.96, 1.035, abs(x));
      float outsideOnly = smoothstep(-0.015, 0.035, y);
      float pulse = 0.72 + 0.28 * sin(time * 0.42 + phase + x * 8.0);
      float turbulence = noise3(vec3(x * 5.3 + phase, y * 8.7, time * 0.018 + phase));
      float brokenFilament = 0.34 + smoothstep(0.22, 0.82, turbulence) * 0.66;
      return strand * feet * outsideOnly * pulse * brokenFilament;
    }

#if ASTROTWIN_CINEMA
    float solarFlareJet(vec2 q, float angle, float phase, float time) {
      vec2 outward = vec2(cos(angle), sin(angle));
      vec2 tangent = vec2(-outward.y, outward.x);
      float crossAxis = dot(q, tangent);
      float altitude = dot(q, outward) - 0.945;
      float sway = sin(altitude * 13.0 - time * 0.72 + phase) * (0.006 + max(altitude, 0.0) * 0.026);
      float width = 0.010 + max(altitude, 0.0) * 0.046;
      float spine = exp(-abs(crossAxis - sway) / max(width, 0.0015) * 2.7);
      float sheath = exp(-abs(crossAxis + sway * 0.42) / max(width * 2.8, 0.003));
      float altitudeGate = smoothstep(-0.018, 0.035, altitude)
        * (1.0 - smoothstep(0.42, 1.08, altitude));
      float knot = exp(-pow((altitude - 0.24 - sin(time * 0.36 + phase) * 0.055) / 0.052, 2.0));
      float burst = 0.44 + pow(max(0.0, sin(time * 0.34 + phase)), 7.0) * 1.45;
      float flicker = 0.78 + 0.22 * sin(time * 4.2 + altitude * 43.0 + phase);
      return (spine * 1.28 + sheath * 0.34 + knot * spine * 1.7) * altitudeGate * burst * flicker;
    }

    float coronalStreamer(vec2 direction, float radial, float outside, vec2 axis, float phase, float time) {
      float alignment = max(dot(direction, axis), 0.0);
      float broad = pow(alignment, 52.0);
      float filament = pow(alignment, 230.0);
      float reach = exp(-outside * 0.94) * (1.0 - smoothstep(1.08, 3.08, radial));
      float ripple = 0.68 + 0.32 * sin(outside * 19.0 - time * 0.24 + phase);
      float polarAngle = atan(direction.y, direction.x);
      float strands = 0.48 + 0.52 * pow(abs(sin(polarAngle * 31.0 + outside * 8.0 - time * 0.12 + phase)), 5.0);
      return (broad * 0.24 + filament * 1.08) * reach * ripple * strands;
    }
#endif

    float activityRegion(vec3 normal, vec3 direction, float concentration) {
      return exp(-concentration * max(0.0, 1.0 - dot(normal, normalize(direction))));
    }

    vec4 renderStar(vec2 p, vec2 center, float radius, float seed, vec3 cool, vec3 hot, float time, float diagnostic) {
      vec2 q = (p - center) / radius;
      float radial = length(q);
      if (radial > 3.2) return vec4(0.0);
      float outside = max(0.0, radial - 1.0);
      vec2 direction = normalize(q + vec2(0.0001));
      float angle = atan(direction.y, direction.x);
      float angularSample = noise3(vec3(direction * 3.1, seed * 9.0 + time * 0.014));
      float angularNoise = 1.0 - abs(angularSample * 2.0 - 1.0);
      float slowNoise = sin(angle * 5.0 + seed * 17.0 - time * 0.025) * 0.5 + 0.5;
      float irregular = 0.52 + angularNoise * 0.44 + slowNoise * 0.16;

      float innerCorona = exp(-outside * 18.0) * (1.0 - smoothstep(1.0, 1.18, radial));
      float warmBloom = exp(-outside * 6.2) * (1.0 - smoothstep(1.0, 1.68, radial));
      float broadBloom = exp(-outside * 2.0) * (1.0 - smoothstep(1.0, 2.55, radial));
      float corona = innerCorona * 0.78 + warmBloom * irregular * 0.34 + broadBloom * irregular * 0.035;

      vec2 axisA = normalize(vec2(cos(seed * 11.3 + 0.4), sin(seed * 11.3 + 0.4)));
      vec2 axisB = normalize(vec2(cos(seed * 7.1 + 2.25), sin(seed * 7.1 + 2.25)));
      vec2 axisC = normalize(vec2(cos(seed * 5.7 + 4.5), sin(seed * 5.7 + 4.5)));
      float reach = exp(-outside * 1.42) * (1.0 - smoothstep(1.0, 3.1, radial));
      float plumes = 0.0;
      float loops = 0.0;
      float cinemaCorona = 0.0;
      float cinemaFlare = 0.0;
      float cinemaProminence = 0.0;
      if (uQuality > 0) {
        plumes = plume(direction, axisA, 72.0, reach)
          + plume(direction, -axisA, 98.0, reach * 0.48)
          + plume(direction, axisB, 120.0, reach * 0.72);
        loops += magneticLoop(q, seed * 5.1 + 0.35, 0.18, 0.19, 0.0042, 1.2, time);
        loops += magneticLoop(q, seed * 8.3 + 2.75, 0.13, 0.15, 0.0038, 3.8, time);
#if ASTROTWIN_CINEMA
        if (uQuality > 1) {
          plumes += plume(direction, axisC, 165.0, reach * 0.42);
          loops += magneticLoop(q, seed * 4.7 + 1.25, 0.23, 0.27, 0.0032, 5.1, time);
          loops += magneticLoop(q, seed * 9.4 + 3.55, 0.20, 0.24, 0.0032, 8.4, time);
          loops += magneticLoop(q, seed * 6.8 + 4.62, 0.11, 0.17, 0.0027, 11.2, time);
          loops += magneticLoop(q, seed * 12.2 + 5.52, 0.16, 0.21, 0.0027, 14.7, time);
          vec2 streamerAxisA = normalize(vec2(cos(seed * 9.8 + 0.72), sin(seed * 9.8 + 0.72)));
          vec2 streamerAxisB = normalize(vec2(cos(seed * 6.2 + 3.92), sin(seed * 6.2 + 3.92)));
          cinemaCorona = coronalStreamer(direction, radial, outside, streamerAxisA, 1.7, time)
            + coronalStreamer(direction, radial, outside, -streamerAxisA, 4.4, time) * 0.62
            + coronalStreamer(direction, radial, outside, streamerAxisB, 8.2, time) * 0.84;
          cinemaProminence = magneticLoop(q, seed * 7.6 + 0.18, 0.32, 0.43, 0.0082, 18.1, time)
            + magneticLoop(q, seed * 11.8 + 3.26, 0.25, 0.35, 0.0068, 23.4, time) * 0.78;
          cinemaFlare = solarFlareJet(q, 0.48 + seed * 0.15, 0.35, time)
            + solarFlareJet(q, 2.34 + seed * 0.12, 2.55, time) * 0.68;
        }
#endif
        plumes *= (0.44 + angularNoise * 0.68) * (uQuality > 1 ? 1.0 : 0.72);
      }

      float flarePulse = 0.72 + 0.28 * sin(time * 0.85 + seed * 47.0);
      float flareRay = pow(max(dot(direction, axisB), 0.0), 230.0);
      float flare = flareRay * exp(-outside * 0.92) * (1.0 - smoothstep(1.0, 3.4, radial)) * flarePulse;

      vec3 auraColor = mix(cool, hot, 0.58 + diagnostic * 0.18);
      vec3 color = auraColor * corona * 2.0;
      color += mix(hot, vec3(0.72, 0.88, 1.0), 0.36) * plumes * 1.32;
      color += vec3(1.72, 0.19, 0.008) * loops * (uQuality > 1 ? 1.55 : 0.92);
      color += vec3(2.15, 0.62, 0.055) * loops * loops * 0.82;
      color += mix(hot, vec3(1.65, 0.58, 0.10), 0.42) * flare * (0.92 + diagnostic * 0.38);
#if ASTROTWIN_CINEMA
      if (uQuality > 1) {
        color += mix(hot, vec3(0.68, 0.82, 1.16), 0.44) * cinemaCorona * 0.92;
        color += vec3(2.72, 0.30, 0.012) * cinemaProminence * 1.34;
        color += vec3(4.80, 1.18, 0.075) * cinemaProminence * cinemaProminence * 0.76;
        color += vec3(3.65, 0.92, 0.095) * cinemaFlare * 1.12;
        color += vec3(1.72, 0.072, 0.006) * sqrt(max(cinemaFlare, 0.0)) * 0.56;
      }
#endif
      float alpha = clamp(
        corona * 1.18 + plumes * 0.74 + loops * 0.78 + flare * 0.46
        + cinemaCorona * 0.34 + cinemaProminence * 0.72 + cinemaFlare * 0.76,
        0.0,
        0.97
      );

      if (radial <= 1.0) {
        float z = sqrt(max(0.0, 1.0 - dot(q, q)));
        vec3 normal = normalize(vec3(q, z));
        normal.yz = rotate2(-uPointer.y * 0.46) * normal.yz;
        normal.xz = rotate2(time * 0.075 + seed * 2.0 + uPointer.x * 0.72) * normal.xz;

        vec3 warp = vec3(0.0);
        if (uQuality > 0) {
          float warpA = fbm(normal * 2.05 + vec3(seed * 13.0, 0.0, time * 0.011));
          float warpB = fbm(normal * 2.27 + vec3(4.1, seed * 9.0, -time * 0.009));
          warp = vec3(warpA, warpB, mix(warpA, warpB, 0.43)) - 0.5;
        }
        vec3 domain = normal * 5.2 + warp * 2.6;
        domain.xz = rotate2(normal.y * 0.52 + time * 0.008) * domain.xz;
        float convection = noise3(domain * 0.72 + seed * 11.0);
        float basin = fbm(normal * 2.25 + warp * 1.4 + vec3(seed * 5.0, 1.7, -2.3));
        float ridges = 1.0 - abs(noise3(domain * 1.55 - vec3(time * 0.014, 0.0, time * 0.009)) * 2.0 - 1.0);
        if (uQuality > 0) ridges = ridgedFbm(domain * 1.48 - vec3(time * 0.014, 0.0, time * 0.009));
        float granuleNoise = noise3(normal * 24.0 + warp * 4.1 - vec3(time * 0.021, 0.0, time * 0.013));
        float granules = 1.0 - abs(granuleNoise * 2.0 - 1.0);
        float filaments = pow(clamp(ridges * 0.83 + granules * 0.36 - 0.34, 0.0, 1.0), 2.25);
        float micro = noise3(normal * 67.0 + warp * 5.0 + seed * 19.0);
        float microFilament = pow(1.0 - abs(micro * 2.0 - 1.0), 5.0);
#if ASTROTWIN_CINEMA
        if (uQuality > 1) {
          float fineRidge = ridgedFbm(normal * 13.5 + warp * 4.6 + vec3(time * 0.005, 8.0, -3.0));
          filaments = clamp(filaments * 0.68 + pow(clamp(fineRidge, 0.0, 1.0), 4.4) * 0.48 + microFilament * 0.16, 0.0, 1.0);
        }
#endif
        filaments *= 0.32 + pow(convection, 1.35) * 0.92;

        float darkTurbulence = smoothstep(0.43, 0.72, basin + (0.5 - convection) * 0.34);
        float molten = clamp(convection * 0.48 + filaments * 0.98 + granules * 0.07, 0.0, 1.28);
        vec3 blackPlasma = mix(vec3(0.018, 0.0006, 0.0), cool * 0.28, 0.55);
        vec3 ember = mix(cool * 0.65, vec3(0.78, 0.055, 0.001), 0.62);
        vec3 gold = mix(hot, vec3(1.65, 0.49, 0.018), 0.52);
        vec3 whiteHot = vec3(3.2, 1.72, 0.42);
        vec3 surface = mix(blackPlasma, ember, smoothstep(0.12, 0.52, molten));
        surface = mix(surface, gold, smoothstep(0.45, 0.82, molten));
        surface = mix(surface, whiteHot, smoothstep(0.82, 1.24, molten));
        surface *= 1.0 - darkTurbulence * 0.72;
#if ASTROTWIN_CINEMA
        if (uQuality > 1 && uTextureReady == 1) {
          vec2 photosphereUv = vec2(
            fract(atan(normal.z, normal.x) / (2.0 * PI) + 0.5),
            clamp(asin(clamp(normal.y, -1.0, 1.0)) / PI + 0.5, 0.002, 0.998)
          );
          vec3 photographic = pow(texture2D(uPhotosphere, photosphereUv).rgb, vec3(2.2));
          photographic *= vec3(1.48, 1.18, 0.72) * 1.42;
          surface = mix(surface, photographic, 0.84);
        }
#endif
        surface += vec3(2.4, 0.72, 0.045) * filaments * (uQuality > 1 ? 0.76 : 0.54);

        float spotField = noise3(normal * 2.15 + warp * 0.75 + vec3(seed * 27.0, 3.0, -5.0));
        spotField += sin(normal.y * 10.0 + seed * 8.0) * 0.045;
        float penumbra = smoothstep(0.67, 0.79, spotField);
        float darkCore = smoothstep(0.79, 0.91, spotField);
        surface *= 1.0 - penumbra * (0.38 + diagnostic * 0.12);
        surface *= 1.0 - darkCore * (0.58 + diagnostic * 0.10);
        surface += hot * penumbra * (1.0 - darkCore) * granules * 0.16;

        float sunspotA = activityRegion(normal, vec3(0.18, -0.12, 0.98), 145.0);
        float sunspotB = activityRegion(normal, vec3(-0.31, 0.31, 0.90), 175.0);
        float spotTexture = smoothstep(0.34, 0.76, noise3(normal * 18.0 + warp * 2.2 + seed * 31.0));
        float localizedSpots = clamp(max(sunspotA, sunspotB * 0.78) * (0.46 + spotTexture * 0.72), 0.0, 1.0);
        surface *= 1.0 - localizedSpots * 0.78;
        surface += ember * localizedSpots * (1.0 - localizedSpots) * 0.18;

        float activeA = activityRegion(normal, vec3(0.34, 0.22, 0.92), 108.0);
        float activeB = activityRegion(normal, vec3(-0.48, -0.18, 0.86), 132.0);
        float activeC = activityRegion(normal, vec3(0.58, -0.36, 0.73), 162.0);
        float active = clamp(activeA + activeB * 0.86 + activeC * 0.72, 0.0, 1.0);
        float activeTexture = active * clamp(filaments * 1.45 + microFilament * 0.58 + granules * 0.16, 0.0, 1.0);
        float activeCore = pow(active, 4.4) * (0.24 + filaments * 0.76);
        surface += mix(hot, vec3(2.55, 1.05, 0.22), 0.62) * activeTexture * (uQuality > 1 ? 1.42 : 0.74);
        surface += vec3(3.8, 2.25, 0.86) * activeCore * (uQuality > 0 ? 0.82 : 0.34);
#if ASTROTWIN_CINEMA
        if (uQuality > 1) {
          float magneticCurl = pow(1.0 - abs(sin((normal.x + warp.x * 0.3) * 48.0 + (normal.y + warp.y * 0.2) * 31.0)), 16.0);
          surface += vec3(2.5, 0.68, 0.035) * magneticCurl * active * 1.35;
        }
#endif

        float limb = 0.16 + 0.84 * pow(max(z, 0.0), 0.58);
        float limbEdge = pow(1.0 - z, 7.0);
        float faculae = pow(granules, 2.0) * pow(1.0 - z, 2.4);
        surface *= limb;
        surface += auraColor * limbEdge * (0.28 + filaments * 0.58);
        surface += mix(hot, vec3(2.2, 1.15, 0.34), 0.6) * faculae * 0.36;

        if (diagnostic > 0.5) {
          float bands = smoothstep(0.91, 0.995, sin((normal.y + convection * 0.08) * 94.0) * 0.5 + 0.5);
          surface = mix(surface, vec3(1.2, 0.025, 0.12), bands * 0.27);
        }
        color = surface * (uQuality > 1 ? 1.08 : 1.0);
        alpha = 1.0;
      }
      return vec4(color, alpha);
    }

    vec4 overColor(vec4 back, vec4 front) {
      float alpha = front.a + back.a * (1.0 - front.a);
      vec3 color = (front.rgb * front.a + back.rgb * back.a * (1.0 - front.a)) / max(alpha, 0.0001);
      return vec4(color, alpha);
    }

    vec3 acesFilm(vec3 value) {
      float a = 2.51;
      float b = 0.03;
      float c = 2.43;
      float d = 0.59;
      float e = 0.14;
      return clamp((value * (a * value + b)) / (value * (c * value + d) + e), 0.0, 1.0);
    }

    void main() {
      vec2 p = (gl_FragCoord.xy - 0.5 * uResolution.xy) / min(uResolution.x, uResolution.y);
      p -= uPointer * 0.040;
      vec3 background = deepSpace(p, uPointer, uTime);
      float centralGlow = 1.0 - smoothstep(0.18, 1.16, length((p - vec2(-0.12, -0.04)) * vec2(0.74, 1.0)));
      background += vec3(0.008, 0.022, 0.065) * centralGlow;

      if (uMode == 4) {
        vec3 emptyScene = pow(acesFilm(background), vec3(0.454545));
        gl_FragColor = vec4(emptyScene, 1.0);
        return;
      }

      vec4 scene = vec4(background, 1.0);
      if (uMode == 1) {
        vec4 companion = renderStar(
          p, vec2(0.43, 0.20), 0.155, 0.79,
          vec3(0.025, 0.18, 0.82), vec3(0.48, 0.82, 1.28), -uTime * 0.52, 0.0
        );
        vec4 primary = renderStar(
          p, vec2(-0.24, -0.045), 0.55, 0.37,
          vec3(0.15, 0.018, 0.002), vec3(1.24, 0.38, 0.040), uTime, 0.0
        );
        scene = overColor(scene, companion);
        scene = overColor(scene, primary);
      } else {
        float diagnostic = uMode == 2 || uMode == 3 ? 1.0 : 0.0;
        vec3 cool = diagnostic > 0.5 ? vec3(0.24, 0.008, 0.035) : vec3(0.12, 0.012, 0.001);
        vec3 hot = diagnostic > 0.5 ? vec3(1.35, 0.055, 0.12) : vec3(1.26, 0.34, 0.032);
        vec4 star = renderStar(p, vec2(-0.245, -0.010), 0.49, 0.53, cool, hot, uTime, diagnostic);
        scene = overColor(scene, star);
      }

      if (uMode == 2 || uMode == 3) {
        vec2 diagnosticGrid = abs(fract((p + 1.0) * 10.0) - 0.5);
        float grid = 1.0 - smoothstep(0.0, 0.045, min(diagnosticGrid.x, diagnosticGrid.y));
        float scan = 1.0 - smoothstep(0.0, 0.025, abs(p.y - sin(uTime * 0.42) * 0.34));
        scene.rgb += vec3(0.84, 0.006, 0.075) * (grid * 0.10 + scan * 0.16);
        if (uMode == 3) scene.rgb = mix(scene.rgb, vec3(0.22, 0.001, 0.018), 0.40);
      }

      float vignette = 1.0 - smoothstep(0.47, 1.18, length(p * vec2(0.67, 1.0)));
      scene.rgb *= 0.70 + vignette * 0.30;
      scene.rgb += (hash21(gl_FragCoord.xy + uTime) - 0.5) / 255.0;
      scene.rgb = pow(acesFilm(scene.rgb), vec3(0.454545));
      gl_FragColor = vec4(scene.rgb, 1.0);
    }
  `;

  const BASE_FRAGMENT_SHADER = `
    precision highp float;
    varying vec2 vUv;
    uniform vec2 uResolution;
    uniform vec2 uPointer;
    uniform float uTime;
    uniform int uMode;
    uniform int uQuality;

    float hash21(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    float hash31(vec3 p) {
      p = fract(p * 0.1031);
      p += dot(p, p.yzx + 33.33);
      return fract((p.x + p.y) * p.z);
    }

    float noise3(vec3 p) {
      vec3 cell = floor(p);
      vec3 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      float a = hash31(cell);
      float b = hash31(cell + vec3(1.0, 0.0, 0.0));
      float c = hash31(cell + vec3(0.0, 1.0, 0.0));
      float d = hash31(cell + vec3(1.0, 1.0, 0.0));
      float e = hash31(cell + vec3(0.0, 0.0, 1.0));
      float f1 = hash31(cell + vec3(1.0, 0.0, 1.0));
      float g = hash31(cell + vec3(0.0, 1.0, 1.0));
      float h = hash31(cell + vec3(1.0, 1.0, 1.0));
      return mix(mix(mix(a, b, f.x), mix(c, d, f.x), f.y), mix(mix(e, f1, f.x), mix(g, h, f.x), f.y), f.z);
    }

    mat2 rotate2(float angle) {
      float s = sin(angle);
      float c = cos(angle);
      return mat2(c, -s, s, c);
    }

    vec3 starField(vec2 p, float time) {
      vec2 grid = p * (uQuality > 0 ? 78.0 : 52.0);
      vec2 cell = floor(grid);
      vec2 local = fract(grid) - 0.5;
      float random = hash21(cell);
      float star = smoothstep(0.055, 0.0, length(local)) * step(uQuality > 0 ? 0.969 : 0.982, random);
      float pulse = 0.78 + 0.22 * sin(time * 0.35 + random * 83.0);
      return mix(vec3(0.24, 0.48, 1.0), vec3(1.0, 0.79, 0.52), random) * star * pulse;
    }

    vec4 renderBaseStar(vec2 p, vec2 center, float radius, float seed, float time, float diagnostic) {
      vec2 q = (p - center) / radius;
      float radial = length(q);
      if (radial > 1.75) return vec4(0.0);
      float outside = max(0.0, radial - 1.0);
      float corona = exp(-outside * 7.5) * (1.0 - smoothstep(1.0, 1.72, radial));
      vec3 hot = diagnostic > 0.5 ? vec3(1.25, 0.04, 0.12) : vec3(1.24, 0.34, 0.025);
      vec3 dark = diagnostic > 0.5 ? vec3(0.12, 0.001, 0.025) : vec3(0.055, 0.004, 0.0);
      vec3 color = hot * corona * 0.72;
      float alpha = corona * 0.72;
      if (radial <= 1.0) {
        float z = sqrt(max(0.0, 1.0 - dot(q, q)));
        vec3 normal = normalize(vec3(q, z));
        normal.xz = rotate2(time * 0.075 + seed * 2.0) * normal.xz;
        float coarse = noise3(normal * 5.1 + seed * 11.0);
        float fine = noise3(normal * (uQuality > 0 ? 20.0 : 12.0) - vec3(time * 0.014, 0.0, time * 0.009));
        float filament = pow(1.0 - abs(fine * 2.0 - 1.0), uQuality > 0 ? 3.2 : 2.2);
        float molten = clamp(coarse * 0.58 + filament * 0.82, 0.0, 1.25);
        vec3 ember = diagnostic > 0.5 ? vec3(0.72, 0.015, 0.08) : vec3(0.66, 0.045, 0.001);
        vec3 gold = diagnostic > 0.5 ? vec3(1.42, 0.06, 0.14) : vec3(1.48, 0.45, 0.025);
        vec3 surface = mix(dark, ember, smoothstep(0.12, 0.55, molten));
        surface = mix(surface, gold, smoothstep(0.48, 1.05, molten));
        surface += vec3(1.75, 0.72, 0.14) * filament * 0.34;
        float limb = 0.18 + 0.82 * pow(z, 0.58);
        surface *= limb;
        surface += hot * pow(1.0 - z, 7.0) * 0.34;
        color = surface;
        alpha = 1.0;
      }
      return vec4(color, alpha);
    }

    vec4 overColor(vec4 back, vec4 front) {
      float alpha = front.a + back.a * (1.0 - front.a);
      vec3 color = (front.rgb * front.a + back.rgb * back.a * (1.0 - front.a)) / max(alpha, 0.0001);
      return vec4(color, alpha);
    }

    vec3 acesFilm(vec3 value) {
      return clamp((value * (2.51 * value + 0.03)) / (value * (2.43 * value + 0.59) + 0.14), 0.0, 1.0);
    }

    void main() {
      vec2 p = (gl_FragCoord.xy - 0.5 * uResolution.xy) / min(uResolution.x, uResolution.y);
      p -= uPointer * 0.040;
      vec3 background = vec3(0.0018, 0.0034, 0.012) + starField(p + uPointer * 0.045, uTime) * 0.58;
      if (uMode == 4) {
        gl_FragColor = vec4(pow(acesFilm(background), vec3(0.454545)), 1.0);
        return;
      }
      vec4 scene = vec4(background, 1.0);
      if (uMode == 1) {
        scene = overColor(scene, renderBaseStar(p, vec2(0.43, 0.20), 0.155, 0.79, -uTime * 0.52, 0.0));
        scene = overColor(scene, renderBaseStar(p, vec2(-0.24, -0.045), 0.55, 0.37, uTime, 0.0));
      } else {
        float diagnostic = uMode == 2 || uMode == 3 ? 1.0 : 0.0;
        scene = overColor(scene, renderBaseStar(p, vec2(-0.245, -0.010), 0.49, 0.53, uTime, diagnostic));
      }
      float vignette = 1.0 - smoothstep(0.47, 1.18, length(p * vec2(0.67, 1.0)));
      scene.rgb *= 0.70 + vignette * 0.30;
      scene.rgb = pow(acesFilm(scene.rgb), vec3(0.454545));
      gl_FragColor = vec4(scene.rgb, 1.0);
    }
  `;

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function shortHash(value) {
    return typeof value === "string" && value.length >= 14 ? `${value.slice(0, 8)}…${value.slice(-6)}` : "—";
  }

  function setText(id, value, fallback = "—") {
    const node = document.getElementById(id);
    if (node) node.textContent = value === null || value === undefined || value === "" ? fallback : String(value);
  }

  function modeForRole(role) {
    if (role === "periodic_binary") return 1;
    if (role === "hard_error") return 2;
    return 0;
  }

  function syncRenderingControls() {
    if (state.canvas) {
      state.canvas.dataset.stellarQuality = state.quality;
      state.canvas.dataset.stellarSpeed = state.speed;
      state.canvas.dataset.stellarTexture = state.textureReady ? "photographic" : state.textureFailed ? "failed" : "procedural";
    }
    if (!state.stageElement) return;
    state.stageElement.dataset.stellarQuality = state.quality;
    state.stageElement.dataset.stellarSpeed = state.speed;
    state.stageElement.dataset.stellarTexture = state.textureReady ? "photographic" : state.textureFailed ? "failed" : "procedural";
    state.stageElement.querySelectorAll("button[data-stellar-quality]").forEach((button) => {
      button.setAttribute("aria-pressed", button.dataset.stellarQuality === state.quality ? "true" : "false");
    });
    state.stageElement.querySelectorAll("button[data-stellar-speed]").forEach((button) => {
      button.setAttribute("aria-pressed", button.dataset.stellarSpeed === state.speed ? "true" : "false");
    });
    const qualityLabel = state.quality === "cinema" ? "电影级" : state.quality === "safe" ? "安全级" : "流畅级";
    const speedLabel = state.quality === "cinema" && state.cinemaProgramLoading
      ? "电影 Shader 预热中"
      : state.quality === "cinema" && state.textureLoading && !state.textureReady
        ? "照片材质加载中"
      : state.speed === "paused" ? "已暂停" : state.speed === "fast" ? "2× 旋转" : "实时证据同步";
    setText("stellarRenderStatus", `${qualityLabel} · ${speedLabel}`);
  }

  function findMount() {
    let canvas = document.getElementById("stellarTwinCanvas");
    let host = canvas && canvas.parentElement;
    if (!host) {
      host = document.querySelector("[data-stellar-twin]")
        || document.getElementById("stellarTwinStage")
        || document.getElementById("stellarTwinViewport");
    }
    if (!host) return false;
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.id = "stellarTwinCanvas";
      canvas.className = "stellar-twin-canvas";
      canvas.setAttribute("role", "img");
      host.prepend(canvas);
      state.ownsCanvas = true;
    }
    const stageElement = canvas.closest("#stellarTwinStage") || host.closest("[data-stellar-twin]") || host;
    let disclaimer = stageElement.querySelector("[data-stellar-disclaimer], .stellar-twin-disclaimer");
    if (!disclaimer) {
      disclaimer = document.createElement("p");
      disclaimer.className = "stellar-twin-disclaimer";
      disclaimer.dataset.stellarDisclaimer = "true";
      disclaimer.textContent = "EVIDENCE-SYNCHRONIZED VISUALIZATION · 非物理参数反演";
      host.append(disclaimer);
      state.ownsDisclaimer = true;
    }
    state.canvas = canvas;
    state.host = host;
    state.stageElement = stageElement;
    state.disclaimer = disclaimer;
    updateAccessibleLabel();
    syncRenderingControls();
    return true;
  }

  function updateAccessibleLabel() {
    if (!state.canvas) return;
    let description = "AstroTwin 证据同步恒星数字孪生视觉效果；表面颗粒、星斑、日冕与耀斑是程序化舞台表达，不表示实测物理参数。";
    if (state.failed) description = `恒星数字孪生已安全关闭：${state.failureMessage || "证据不可用"}`;
    else if (state.eligible) {
      const roleLabel = state.role === "periodic_binary" ? "周期双星与遮掩意象"
        : state.role === "hard_error" ? "红色错例诊断意象" : "单星证据同步意象";
      description += ` 当前为${roleLabel}，证据 SHA-256 ${shortHash(state.evidenceHash)}。`;
    } else description += " 当前等待通过同源验真的证据。";
    state.canvas.setAttribute("aria-label", description);
    state.canvas.dataset.stellarState = state.failed ? "failed" : state.eligible ? "ready" : "pending";
    state.canvas.dataset.stellarActiveRole = state.role;
  }

  function validateEvidenceDetail(detail) {
    if (!isObject(detail) || detail.eligible !== true || !HASH_PATTERN.test(detail.sha256 || "") || !isObject(detail.stage)) {
      throw new Error("恒星数字孪生证据字段不完整");
    }
    const stage = detail.stage;
    if (stage.artifact_type !== "P07_REAL_TESS_LIGHT_CURVE_SHOWCASE"
      || !isObject(stage.derivation)
      || stage.derivation.waveform_generated_or_synthesized !== false
      || stage.derivation.sector4_used !== false
      || !Array.isArray(stage.samples)
      || stage.samples.length !== ROLE_ORDER.length) {
      throw new Error("恒星数字孪生证据语义未通过预检");
    }
    const samples = new Map();
    stage.samples.forEach((sample, index) => {
      if (!isObject(sample) || sample.role !== ROLE_ORDER[index]
        || typeof sample.display_id !== "string" || !sample.display_id
        || typeof sample.source_fits_sha256 !== "string" || !HASH_PATTERN.test(sample.source_fits_sha256)
        || !Number.isInteger(sample.sector) || sample.sector < 1 || sample.sector > 3
        || typeof sample.period_days !== "number" || !Number.isFinite(sample.period_days) || sample.period_days <= 0
        || typeof sample.headline !== "string" || !sample.headline
        || typeof sample.story !== "string" || !sample.story
        || typeof sample.truth !== "string" || typeof sample.prediction !== "string"
        || !isObject(sample.statistics)
        || typeof sample.statistics.flux_min !== "number" || !Number.isFinite(sample.statistics.flux_min)
        || typeof sample.statistics.flux_max !== "number" || !Number.isFinite(sample.statistics.flux_max)
        || sample.statistics.flux_min > sample.statistics.flux_max) {
        throw new Error("恒星数字孪生样本绑定无效");
      }
      samples.set(sample.role, sample);
    });
    return { stage, sha256: detail.sha256, samples };
  }

  function validateSampleDetail(detail) {
    if (!isObject(detail) || !ROLE_ORDER.includes(detail.role) || !isObject(detail.sample) || detail.sample.role !== detail.role) {
      throw new Error("恒星数字孪生样本事件无效");
    }
    return { role: detail.role, sample: detail.sample };
  }

  function bindSample(detail) {
    const incoming = validateSampleDetail(detail);
    if (!state.eligible) {
      state.pendingSample = incoming;
      return;
    }
    const bound = state.evidenceSamples.get(incoming.role);
    if (!bound
      || bound.display_id !== incoming.sample.display_id
      || bound.source_fits_sha256 !== incoming.sample.source_fits_sha256
      || bound.truth !== incoming.sample.truth
      || bound.prediction !== incoming.sample.prediction) {
      failClosed("样本事件与已验真的恒星证据不一致");
      return;
    }
    state.role = incoming.role;
    state.sample = bound;
    state.pendingSample = null;
    updateAccessibleLabel();
    syncSampleDom();
    renderOnce();
  }

  function modeLabel(role) {
    if (role === "periodic_binary") return "BINARY ECLIPSE";
    if (role === "hard_error") return "ERROR DIAGNOSTIC";
    return "SINGLE STAR";
  }

  function syncSampleDom() {
    const sample = state.sample;
    if (!sample || !state.eligible || state.failed) return;
    const fluxMinimum = sample.statistics.flux_min;
    const fluxMaximum = sample.statistics.flux_max;
    setText("stellarTwinMode", modeLabel(state.role));
    setText("stellarTwinObject", sample.display_id);
    setText("stellarTwinSector", `SECTOR ${sample.sector}`);
    setText("stellarTwinPeriod", `${sample.period_days.toFixed(6)} d`);
    setText("stellarTwinFlux", `${fluxMinimum.toFixed(6)} – ${fluxMaximum.toFixed(6)}`);
    setText("stellarTwinFitsHash", shortHash(sample.source_fits_sha256));
    setText("stellarTwinHeadline", sample.headline);
    const visualMode = state.role === "periodic_binary"
      ? "双星与遮掩仅用于强调该样本的周期结构"
      : state.role === "hard_error"
        ? "红色诊断效果用于强调 V→IS 的保留错例"
        : "旋转单星用于串联当前真实光变与分类 verdict";
    setText("stellarTwinNarrative", `${sample.story} ${visualMode}；程序化表面不代表真实恒星表面反演。`);
    const summary = `证据同步恒星视觉：${sample.display_id}，TESS Sector ${sample.sector}，周期 ${sample.period_days.toFixed(6)} 天，归一化光度 ${fluxMinimum.toFixed(6)} 到 ${fluxMaximum.toFixed(6)}，真实标签 ${sample.truth}，模型预测 ${sample.prediction}。视觉纹理不表示实测物理参数。`;
    setText("stellarTwinSummary", summary);
    document.querySelectorAll("button[data-stellar-sample]").forEach((button) => {
      const selected = button.dataset.stellarSample === state.role;
      const target = state.evidenceSamples.get(button.dataset.stellarSample);
      button.disabled = false;
      button.setAttribute("aria-pressed", selected ? "true" : "false");
      const detail = button.querySelector("small");
      if (detail && target) detail.textContent = `S${target.sector} · ${target.truth}→${target.prediction}`;
    });
    const focusButton = document.getElementById("stellarTwinFocusButton");
    if (focusButton) focusButton.disabled = false;
  }

  function syncReadyDom() {
    if (state.stageElement) state.stageElement.dataset.state = "ready";
    const loading = document.getElementById("stellarTwinLoading");
    if (loading) loading.hidden = true;
    const failure = document.getElementById("stellarTwinFailure");
    if (failure) failure.hidden = true;
    document.querySelectorAll("button[data-stellar-sample]").forEach((button) => { button.disabled = false; });
    const focusButton = document.getElementById("stellarTwinFocusButton");
    if (focusButton) focusButton.disabled = false;
    syncSampleDom();
  }

  function syncFailedDom() {
    if (state.stageElement) state.stageElement.dataset.state = "failed";
    const loading = document.getElementById("stellarTwinLoading");
    if (loading) loading.hidden = true;
    const failure = document.getElementById("stellarTwinFailure");
    if (failure) {
      failure.hidden = false;
      const message = failure.querySelector("small");
      if (message) message.textContent = `Fail-closed · ${state.failureMessage}`;
    }
    setText("stellarTwinMode", "BLOCKED");
    setText("stellarTwinSummary", `恒星数字孪生已安全关闭：${state.failureMessage}`);
    document.querySelectorAll("button[data-stellar-sample]").forEach((button) => {
      button.disabled = true;
      button.setAttribute("aria-pressed", "false");
    });
    const focusButton = document.getElementById("stellarTwinFocusButton");
    if (focusButton) {
      focusButton.disabled = true;
      focusButton.setAttribute("aria-pressed", "false");
    }
  }

  function createShader(gl, type, source, validate = true) {
    const shader = gl.createShader(type);
    if (!shader) throw new Error("无法创建 WebGL shader");
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (validate && !gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(shader) || "WebGL shader 编译失败";
      gl.deleteShader(shader);
      throw new Error(message);
    }
    return shader;
  }

  function releaseWebGLResources() {
    const gl = state.gl;
    if (!gl) return;
    window.clearTimeout(state.cinemaCompileTimer);
    state.cinemaCompileTimer = null;
    if (state.cinemaCompileJob) {
      gl.deleteProgram(state.cinemaCompileJob.program);
      gl.deleteShader(state.cinemaCompileJob.vertex);
      gl.deleteShader(state.cinemaCompileJob.fragment);
      state.cinemaCompileJob = null;
    }
    const bundles = [state.baseBundle, state.cinemaBundle].filter((bundle, index, values) => (
      bundle && values.indexOf(bundle) === index
    ));
    bundles.forEach((bundle) => {
      if (bundle.buffer) gl.deleteBuffer(bundle.buffer);
      if (bundle.program) gl.deleteProgram(bundle.program);
    });
    if (state.texture) gl.deleteTexture(state.texture);
    state.buffer = null;
    state.texture = null;
    state.textureReady = false;
    state.program = null;
    state.baseBundle = null;
    state.cinemaBundle = null;
    state.cinemaCompileStartedAt = null;
    state.attributes = null;
    state.uniforms = null;
    state.cinemaProgramReady = false;
    state.cinemaProgramLoading = false;
    state.parallelCompileSupported = false;
  }

  function uploadCinemaTexture(image) {
    const gl = state.gl;
    if (!gl || !image || !image.complete || !image.naturalWidth) return false;
    if (state.texture) gl.deleteTexture(state.texture);
    const texture = gl.createTexture();
    if (!texture) return false;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.generateMipmap(gl.TEXTURE_2D);
    state.texture = texture;
    state.textureReady = true;
    state.textureFailed = false;
    syncRenderingControls();
    renderOnce();
    return true;
  }

  function prepareCinemaTexture() {
    if (state.destroyed || state.textureReady) return;
    if (state.textureImage && state.textureImage.complete && state.textureImage.naturalWidth) {
      uploadCinemaTexture(state.textureImage);
      return;
    }
    if (state.textureLoading) return;
    state.textureLoading = true;
    state.textureFailed = false;
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      state.textureLoading = false;
      if (state.destroyed) return;
      state.textureImage = image;
      if (!uploadCinemaTexture(image)) {
        state.textureFailed = true;
        if (state.quality === "cinema") selectQuality("balanced");
      }
      syncRenderingControls();
    };
    image.onerror = () => {
      state.textureLoading = false;
      state.textureFailed = true;
      if (state.quality === "cinema") selectQuality("balanced");
      syncRenderingControls();
    };
    state.textureImage = image;
    image.src = CINEMA_TEXTURE_URL;
    syncRenderingControls();
  }

  function createWebGLProgramJob(gl, cinema, validateShaders = true) {
    let vertex = null;
    let fragment = null;
    let program = null;
    try {
      vertex = createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER, validateShaders);
      const source = cinema ? `#define ASTROTWIN_CINEMA 1\n${FRAGMENT_SHADER}` : BASE_FRAGMENT_SHADER;
      fragment = createShader(gl, gl.FRAGMENT_SHADER, source, validateShaders);
      program = gl.createProgram();
      if (!program) throw new Error("无法创建 WebGL program");
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.linkProgram(program);
      return { program, vertex, fragment, cinema };
    } catch (error) {
      if (program) gl.deleteProgram(program);
      if (vertex) gl.deleteShader(vertex);
      if (fragment) gl.deleteShader(fragment);
      throw error;
    }
  }

  function finalizeWebGLProgramJob(gl, job) {
    let buffer = null;
    try {
      if (!gl.getShaderParameter(job.vertex, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(job.vertex) || "WebGL vertex shader 编译失败");
      }
      if (!gl.getShaderParameter(job.fragment, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(job.fragment) || "WebGL fragment shader 编译失败");
      }
      if (!gl.getProgramParameter(job.program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(job.program) || "WebGL program 链接失败");
      }
      buffer = gl.createBuffer();
      if (!buffer) throw new Error("无法创建 WebGL buffer");
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1, 1, -1, -1, 1,
        -1, 1, 1, -1, 1, 1,
      ]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(job.program, "aPosition");
      const uniforms = {
        resolution: gl.getUniformLocation(job.program, "uResolution"),
        pointer: gl.getUniformLocation(job.program, "uPointer"),
        time: gl.getUniformLocation(job.program, "uTime"),
        mode: gl.getUniformLocation(job.program, "uMode"),
        quality: gl.getUniformLocation(job.program, "uQuality"),
        photosphere: job.cinema ? gl.getUniformLocation(job.program, "uPhotosphere") : null,
        textureReady: job.cinema ? gl.getUniformLocation(job.program, "uTextureReady") : null,
      };
      const required = [uniforms.resolution, uniforms.pointer, uniforms.time, uniforms.mode, uniforms.quality];
      if (position < 0 || required.some((location) => location === null)
        || (job.cinema && (uniforms.photosphere === null || uniforms.textureReady === null))) {
        throw new Error("WebGL uniform 契约不完整");
      }
      return { program: job.program, buffer, attributes: { position }, uniforms, cinema: job.cinema };
    } catch (error) {
      if (buffer) gl.deleteBuffer(buffer);
      gl.deleteProgram(job.program);
      throw error;
    } finally {
      gl.deleteShader(job.vertex);
      gl.deleteShader(job.fragment);
    }
  }

  function createWebGLBundle(gl, cinema) {
    return finalizeWebGLProgramJob(gl, createWebGLProgramJob(gl, cinema));
  }

  function installWebGLBundle(bundle) {
    const gl = state.gl;
    if (!gl || !bundle) return false;
    const cacheKey = bundle.cinema ? "cinemaBundle" : "baseBundle";
    const previous = state[cacheKey];
    if (previous && previous !== bundle) {
      gl.deleteBuffer(previous.buffer);
      gl.deleteProgram(previous.program);
    }
    state[cacheKey] = bundle;
    state.program = bundle.program;
    state.buffer = bundle.buffer;
    state.attributes = bundle.attributes;
    state.uniforms = bundle.uniforms;
    if (bundle.cinema) {
      state.cinemaProgramReady = true;
      state.cinemaProgramFailed = false;
    }
    return true;
  }

  function finishCinemaProgramCompilation() {
    const gl = state.gl;
    const job = state.cinemaCompileJob;
    if (!gl || !job || state.destroyed) return;
    if (performance.now() - state.cinemaCompileStartedAt > 45000) {
      gl.deleteProgram(job.program);
      gl.deleteShader(job.vertex);
      gl.deleteShader(job.fragment);
      state.cinemaCompileJob = null;
      state.cinemaProgramLoading = false;
      state.cinemaProgramFailed = true;
      if (state.quality === "cinema") state.quality = "balanced";
      syncRenderingControls();
      return;
    }
    if (!gl.getProgramParameter(job.program, job.extension.COMPLETION_STATUS_KHR)) {
      state.cinemaCompileTimer = window.setTimeout(finishCinemaProgramCompilation, 50);
      return;
    }
    try {
      const bundle = finalizeWebGLProgramJob(gl, job);
      state.cinemaCompileJob = null;
      state.cinemaProgramLoading = false;
      state.cinemaBundle = bundle;
      state.cinemaProgramReady = true;
      state.cinemaProgramFailed = false;
      if (state.quality === "cinema") installWebGLBundle(bundle);
    } catch (error) {
      state.cinemaCompileJob = null;
      state.cinemaProgramLoading = false;
      state.cinemaProgramFailed = true;
      if (state.quality === "cinema") state.quality = "balanced";
    }
    syncRenderingControls();
    resizeCanvas();
    renderOnce(state.lastTime * 1000);
  }

  function startCinemaProgramCompilation() {
    if (state.cinemaProgramReady || state.cinemaProgramLoading || !state.gl) return;
    prepareCinemaTexture();
    state.cinemaProgramLoading = true;
    state.cinemaProgramFailed = false;
    state.cinemaCompileStartedAt = performance.now();
    const gl = state.gl;
    const extension = gl.getExtension("KHR_parallel_shader_compile");
    state.parallelCompileSupported = Boolean(extension);
    syncRenderingControls();
    window.setTimeout(() => {
      if (state.destroyed || !state.gl) return;
      if (!extension) {
        try {
          const bundle = createWebGLBundle(gl, true);
          state.cinemaProgramLoading = false;
          state.cinemaProgramReady = true;
          state.cinemaProgramFailed = false;
          state.cinemaBundle = bundle;
          if (state.quality === "cinema") installWebGLBundle(bundle);
        } catch (error) {
          state.cinemaProgramLoading = false;
          state.cinemaProgramFailed = true;
          if (state.quality === "cinema") state.quality = "balanced";
        }
        syncRenderingControls();
        resizeCanvas();
        renderOnce(state.lastTime * 1000);
        return;
      }
      try {
        state.cinemaCompileJob = createWebGLProgramJob(gl, true, false);
        state.cinemaCompileJob.extension = extension;
        finishCinemaProgramCompilation();
      } catch (error) {
        state.cinemaCompileJob = null;
        state.cinemaProgramLoading = false;
        state.cinemaProgramFailed = true;
        if (state.quality === "cinema") state.quality = "balanced";
        syncRenderingControls();
      }
    }, 0);
  }

  function initWebGL() {
    if (!state.canvas) return false;
    const gl = state.canvas.getContext("webgl", {
      alpha: true,
      antialias: true,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      powerPreference: "high-performance",
    }) || state.canvas.getContext("experimental-webgl", { alpha: true, antialias: true });
    if (!gl) return false;
    try {
      state.gl = gl;
      installWebGLBundle(createWebGLBundle(gl, false));
      state.contextKind = "webgl";
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      if (state.quality === "cinema") startCinemaProgramCompilation();
      return true;
    } catch (_) {
      state.gl = gl;
      releaseWebGLResources();
      state.gl = null;
      return false;
    }
  }

  function replaceCanvasFor2D() {
    if (!state.canvas || !state.canvas.parentNode) return false;
    const replacement = document.createElement("canvas");
    replacement.id = state.canvas.id || "stellarTwinCanvas";
    replacement.className = state.canvas.className || "stellar-twin-canvas";
    replacement.setAttribute("role", "img");
    state.canvas.parentNode.replaceChild(replacement, state.canvas);
    state.canvas = replacement;
    state.ownsCanvas = true;
    updateAccessibleLabel();
    syncRenderingControls();
    attachCanvasContextEvents();
    return true;
  }

  function init2D(replace = false) {
    if (replace && !replaceCanvasFor2D()) return false;
    if (!state.canvas) return false;
    const context = state.canvas.getContext("2d", { alpha: true });
    if (!context) return false;
    state.context2d = context;
    state.contextKind = "2d";
    return true;
  }

  function resizeCanvas() {
    if (!state.canvas || !state.host) return false;
    const rectangle = state.canvas.getBoundingClientRect();
    const hostRectangle = state.host.getBoundingClientRect();
    const cssWidth = Math.max(2, Math.round(rectangle.width || hostRectangle.width || window.innerWidth));
    const cssHeight = Math.max(2, Math.round(rectangle.height || hostRectangle.height || window.innerHeight));
    const profile = QUALITY_PROFILES[state.quality] || QUALITY_PROFILES.balanced;
    const dpr = profile.dpr;
    const width = Math.round(cssWidth * dpr);
    const height = Math.round(cssHeight * dpr);
    if (state.canvas.width === width && state.canvas.height === height) return false;
    state.canvas.width = width;
    state.canvas.height = height;
    if (state.gl) state.gl.viewport(0, 0, width, height);
    return true;
  }

  function renderWebGL(timeSeconds) {
    const gl = state.gl;
    if (!gl || !state.program || !state.buffer || !state.uniforms || !state.attributes) return;
    resizeCanvas();
    gl.viewport(0, 0, state.canvas.width, state.canvas.height);
    gl.useProgram(state.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, state.buffer);
    gl.enableVertexAttribArray(state.attributes.position);
    gl.vertexAttribPointer(state.attributes.position, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2f(state.uniforms.resolution, state.canvas.width, state.canvas.height);
    gl.uniform2f(state.uniforms.pointer, state.pointer.x, state.pointer.y);
    gl.uniform1f(state.uniforms.time, timeSeconds);
    const mode = state.failed ? 3 : state.eligible ? modeForRole(state.role) : 4;
    gl.uniform1i(state.uniforms.mode, mode);
    gl.uniform1i(state.uniforms.quality, (QUALITY_PROFILES[state.quality] || QUALITY_PROFILES.balanced).shader);
    if (state.uniforms.photosphere !== null && state.uniforms.textureReady !== null) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, state.textureReady ? state.texture : null);
      gl.uniform1i(state.uniforms.photosphere, 0);
      gl.uniform1i(state.uniforms.textureReady, state.textureReady ? 1 : 0);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  function seededUnit(seed) {
    return Math.abs(Math.sin(seed * 127.1 + 311.7) * 43758.5453) % 1;
  }

  function draw2DBackground(context, width, height, timeSeconds) {
    const background = context.createRadialGradient(width * 0.52, height * 0.45, 0, width * 0.52, height * 0.45, Math.max(width, height) * 0.75);
    background.addColorStop(0, "#071735");
    background.addColorStop(0.55, "#03091b");
    background.addColorStop(1, "#01030b");
    context.fillStyle = background;
    context.fillRect(0, 0, width, height);
    for (let index = 0; index < 130; index += 1) {
      const x = seededUnit(index * 3.1) * width;
      const y = seededUnit(index * 5.3 + 7) * height;
      const radius = seededUnit(index * 9.7) > 0.93 ? 1.7 : 0.7;
      const pulse = 0.42 + 0.25 * Math.sin(timeSeconds * 0.5 + index);
      context.fillStyle = `rgba(151, 207, 255, ${Math.max(0.12, pulse)})`;
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
    }
  }

  function draw2DStar(context, centerX, centerY, radius, seed, diagnostic, timeSeconds) {
    const corona = context.createRadialGradient(centerX, centerY, radius * 0.72, centerX, centerY, radius * 1.55);
    corona.addColorStop(0, diagnostic ? "rgba(255,50,86,.42)" : "rgba(255,176,72,.44)");
    corona.addColorStop(0.45, diagnostic ? "rgba(216,23,72,.18)" : "rgba(70,169,255,.17)");
    corona.addColorStop(1, "rgba(0,0,0,0)");
    context.fillStyle = corona;
    context.beginPath();
    context.arc(centerX, centerY, radius * 1.58, 0, Math.PI * 2);
    context.fill();

    const surface = context.createRadialGradient(centerX - radius * 0.28, centerY - radius * 0.32, radius * 0.04, centerX, centerY, radius);
    if (diagnostic) {
      surface.addColorStop(0, "#ffd1ba");
      surface.addColorStop(0.35, "#ff525f");
      surface.addColorStop(0.78, "#a11242");
      surface.addColorStop(1, "#250316");
    } else {
      surface.addColorStop(0, "#fff7cd");
      surface.addColorStop(0.28, "#ffd36a");
      surface.addColorStop(0.7, "#e45f29");
      surface.addColorStop(1, "#35122e");
    }
    context.fillStyle = surface;
    context.beginPath();
    context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    context.fill();

    context.save();
    context.beginPath();
    context.arc(centerX, centerY, radius * 0.985, 0, Math.PI * 2);
    context.clip();
    for (let index = 0; index < 180; index += 1) {
      const angle = seededUnit(index * 2.9 + seed) * Math.PI * 2 + timeSeconds * 0.04;
      const distance = Math.sqrt(seededUnit(index * 7.3 + seed)) * radius * 0.91;
      const x = centerX + Math.cos(angle) * distance;
      const y = centerY + Math.sin(angle) * distance * 0.78;
      const size = radius * (0.004 + seededUnit(index * 11.1) * 0.018);
      const spot = seededUnit(index * 17.7 + seed) > 0.88;
      context.fillStyle = spot
        ? diagnostic ? "rgba(73,0,31,.55)" : "rgba(83,21,38,.43)"
        : diagnostic ? "rgba(255,226,190,.12)" : "rgba(255,248,184,.16)";
      context.beginPath();
      context.ellipse(x, y, spot ? size * 2.8 : size, size, angle, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();

    context.save();
    context.strokeStyle = diagnostic ? "rgba(255,92,125,.72)" : "rgba(255,190,91,.64)";
    context.lineWidth = Math.max(1, radius * 0.012);
    context.shadowColor = diagnostic ? "#ff315f" : "#ffb85f";
    context.shadowBlur = radius * 0.09;
    context.beginPath();
    context.arc(centerX, centerY, radius * 1.13, -1.0 + seed, -0.42 + seed);
    context.stroke();
    context.restore();
  }

  function render2D(timeSeconds) {
    const context = state.context2d;
    if (!context || !state.canvas) return;
    resizeCanvas();
    const width = state.canvas.width;
    const height = state.canvas.height;
    context.clearRect(0, 0, width, height);
    draw2DBackground(context, width, height, timeSeconds);
    if (!state.eligible && !state.failed) return;
    const pointerX = state.pointer.x * width * 0.04;
    const pointerY = -state.pointer.y * height * 0.04;
    const radius = Math.min(width, height) * 0.34;
    if (state.role === "periodic_binary" && !state.failed) {
      draw2DStar(context, width * 0.40 + pointerX, height * 0.50 + pointerY, radius * 0.88, 0.37, false, timeSeconds);
      draw2DStar(context, width * 0.64 + pointerX, height * 0.51 + pointerY, radius * 0.62, 0.79, false, -timeSeconds * 0.78);
      context.fillStyle = "rgba(3,6,18,.22)";
      context.beginPath();
      context.ellipse(width * 0.52 + pointerX, height * 0.51 + pointerY, radius * 0.18, radius * 0.65, 0, 0, Math.PI * 2);
      context.fill();
    } else {
      draw2DStar(context, width * 0.52 + pointerX, height * 0.50 + pointerY, radius, 0.53, state.failed || state.role === "hard_error", timeSeconds);
    }
    if (state.failed || state.role === "hard_error") {
      context.save();
      context.strokeStyle = "rgba(255,58,92,.17)";
      context.lineWidth = 1;
      const step = Math.max(42, Math.round(Math.min(width, height) / 11));
      for (let x = 0; x < width; x += step) {
        context.beginPath(); context.moveTo(x, 0); context.lineTo(x, height); context.stroke();
      }
      for (let y = 0; y < height; y += step) {
        context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke();
      }
      context.restore();
    }
  }

  function renderOnce(timeMilliseconds) {
    if (!state.canvas || state.destroyed) return;
    const timeSeconds = REDUCED_MOTION.matches ? 8 : (Number.isFinite(timeMilliseconds) ? timeMilliseconds / 1000 : state.lastTime || 0);
    state.lastTime = timeSeconds;
    if (state.contextKind === "webgl") renderWebGL(timeSeconds);
    else if (state.contextKind === "2d") render2D(timeSeconds);
  }

  function stopAnimation() {
    if (state.frame !== null) window.cancelAnimationFrame(state.frame);
    state.frame = null;
    state.startedAt = null;
  }

  function playbackMultiplier() {
    if (state.focusRunning) return 1.85;
    return Object.prototype.hasOwnProperty.call(SPEED_PROFILES, state.speed) ? SPEED_PROFILES[state.speed] : 1;
  }

  function animationFrame(now) {
    if (state.destroyed || !state.visible || !state.eligible || state.failed || REDUCED_MOTION.matches) {
      state.frame = null;
      return;
    }
    const multiplier = playbackMultiplier();
    if (multiplier <= 0) {
      state.frame = null;
      renderOnce(state.lastTime * 1000);
      return;
    }
    if (state.startedAt === null) state.startedAt = now;
    const elapsed = Math.min(100, Math.max(0, now - state.startedAt));
    state.startedAt = now;
    if (state.focusRunning && state.focusStartedAt !== null) {
      const focusElapsed = Math.min(29999, state.focusElapsed + Math.max(0, performance.now() - state.focusStartedAt));
      updateFocusStep(focusElapsed);
      const focusPhase = focusElapsed * 0.001;
      state.pointer.targetX = Math.sin(focusPhase * 0.82) * 0.52;
      state.pointer.targetY = Math.cos(focusPhase * 0.57) * 0.28;
    }
    state.pointer.x += (state.pointer.targetX - state.pointer.x) * 0.045;
    state.pointer.y += (state.pointer.targetY - state.pointer.y) * 0.045;
    renderOnce((state.lastTime + elapsed * 0.001 * multiplier) * 1000);
    state.frame = window.requestAnimationFrame(animationFrame);
  }

  function startAnimation() {
    stopAnimation();
    if (!state.canvas || !state.visible || !state.eligible || state.failed) {
      renderOnce();
      return;
    }
    if (REDUCED_MOTION.matches) {
      state.pointer.x = 0;
      state.pointer.y = 0;
      state.pointer.targetX = 0;
      state.pointer.targetY = 0;
      renderOnce();
      return;
    }
    if (playbackMultiplier() <= 0) {
      renderOnce(state.lastTime * 1000);
      return;
    }
    state.frame = window.requestAnimationFrame(animationFrame);
  }

  function onPointerMove(event) {
    if (!state.host || REDUCED_MOTION.matches || state.failed || !state.eligible || state.focusRunning || !state.pointerDragging) return;
    const rectangle = state.host.getBoundingClientRect();
    if (!rectangle.width || !rectangle.height) return;
    const deltaX = (event.clientX - state.pointerLastX) / rectangle.width;
    const deltaY = (event.clientY - state.pointerLastY) / rectangle.height;
    state.pointerLastX = event.clientX;
    state.pointerLastY = event.clientY;
    state.pointer.targetX = Math.max(-1, Math.min(1, state.pointer.targetX + deltaX * 2.8));
    state.pointer.targetY = Math.max(-1, Math.min(1, state.pointer.targetY - deltaY * 2.8));
    if (playbackMultiplier() <= 0) {
      state.pointer.x = state.pointer.targetX;
      state.pointer.y = state.pointer.targetY;
      renderOnce(state.lastTime * 1000);
    }
  }

  function onPointerDown(event) {
    if (!state.host || event.button !== 0 || state.focusRunning || state.failed || !state.eligible) return;
    if (event.target instanceof Element && event.target.closest("#photonCourt")) return;
    state.pointerDragging = true;
    state.pointerId = event.pointerId;
    state.pointerLastX = event.clientX;
    state.pointerLastY = event.clientY;
    if (typeof state.host.setPointerCapture === "function") state.host.setPointerCapture(event.pointerId);
    if (state.canvas) state.canvas.dataset.stellarDragging = "true";
  }

  function endPointerDrag(event) {
    if (!state.pointerDragging || (state.pointerId !== null && event.pointerId !== state.pointerId)) return;
    if (state.host && typeof state.host.hasPointerCapture === "function" && state.host.hasPointerCapture(event.pointerId)) {
      state.host.releasePointerCapture(event.pointerId);
    }
    state.pointerDragging = false;
    state.pointerId = null;
    if (state.canvas) state.canvas.dataset.stellarDragging = "false";
  }

  function syncFocusButton() {
    const button = document.getElementById("stellarTwinFocusButton");
    if (!button) return;
    button.setAttribute("aria-pressed", state.focusRunning ? "true" : "false");
    const title = button.querySelector("strong");
    const detail = button.querySelector("small");
    if (title) title.textContent = state.focusRunning ? "暂停聚焦演示" : state.focusPaused ? "继续 30 秒聚焦" : "启动 30 秒聚焦";
    if (detail) detail.textContent = state.focusRunning
      ? `${FOCUS_STEPS[Math.max(0, state.focusStep)]?.label || "证据同步旋转中"} · 可暂停`
      : state.focusPaused ? "从当前分幕继续 · 不重置样本" : "自动旋转 · 视觉化不代表表面反演";
  }

  function updateFocusStep(elapsedMilliseconds) {
    const stepIndex = Math.min(FOCUS_STEPS.length - 1, Math.floor(Math.max(0, elapsedMilliseconds) / 10000));
    if (stepIndex === state.focusStep) return;
    state.focusStep = stepIndex;
    const step = FOCUS_STEPS[stepIndex];
    if (state.stageElement) state.stageElement.dataset.stellarFocusStep = String(stepIndex + 1);
    window.dispatchEvent(new CustomEvent(SELECT_REQUEST_EVENT, { detail: { role: step.role, source: "focus" } }));
    setText("stellarTwinSummary", `30 秒聚焦演示：${step.label}。恒星视角正在自动环绕，程序按已验真样本切换观测信号与模型结果。`);
    syncFocusButton();
  }

  function stopFocus(reset = true) {
    window.clearTimeout(state.focusTimer);
    state.focusTimer = null;
    state.focusRunning = false;
    state.focusStartedAt = null;
    if (reset) {
      state.focusElapsed = 0;
      state.focusPaused = false;
      state.focusStep = -1;
      if (state.stageElement) {
        state.stageElement.dataset.stellarFocus = "idle";
        delete state.stageElement.dataset.stellarFocusStep;
      }
    } else if (state.stageElement) {
      state.stageElement.dataset.stellarFocus = "paused";
    }
    syncFocusButton();
  }

  function pauseFocus() {
    if (!state.focusRunning) return;
    if (state.focusStartedAt !== null) state.focusElapsed += Math.max(0, performance.now() - state.focusStartedAt);
    state.focusElapsed = Math.min(30000, state.focusElapsed);
    state.focusPaused = state.focusElapsed < 30000;
    stopFocus(false);
  }

  function finishFocus() {
    stopFocus(true);
    startAnimation();
    setText("stellarTwinSummary", "30 秒证据同步聚焦已完成；恒星恢复常速旋转，视觉形态仍不代表真实表面反演。");
  }

  function toggleFocus() {
    if (!state.eligible || state.failed) return;
    if (state.focusRunning) {
      pauseFocus();
      return;
    }
    if (REDUCED_MOTION.matches) {
      setText("stellarTwinSummary", "系统检测到减少动画偏好，已保留静态证据同步恒星视图，不启动自动旋转。");
      renderOnce();
      return;
    }
    const remaining = Math.max(1, 30000 - state.focusElapsed);
    state.focusRunning = true;
    state.focusPaused = false;
    state.focusStartedAt = performance.now();
    if (state.stageElement) state.stageElement.dataset.stellarFocus = "running";
    updateFocusStep(state.focusElapsed);
    syncFocusButton();
    startAnimation();
    state.focusTimer = window.setTimeout(finishFocus, remaining);
  }

  function selectQuality(quality) {
    if (!Object.prototype.hasOwnProperty.call(QUALITY_PROFILES, quality)) return;
    state.quality = quality;
    if (quality === "cinema" && state.gl) {
      prepareCinemaTexture();
      if (state.cinemaProgramReady && state.cinemaBundle) installWebGLBundle(state.cinemaBundle);
      else startCinemaProgramCompilation();
    } else if (state.gl && state.baseBundle) installWebGLBundle(state.baseBundle);
    syncRenderingControls();
    if (!state.canvas || state.destroyed) return;
    resizeCanvas();
    renderOnce(state.lastTime * 1000);
  }

  function selectSpeed(speed) {
    if (!Object.prototype.hasOwnProperty.call(SPEED_PROFILES, speed)) return;
    state.speed = speed;
    syncRenderingControls();
    if (speed === "paused" && !state.focusRunning) {
      stopAnimation();
      renderOnce(state.lastTime * 1000);
      return;
    }
    startAnimation();
  }

  function onStageClick(event) {
    if (!(event.target instanceof Element) || !state.stageElement) return;
    const qualityButton = event.target.closest("button[data-stellar-quality]");
    if (qualityButton && state.stageElement.contains(qualityButton)) {
      selectQuality(qualityButton.dataset.stellarQuality || "");
      return;
    }
    const speedButton = event.target.closest("button[data-stellar-speed]");
    if (speedButton && state.stageElement.contains(speedButton)) {
      selectSpeed(speedButton.dataset.stellarSpeed || "");
      return;
    }
    const focusButton = event.target.closest("#stellarTwinFocusButton");
    if (focusButton && state.stageElement.contains(focusButton)) {
      toggleFocus();
      return;
    }
    const control = event.target.closest("button[data-stellar-select-request], button[data-stellar-select], button[data-stellar-role], button[data-stellar-sample]");
    if (!control || !state.stageElement.contains(control)) return;
    const role = control.dataset.stellarSelectRequest || control.dataset.stellarSelect || control.dataset.stellarRole || control.dataset.stellarSample;
    if (!ROLE_ORDER.includes(role)) return;
    window.dispatchEvent(new CustomEvent(SELECT_REQUEST_EVENT, { detail: { role } }));
  }

  function onEvidence(event) {
    if (state.destroyed) return;
    try {
      const validated = validateEvidenceDetail(event.detail);
      state.evidenceStage = validated.stage;
      state.evidenceHash = validated.sha256;
      state.evidenceSamples = validated.samples;
      state.eligible = true;
      state.failed = false;
      state.failureMessage = "";
      if (!ensureInitialized()) throw new Error("恒星数字孪生舞台挂载失败");
      if (state.pendingSample) bindSample(state.pendingSample);
      else {
        state.role = "canonical_correct";
        state.sample = state.evidenceSamples.get(state.role) || null;
        updateAccessibleLabel();
      }
      if (state.eligible && !state.failed) {
        syncReadyDom();
        startAnimation();
      }
    } catch (error) {
      failClosed(error instanceof Error ? error.message : "恒星数字孪生证据不可用");
    }
  }

  function onSample(event) {
    if (state.destroyed) return;
    try {
      const detail = validateSampleDetail(event.detail);
      if (!ensureInitialized()) throw new Error("恒星数字孪生舞台挂载失败");
      bindSample(detail);
      if (state.eligible && !state.failed) startAnimation();
    } catch (error) {
      failClosed(error instanceof Error ? error.message : "恒星数字孪生样本不可用");
    }
  }

  function onFailed(event) {
    const message = isObject(event.detail) && typeof event.detail.message === "string"
      ? event.detail.message.slice(0, 300) : "同源证据链已关闭恒星数字孪生舞台";
    failClosed(message);
  }

  function onVisibilityChange() {
    state.visible = !document.hidden;
    if (!state.visible) {
      pauseFocus();
      stopAnimation();
    }
    else if (!state.destroyed) startAnimation();
  }

  function onMotionChange() {
    if (REDUCED_MOTION.matches) {
      stopFocus();
      stopAnimation();
      state.pointer.x = 0;
      state.pointer.y = 0;
      state.pointer.targetX = 0;
      state.pointer.targetY = 0;
      renderOnce();
    } else startAnimation();
  }

  function onContextLost(event) {
    event.preventDefault();
    stopAnimation();
  }

  function onContextRestored() {
    releaseWebGLResources();
    state.gl = null;
    if (!initWebGL()) {
      if (!init2D(true)) {
        failClosed("WebGL 上下文恢复失败，Canvas2D 降级也不可用");
        return;
      }
    }
    startAnimation();
  }

  function attachCanvasContextEvents() {
    if (!state.canvas) return;
    state.canvas.addEventListener("webglcontextlost", onContextLost, false);
    state.canvas.addEventListener("webglcontextrestored", onContextRestored, false);
  }

  function attachRuntimeListeners() {
    if (!state.host || !state.canvas) return;
    state.host.addEventListener("pointermove", onPointerMove, { passive: true });
    state.host.addEventListener("pointerdown", onPointerDown);
    state.host.addEventListener("pointerup", endPointerDrag);
    state.host.addEventListener("pointercancel", endPointerDrag);
    state.stageElement.addEventListener("click", onStageClick);
    attachCanvasContextEvents();
    if (typeof window.ResizeObserver === "function") {
      state.resizeObserver = new window.ResizeObserver(() => {
        resizeCanvas();
        renderOnce();
      });
      state.resizeObserver.observe(state.host);
    }
  }

  function ensureInitialized() {
    if (state.destroyed) return false;
    if (state.canvas && state.contextKind) return true;
    if (!findMount()) return false;
    attachRuntimeListeners();
    if (!initWebGL() && !init2D(true)) return false;
    resizeCanvas();
    renderOnce();
    return true;
  }

  function failClosed(message) {
    state.eligible = false;
    state.failed = true;
    state.failureMessage = typeof message === "string" && message ? message.slice(0, 300) : "证据不可用";
    stopFocus();
    stopAnimation();
    if (ensureInitialized()) {
      updateAccessibleLabel();
      syncFailedDom();
      renderOnce();
    }
  }

  function destroy() {
    if (state.destroyed) return;
    state.destroyed = true;
    stopFocus();
    stopAnimation();
    window.clearTimeout(state.resizeTimer);
    if (state.resizeObserver) state.resizeObserver.disconnect();
    state.resizeObserver = null;
    window.removeEventListener(EVIDENCE_EVENT, onEvidence);
    window.removeEventListener(SAMPLE_EVENT, onSample);
    window.removeEventListener(FAILED_EVENT, onFailed);
    window.removeEventListener("resize", onWindowResize);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    if (typeof REDUCED_MOTION.removeEventListener === "function") REDUCED_MOTION.removeEventListener("change", onMotionChange);
    if (state.host) {
      state.host.removeEventListener("pointermove", onPointerMove);
      state.host.removeEventListener("pointerdown", onPointerDown);
      state.host.removeEventListener("pointerup", endPointerDrag);
      state.host.removeEventListener("pointercancel", endPointerDrag);
    }
    if (state.stageElement) state.stageElement.removeEventListener("click", onStageClick);
    if (state.canvas) {
      state.canvas.removeEventListener("webglcontextlost", onContextLost);
      state.canvas.removeEventListener("webglcontextrestored", onContextRestored);
    }
    releaseWebGLResources();
    if (state.gl) {
      const loseContext = state.gl.getExtension("WEBGL_lose_context");
      if (loseContext) loseContext.loseContext();
    }
    state.gl = null;
    state.context2d = null;
    if (state.textureImage) {
      state.textureImage.onload = null;
      state.textureImage.onerror = null;
    }
    state.textureImage = null;
    state.textureLoading = false;
    state.textureReady = false;
    if (state.ownsCanvas && state.canvas && state.canvas.parentNode) state.canvas.parentNode.removeChild(state.canvas);
    if (state.ownsDisclaimer && state.disclaimer && state.disclaimer.parentNode) state.disclaimer.parentNode.removeChild(state.disclaimer);
    state.canvas = null;
    state.host = null;
    state.stageElement = null;
    state.disclaimer = null;
    state.evidenceStage = null;
    state.evidenceSamples.clear();
    state.sample = null;
  }

  function onWindowResize() {
    if (state.resizeObserver || state.destroyed || !state.canvas) return;
    window.clearTimeout(state.resizeTimer);
    state.resizeTimer = window.setTimeout(() => {
      resizeCanvas();
      renderOnce();
    }, 100);
  }

  window.addEventListener(EVIDENCE_EVENT, onEvidence);
  window.addEventListener(SAMPLE_EVENT, onSample);
  window.addEventListener(FAILED_EVENT, onFailed);
  window.addEventListener("resize", onWindowResize, { passive: true });
  document.addEventListener("visibilitychange", onVisibilityChange);
  if (typeof REDUCED_MOTION.addEventListener === "function") REDUCED_MOTION.addEventListener("change", onMotionChange);

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => { ensureInitialized(); }, { once: true });
  else ensureInitialized();

  window.AstroTwinStellarTwin = Object.freeze({
    destroy,
    render: renderOnce,
    status: () => Object.freeze({
      renderer: state.contextKind,
      eligible: state.eligible,
      failed: state.failed,
      role: state.role,
      running: state.frame !== null,
      quality: state.quality,
      speed: state.speed,
      textureReady: state.textureReady,
      textureFailed: state.textureFailed,
      cinemaProgramReady: state.cinemaProgramReady,
      cinemaProgramFailed: state.cinemaProgramFailed,
      cinemaProgramLoading: state.cinemaProgramLoading,
      parallelCompileSupported: state.parallelCompileSupported,
      focusRunning: state.focusRunning,
      focusStep: state.focusStep,
      pointerDragging: state.pointerDragging,
      pointer: Object.freeze({ x: state.pointer.x, y: state.pointer.y, targetX: state.pointer.targetX, targetY: state.pointer.targetY }),
      reducedMotion: REDUCED_MOTION.matches,
    }),
  });
}());
