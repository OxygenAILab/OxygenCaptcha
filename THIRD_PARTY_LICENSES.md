# Third-Party Licenses

OxygenChallenge runtime uses these public open-source libraries:

| Package | Version | License | Use |
|---|---:|---|---|
| `roughjs` | 4.6.6 | MIT | Transparent hand-drawn digit paths |
| `lucide` | 1.70.0 | ISC | Grid, animal, playback and tool icons |
| `zzfx` | 1.4.0 | MIT | Success/error/click sound synthesis |
| `fastify` | 5.12.8 | MIT | HTTP service |
| `@fastify/cors` | 11.4.1 | MIT | CORS |
| `@fastify/helmet` | 13.2.0 | MIT | Security headers |
| `@fastify/rate-limit` | 11.2.2 | MIT | Rate limiting |
| `@fastify/static` | 10.1.10 | MIT | Widget assets |
| `zod` | 4.6.7 | MIT | Input validation |

Build tooling includes TypeScript (Apache-2.0), esbuild (MIT), tsx (MIT), and Vitest (MIT).

No third-party audio recordings or image asset packs are shipped. ZzFX synthesizes interaction
feedback at runtime, the audio-sequence endpoint synthesizes animal-like tones with a local PCM
generator, and Rough.js generates the digit image from geometry.

Links:

- https://github.com/pshihn/rough
- https://github.com/lucide-icons/lucide
- https://github.com/KilledByAPixel/ZzFX
- https://github.com/fastify/fastify
- https://github.com/colinhacks/zod

<!-- Git Hub@OxygenAILab | OxygenAI Lab@Sta rsailsClover -->
