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
  uniform sampler2D u_image;
  uniform sampler2D u_video;
  uniform vec2 u_resolution;
  uniform vec2 u_textureSize;
  uniform vec2 u_pointer;
  uniform float u_time;
  uniform float u_scene;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  vec3 grade(vec3 color, float scene) {
    vec3 first = vec3(1.05, 0.82, 0.67);
    vec3 second = vec3(0.62, 0.89, 0.84);
    vec3 third = vec3(1.04, 0.95, 0.58);
    vec3 fourth = vec3(0.63, 0.73, 0.56);
    vec3 fifth = vec3(0.72, 0.87, 0.94);
    vec3 tint = first;
    if (scene < 1.0) tint = mix(first, second, scene);
    else if (scene < 2.0) tint = mix(second, third, scene - 1.0);
    else if (scene < 3.0) tint = mix(third, fourth, scene - 2.0);
    else tint = mix(fourth, fifth, scene - 3.0);
    float luma = dot(color, vec3(0.299, 0.587, 0.114));
    return mix(vec3(luma), color * tint, 0.82);
  }

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

    float wave = sin((uv.y * 11.0 + uv.x * 7.0) + u_time * 0.22 + u_scene * 2.4);
    uv.x += wave * 0.0009 * (0.25 + edgeDepth);
    float transition = smoothstep(0.32, 0.5, abs(fract(u_scene) - 0.5));
    vec2 chroma = vec2(0.0013 + transition * 0.0015, 0.0004) * (u_pointer.x + 1.2);
    
    // Sample image texture
    float redImg = texture2D(u_image, uv + chroma).r;
    float greenImg = texture2D(u_image, uv).g;
    float blueImg = texture2D(u_image, uv - chroma).b;
    vec3 colorImg = vec3(redImg, greenImg, blueImg);

    // Sample video texture
    float redVid = texture2D(u_video, uv + chroma).r;
    float greenVid = texture2D(u_video, uv).g;
    float blueVid = texture2D(u_video, uv - chroma).b;
    vec3 colorVid = vec3(redVid, greenVid, blueVid);

    // Blend from video to still image as we transition from scene 0 to scene 1
    float blend = clamp(u_scene, 0.0, 1.0);
    vec3 color = grade(mix(colorVid, colorImg, blend), u_scene);

    float vignette = smoothstep(0.98, 0.25, distance(v_uv, vec2(0.5)));
    color *= mix(0.62, 1.08, vignette);
    float grain = hash(gl_FragCoord.xy + floor(u_time * 14.0));
    color += (grain - 0.5) * 0.052;
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
  video,
  shards,
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

  // Set up u_image (unit 0)
  const imageTexture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, imageTexture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

  // Set up u_video (unit 1)
  const videoTexture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, videoTexture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  // Initialize with still image as buffer fallback while video is loading
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

  const uniforms = {
    resolution: gl.getUniformLocation(program, "u_resolution"),
    textureSize: gl.getUniformLocation(program, "u_textureSize"),
    pointer: gl.getUniformLocation(program, "u_pointer"),
    time: gl.getUniformLocation(program, "u_time"),
    scene: gl.getUniformLocation(program, "u_scene"),
    image: gl.getUniformLocation(program, "u_image"),
    video: gl.getUniformLocation(program, "u_video"),
  };
  gl.uniform2f(uniforms.textureSize, image.naturalWidth, image.naturalHeight);
  gl.uniform1i(uniforms.image, 0); // Assign unit 0 to u_image
  gl.uniform1i(uniforms.video, 1); // Assign unit 1 to u_video
  stage.classList.add("is-webgl");

  let animationFrame = 0;
  let smoothX = 0;
  let smoothY = 0;

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

    // Clean active texture bindings
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, imageTexture);

    // Update video texture if on/transitioning to the first sub-page
    if (scene < 1.0) {
      if (video && video.readyState >= video.HAVE_CURRENT_DATA) {
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, videoTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
        
        if (video.paused) {
          video.play().catch(() => {});
        }
      }
    } else {
      if (video && !video.paused) {
        video.pause();
      }
    }

    gl.uniform2f(uniforms.resolution, width, height);
    gl.uniform2f(uniforms.pointer, smoothX, -smoothY);
    gl.uniform1f(uniforms.time, time * 0.001);
    gl.uniform1f(uniforms.scene, scene);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    shards.forEach((shard, index) => {
      const depth = Number(shard.dataset.depth);
      const drift = prefersReducedMotion ? 0 : Math.sin(time * 0.00042 + index * 1.7) * 7 * depth;
      const scrollDrift = Math.sin(scene * Math.PI + index) * 12 * depth;
      const x = smoothX * depth * 18;
      const y = smoothY * depth * 13 + drift + scrollDrift;
      const rotation = smoothX * depth * 1.8 + Math.sin(time * 0.00022 + index) * 1.2;
      shard.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${rotation}deg)`;
    });

    animationFrame = requestAnimationFrame(render);
  }

  animationFrame = requestAnimationFrame(render);
  return () => {
    cancelAnimationFrame(animationFrame);
    stage.classList.remove("is-webgl");
    gl.deleteTexture(imageTexture);
    gl.deleteTexture(videoTexture);
    gl.deleteBuffer(positionBuffer);
    gl.deleteProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
  };
}
