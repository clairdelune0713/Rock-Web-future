# AIFX

An original Next.js microsite inspired by the interaction language of cinematic graphic-novel websites: a loading ritual, full-screen WebGL scene, five scroll-driven gates, pointer parallax, floating depth layers, animated navigation, and procedural ambient sound.

## Run locally

```bash
npm install
npm run dev
```

Then open `http://127.0.0.1:3000`.

The project uses the Next.js App Router with a client-side WebGL experience component.

## Implementation notes

- Next.js 16 App Router and React 19.
- Raw WebGL 1 fragment shader; no rendering framework dependency.
- Native scrolling drives the five portal states.
- The image texture is original project artwork generated for this experience.
- WebGL gracefully falls back to a full-screen static background.
- `prefers-reduced-motion` is respected.
