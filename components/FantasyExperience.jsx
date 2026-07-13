"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createWebGLScene } from "../lib/webgl";

const palettes = [
  { accent: "#c56c56", wash: "rgba(176, 83, 61, .22)" },
  { accent: "#4f8c86", wash: "rgba(47, 113, 108, .26)" },
  { accent: "#b7a45a", wash: "rgba(198, 173, 74, .20)" },
  { accent: "#6d7359", wash: "rgba(68, 84, 61, .26)" },
  { accent: "#91a7ae", wash: "rgba(132, 168, 178, .27)" },
];

const gates = [
  {
    number: "01",
    title: "The Realm",
    jpTitle: "1-5  領域・風土",
    description: "Walk the wind-cut kingdoms and explore our high-fidelity digital terrains beyond the first gate.",
    action: "Cross into the realm",
    id: "realm"
  },
  {
    number: "02",
    title: "Chronicles",
    jpTitle: "2-5  石碑・年代記",
    description: "Discover deep cinematic lore and stories carried in ancient stone, salt, and neural starlight.",
    action: "Open the chronicles",
    id: "chronicles"
  },
  {
    number: "03",
    title: "Wayfarers",
    jpTitle: "3-5  旅人・群像",
    description: "Meet the unique figures, virtual actors, and lifelike characters whose choices shaped the passage.",
    action: "Meet the wayfarers",
    id: "wayfarers"
  },
  {
    number: "04",
    title: "Makers",
    jpTitle: "4-5  工房・創作者",
    description: "Discover the procedural crafts, mechanical designs, and AI-driven workshop behind our digital sagas.",
    action: "Enter the workshop",
    id: "makers"
  },
  {
    number: "05",
    title: "The Circle",
    jpTitle: "5-5  円環・共同体",
    description: "Enter a high-end digital gathering place built for global readers, wanderers, and dreamers.",
    action: "Join the circle",
    id: "circle"
  },
];

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const lerp = (from, to, amount) => from + (to - from) * amount;

function hexToRgb(hex) {
  const number = Number.parseInt(hex.slice(1), 16);
  return [(number >> 16) & 255, (number >> 8) & 255, number & 255];
}

function mixHex(a, b, amount) {
  const first = hexToRgb(a);
  const second = hexToRgb(b);
  const channels = first.map((channel, index) => Math.round(lerp(channel, second[index], amount)));
  return `rgb(${channels.join(", ")})`;
}

export default function FantasyExperience() {
  const rootRef = useRef(null);
  const stageRef = useRef(null);
  const canvasRef = useRef(null);
  const sceneFloatRef = useRef(0);
  const pointerRef = useRef({ x: 0, y: 0 });
  const imageReadyRef = useRef(false);
  const progressRef = useRef(0);
  const audioContextRef = useRef(null);
  const ambientGainRef = useRef(null);
  const videosRef = useRef([]);

  const videoUrls = [
    "https://video.henrywithu.com/static/streaming-playlists/hls/896cd5b6-7fa0-4572-82f4-e1db152d551a/c9cfe856-61ee-47cd-b013-5083425c188e-1080-fragmented.mp4",
    "https://video.henrywithu.com/static/streaming-playlists/hls/29f2ce85-ad8e-410a-a58d-b3ed37b889f4/7280e8b3-a01b-4fd4-80ac-07728d10d80b-1080-fragmented.mp4",
    "https://video.henrywithu.com/static/streaming-playlists/hls/0bf2716c-1906-44b5-9ea8-e2e896fad215/00d4b62b-64fa-4fc9-84fe-1f7211b9cad8-1080-fragmented.mp4",
    "https://video.henrywithu.com/static/streaming-playlists/hls/a8f069de-7cb5-433f-927f-7f589a525afa/5b36ebc1-4e1f-486d-9893-bc1d81d1960e-1080-fragmented.mp4",
    "https://video.henrywithu.com/static/streaming-playlists/hls/00385dfd-6549-4d12-9e9e-ae59d6da6bdc/a56317f4-84a0-4580-bdc5-8718d49bff49-1080-fragmented.mp4"
  ];

  const [activeScene, setActiveScene] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const [entered, setEntered] = useState(false);
  const [loaderVisible, setLoaderVisible] = useState(true);
  const [ready, setReady] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);

  const prefersReducedMotion = useCallback(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  useEffect(() => {
    const root = rootRef.current;

    function updateScene() {
      const portalCopies = [...root.querySelectorAll(".portal-copy")];
      const railButtons = [...root.querySelectorAll(".gate-rail button")];
      const prompt = root.querySelector(".scroll-prompt");

      const viewport = Math.max(window.innerHeight, 1);
      const scene = clamp(window.scrollY / viewport, 0, 4);
      const active = Math.round(scene);
      sceneFloatRef.current = scene;
      setActiveScene((current) => (current === active ? current : active));

      portalCopies.forEach((copy, index) => {
        const distance = scene - index;
        const opacity = clamp(1 - Math.abs(distance) * 1.8);
        const translate = distance * -76;
        const scale = 1 - Math.min(Math.abs(distance), 1) * 0.045;
        copy.style.opacity = opacity.toFixed(3);
        copy.style.transform = `translate3d(0, ${translate}px, 0) scale(${scale})`;
        copy.classList.toggle("is-active", index === active);
        copy.setAttribute("aria-hidden", index === active ? "false" : "true");
      });
      railButtons.forEach((button, index) => button.classList.toggle("is-active", index === active));
      if (prompt) {
        prompt.style.opacity = String(clamp(1 - scene * 1.3));
      }

      const lower = Math.min(Math.floor(scene), palettes.length - 1);
      const upper = Math.min(lower + 1, palettes.length - 1);
      const local = scene - Math.floor(scene);
      document.documentElement.style.setProperty(
        "--accent",
        mixHex(palettes[lower].accent, palettes[upper].accent, local),
      );
      document.documentElement.style.setProperty(
        "--wash",
        local < 0.5 ? palettes[lower].wash : palettes[upper].wash,
      );
    }

    function updatePointer(event) {
      pointerRef.current = {
        x: (event.clientX / window.innerWidth - 0.5) * 2,
        y: (event.clientY / window.innerHeight - 0.5) * 2,
      };
    }

    updateScene();
    window.addEventListener("scroll", updateScene, { passive: true });
    window.addEventListener("resize", updateScene, { passive: true });
    window.addEventListener("pointermove", updatePointer, { passive: true });
    return () => {
      window.removeEventListener("scroll", updateScene);
      window.removeEventListener("resize", updateScene);
      window.removeEventListener("pointermove", updatePointer);
    };
  }, []);

  useEffect(() => {
    const image = new Image();
    let disposeWebGL = () => {};
    image.decoding = "async";
    image.src = "/assets/mythic-portal.png";

    const videos = videoUrls.map((url) => {
      const video = document.createElement("video");
      video.src = url;
      video.crossOrigin = "anonymous";
      video.loop = true;
      video.muted = true;
      video.playsInline = true;
      video.autoplay = true;
      return video;
    });
    videosRef.current = videos;

    image.addEventListener(
      "load",
      () => {
        imageReadyRef.current = true;
        disposeWebGL = createWebGLScene({
          canvas: canvasRef.current,
          stage: stageRef.current,
          image,
          videos,
          getPointer: () => pointerRef.current,
          getScene: () => sceneFloatRef.current,
          prefersReducedMotion: prefersReducedMotion(),
        });
      },
      { once: true },
    );
    image.addEventListener(
      "error",
      () => {
        imageReadyRef.current = true;
        stageRef.current?.classList.add("has-fallback");
      },
      { once: true },
    );
    return () => {
      disposeWebGL();
      videos.forEach((video) => {
        if (video) {
          video.pause();
          video.src = "";
          video.load();
        }
      });
    };
  }, [prefersReducedMotion]);

  useEffect(() => {
    const startedAt = performance.now();
    const timer = window.setInterval(() => {
      const ceiling = imageReadyRef.current ? 100 : 92;
      progressRef.current += Math.max(0.45, (ceiling - progressRef.current) * 0.08);
      progressRef.current = Math.min(progressRef.current, ceiling);
      const rounded = Math.round(progressRef.current);
      setLoadingProgress(rounded);
      if (imageReadyRef.current && rounded >= 100 && performance.now() - startedAt > 800) {
        window.clearInterval(timer);
        setReady(true);
      }
    }, 65);
    return () => window.clearInterval(timer);
  }, []);

  const createAmbientSound = useCallback(() => {
    if (audioContextRef.current) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    const audioContext = new AudioContextClass();
    const ambientGain = audioContext.createGain();
    ambientGain.gain.value = 0;
    ambientGain.connect(audioContext.destination);

    const seconds = 3;
    const buffer = audioContext.createBuffer(1, audioContext.sampleRate * seconds, audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let index = 0; index < data.length; index += 1) {
      const white = Math.random() * 2 - 1;
      last = last * 0.985 + white * 0.015;
      data[index] = last * 3.2;
    }

    const wind = audioContext.createBufferSource();
    const filter = audioContext.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 520;
    filter.Q.value = 0.7;
    wind.buffer = buffer;
    wind.loop = true;
    wind.connect(filter).connect(ambientGain);
    wind.start();

    const drone = audioContext.createOscillator();
    const droneGain = audioContext.createGain();
    drone.type = "sine";
    drone.frequency.value = 47;
    droneGain.gain.value = 0.16;
    drone.connect(droneGain).connect(ambientGain);
    drone.start();

    audioContextRef.current = audioContext;
    ambientGainRef.current = ambientGain;
  }, []);

  const setSoundEnabled = useCallback(
    async (enabled) => {
      createAmbientSound();
      const audioContext = audioContextRef.current;
      const ambientGain = ambientGainRef.current;
      if (!audioContext || !ambientGain) return;
      if (audioContext.state === "suspended") await audioContext.resume();
      ambientGain.gain.cancelScheduledValues(audioContext.currentTime);
      ambientGain.gain.linearRampToValueAtTime(enabled ? 0.09 : 0, audioContext.currentTime + 0.45);
      setSoundOn(enabled);
    },
    [createAmbientSound],
  );

  useEffect(
    () => () => {
      audioContextRef.current?.close();
    },
    [],
  );

  useEffect(() => {
    function closeMenu(event) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("keydown", closeMenu);
    return () => document.removeEventListener("keydown", closeMenu);
  }, []);

  const scrollToGate = useCallback(
    (index) => {
      setMenuOpen(false);
      window.scrollTo({
        top: index * window.innerHeight,
        behavior: prefersReducedMotion() ? "auto" : "smooth",
      });
    },
    [prefersReducedMotion],
  );

  async function enterExperience() {
    if (!ready || entered) return;
    setEntered(true);
    document.body.classList.remove("is-loading");
    document.body.classList.add("has-entered");
    await setSoundEnabled(true);
    if (videosRef.current && videosRef.current[0]) {
      videosRef.current[0].play().catch((err) => console.warn("Video play failed:", err));
    }
    window.setTimeout(() => setLoaderVisible(false), 1100);
  }

  return (
    <div ref={rootRef}>
      <a className="skip-link" href="#main">Skip to the experience</a>

      {loaderVisible && (
        <div
          className={`loader${entered ? " is-entered" : ""}`}
          aria-label={ready ? "Experience ready" : "Loading the experience"}
        >
          <div className="loader__art" aria-hidden="true" />
          <div className="loader__content">
            <p className="loader__credit">AN ORIGINAL DIGITAL SAGA</p>
            <h1 className="loader__title" aria-label="AIFX">AIFX</h1>
            <p className="loader__studio">BEYOND THE FIVE GATES</p>
            <div className="loader__meter" aria-hidden="true">
              <span className="loader__progress" style={{ width: `${loadingProgress}%` }} />
            </div>
            <p className="loader__count" aria-live="polite">
              {String(loadingProgress).padStart(2, "0")}
            </p>
            <button className="ritual-button loader__enter" type="button" disabled={!ready} onClick={enterExperience}>
              <span>Enter the saga</span>
            </button>
          </div>
        </div>
      )}

      <header className="header">
        <button
          className="menu-button"
          type="button"
          aria-expanded={menuOpen}
          aria-controls="menu"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span className="menu-button__lines" aria-hidden="true"><i /><i /><i /></span>
          <span className="sr-only">{menuOpen ? "Close menu" : "Open menu"}</span>
        </button>

        <a
          className="wordmark"
          href="#gate-1"
          aria-label="AIFX home"
          onClick={(event) => { event.preventDefault(); scrollToGate(0); }}
        >
          AIFX
        </a>

        <button
          className="sound-button"
          type="button"
          aria-pressed={soundOn}
          onClick={() => setSoundEnabled(!soundOn)}
        >
          <span className="sound-button__bars" aria-hidden="true"><i /><i /><i /><i /><i /></span>
          <span className="sr-only">Toggle ambient sound</span>
        </button>
      </header>

      <aside className={`menu${menuOpen ? " is-open" : ""}`} id="menu" aria-hidden={!menuOpen}>
        <div className="menu__paper" aria-hidden="true" />
        <div className="menu__inner">
          <p className="menu__eyebrow">THE FIVE GATES</p>
          <nav aria-label="Primary navigation">
            <ol className="menu__links">
              {gates.map((gate, index) => (
                <li key={gate.id}>
                  <button type="button" onClick={() => scrollToGate(index)}>
                    <span>{gate.number}</span>{gate.title}
                  </button>
                </li>
              ))}
            </ol>
          </nav>
          <p className="menu__footer">A passage through stone, story, and memory.</p>
        </div>
      </aside>

      <main id="main">
        <section className="experience" aria-label="The five gates">
          <div className="stage" ref={stageRef}>
            <canvas className="world" ref={canvasRef} aria-hidden="true" />
            <div className="stage__fallback" aria-hidden="true" />
            <div className="stage__wash" aria-hidden="true" />
            <div className="grain" aria-hidden="true" />



            <nav className="gate-rail" aria-label="Gate navigation">
              <span className="gate-rail__line" aria-hidden="true" />
              {gates.map((gate, index) => (
                <button
                  type="button"
                  className={index === activeScene ? "is-active" : ""}
                  aria-label={`Go to ${gate.title}`}
                  onClick={() => scrollToGate(index)}
                  key={gate.id}
                >
                  <i />
                </button>
              ))}
            </nav>

            <div className="portal-copies" aria-live="polite">
              {gates.map((gate, index) => (
                <article
                  className={`portal-copy${index === activeScene ? " is-active" : ""}`}
                  id={`gate-${index + 1}`}
                  data-index={index}
                  aria-hidden={index !== activeScene}
                  key={gate.id}
                >
                  <div className="gate-eyebrow-container">
                    <p className="gate-number">Gate {gate.number}</p>
                    <span className="gate-jp">{gate.jpTitle}</span>
                  </div>
                  <h2 className="split-text-title">
                    {gate.title.split("").map((char, charIdx) => {
                      if (char === " ") {
                        return (
                          <span key={charIdx} className="space">
                            &nbsp;
                          </span>
                        );
                      }
                      return (
                        <span key={charIdx} className="char-wrap">
                          <span className="char" style={{ animationDelay: `${charIdx * 0.025}s` }}>
                            {char}
                          </span>
                        </span>
                      );
                    })}
                  </h2>
                  <p className="gate-description">{gate.description}</p>
                  <a className="ritual-button" href={`#${gate.id}`}><span>{gate.action}</span></a>
                </article>
              ))}
            </div>

            <p className="scroll-prompt"><span>Scroll to explore</span></p>
            <p className="scene-counter" aria-hidden="true">
              <span>{String(activeScene + 1).padStart(2, "0")}</span> / 05
            </p>
          </div>
          <div className="scroll-space" aria-hidden="true" />
        </section>

        <div className="semantic-sections sr-only">
          <section id="realm"><h2>The Realm</h2><p>Walk the wind-cut kingdoms beyond the first gate.</p></section>
          <section id="chronicles"><h2>Chronicles</h2><p>Stories carried in stone, salt, and starlight.</p></section>
          <section id="wayfarers"><h2>Wayfarers</h2><p>Meet the figures whose choices shaped the passage.</p></section>
          <section id="makers"><h2>Makers</h2><p>Discover the craft behind the world and its myths.</p></section>
          <section id="circle"><h2>The Circle</h2><p>A gathering place for readers, wanderers, and dreamers.</p></section>
        </div>
      </main>
    </div>
  );
}
