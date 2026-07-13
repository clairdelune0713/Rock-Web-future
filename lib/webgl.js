const vertexShaderSource = `
  attribute vec2 a_position;
  varying vec2 v_uv;
  void main() {
    v_uv = (a_position + 1.0) * 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

const fragmentShaderSource = `
  precision highp float;
  varying vec2 v_uv;
  uniform sampler2D u_videoA;
  uniform sampler2D u_videoB;
  uniform vec2 u_resolution;
  uniform vec2 u_textureSize;
  uniform vec2 u_pointer;
  uniform float u_time;
  uniform float u_scene;
  uniform float u_local;

  void main() {
    vec2 uv = v_uv;
    float screenAspect = u_resolution.x / u_resolution.y;
    float imageAspect = u_textureSize.x / u_textureSize.y;
    vec2 cover = vec2(1.0);
    if (screenAspect > imageAspect) cover.y = imageAspect / screenAspect;
    else cover.x = screenAspect / imageAspect;
    uv = (uv - 0.5) * cover + 0.5;

    float edgeDepth = smoothstep(0.12, 0.72, distance(v_uv, vec2(0.5)) * 1.35);
    float scenePulse = sin(u_scene * 3.14159265);
    float zoom = 1.0 + 0.028 * sin(u_scene * 3.14159265 * 0.5) + 0.018 * scenePulse;
    uv = (uv - 0.5) / zoom + 0.5;
    uv += u_pointer * (0.006 + edgeDepth * 0.017);

    // Sample texture A (pristine original color)
    vec3 colorA = texture2D(u_videoA, uv).rgb;

    // Sample texture B (pristine original color)
    vec3 colorB = texture2D(u_videoB, uv).rgb;

    // Smooth transition curve to avoid long double-exposure overlapping
    float transitionProgress = smoothstep(0.4, 0.6, u_local);
    vec3 color = mix(colorA, colorB, transitionProgress);
    gl_FragColor = vec4(color, 1.0);
  }
`;

function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export function createWebGLScene({
  canvas,
  stage,
  image,
  videos, // Array of five HTMLVideoElements
  getPointer,
  getScene,
  prefersReducedMotion,
}) {
  const gl = canvas.getContext("webgl", {
    alpha: false,
    antialias: true,
    powerPreference: "high-performance",
  });
  if (!gl) return () => {};

  const program = gl.createProgram();
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
  if (!vertexShader || !fragmentShader) return () => {};

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return () => {};
  gl.useProgram(program);

  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW,
  );
  const position = gl.getAttribLocation(program, "a_position");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  // Set up textureA (unit 0)
  const textureA = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, textureA);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

  // Set up textureB (unit 1)
  const textureB = gl.createTexture();
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, textureB);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

  const uniforms = {
    resolution: gl.getUniformLocation(program, "u_resolution"),
    textureSize: gl.getUniformLocation(program, "u_textureSize"),
    pointer: gl.getUniformLocation(program, "u_pointer"),
    time: gl.getUniformLocation(program, "u_time"),
    scene: gl.getUniformLocation(program, "u_scene"),
    local: gl.getUniformLocation(program, "u_local"),
    videoA: gl.getUniformLocation(program, "u_videoA"),
    videoB: gl.getUniformLocation(program, "u_videoB"),
  };
  gl.uniform2f(uniforms.textureSize, image.naturalWidth, image.naturalHeight);
  gl.uniform1i(uniforms.videoA, 0); // Assign unit 0 to u_videoA
  gl.uniform1i(uniforms.videoB, 1); // Assign unit 1 to u_videoB
  stage.classList.add("is-webgl");

  let animationFrame = 0;
  let smoothX = 0;
  let smoothY = 0;
  
  let currentLowerIndex = -1;
  let currentUpperIndex = -1;

  function render(time) {
    const ratio = Math.min(window.devicePixelRatio || 1, 1.75);
    const width = Math.round(canvas.clientWidth * ratio);
    const height = Math.round(canvas.clientHeight * ratio);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    }

    const pointer = getPointer();
    const scene = getScene();
    const follow = prefersReducedMotion ? 1 : 0.045;
    smoothX += (pointer.x - smoothX) * follow;
    smoothY += (pointer.y - smoothY) * follow;

    const lower = Math.floor(scene);
    const upper = Math.min(lower + 1, videos.length - 1);
    const local = scene - lower;

    // 1. Reset texture A to static image fallback if lower index changes (video buffering/loading)
    if (lower !== currentLowerIndex) {
      currentLowerIndex = lower;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, textureA);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    }

    // 2. Reset texture B to static image fallback if upper index changes (video buffering/loading)
    if (upper !== currentUpperIndex) {
      currentUpperIndex = upper;
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, textureB);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    }

    // 3. Pause all off-screen videos to maximize system performance
    videos.forEach((vid, idx) => {
      if (idx !== lower && idx !== upper) {
        if (vid && !vid.paused) {
          vid.pause();
        }
      }
    });

    // 4. Update Texture A (Unit 0) with lower video frames if ready
    const vidA = videos[lower];
    if (vidA && vidA.readyState >= vidA.HAVE_CURRENT_DATA) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, textureA);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, vidA);
      if (vidA.paused) {
        vidA.play().catch(() => {});
      }
    }

    // 5. Update Texture B (Unit 1) with upper video frames if ready
    const vidB = videos[upper];
    if (vidB && vidB.readyState >= vidB.HAVE_CURRENT_DATA) {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, textureB);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, vidB);
      if (vidB.paused) {
        vidB.play().catch(() => {});
      }
    }

    gl.uniform2f(uniforms.resolution, width, height);
    gl.uniform2f(uniforms.pointer, smoothX, -smoothY);
    gl.uniform1f(uniforms.time, time * 0.001);
    gl.uniform1f(uniforms.scene, scene);
    gl.uniform1f(uniforms.local, local);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    animationFrame = requestAnimationFrame(render);
  }

  animationFrame = requestAnimationFrame(render);
  return () => {
    cancelAnimationFrame(animationFrame);
    stage.classList.remove("is-webgl");
    gl.deleteTexture(textureA);
    gl.deleteTexture(textureB);
    gl.deleteBuffer(positionBuffer);
    gl.deleteProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
  };
}
