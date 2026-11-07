import { build } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const dist = resolve(root, "dist");
const publicDir = resolve(dist, "public");

await rm(dist, { recursive: true, force: true });
await mkdir(publicDir, { recursive: true });

await build({
  entryPoints: [resolve(root, "src/server.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  packages: "bundle",
  external: [
    "fastify",
    "@fastify/cors",
    "@fastify/helmet",
    "@fastify/rate-limit",
    "@fastify/static",
    "zod"
  ],
  outfile: resolve(dist, "server.js"),
  sourcemap: true,
});

await build({
  entryPoints: [resolve(root, "src/widget/main.ts")],
  bundle: true,
  platform: "browser",
  format: "iife",
  target: ["chrome110", "firefox110", "safari16"],
  outfile: resolve(publicDir, "widget.js"),
  minify: true,
  sourcemap: true,
});

await build({
  entryPoints: [resolve(root, "src/widget/frame.ts")],
  bundle: true,
  platform: "browser",
  format: "iife",
  target: ["chrome110", "firefox110", "safari16"],
  outfile: resolve(publicDir, "frame.js"),
  minify: true,
  sourcemap: true,
});

await build({
  entryPoints: [resolve(root, "src/platform/client.ts")],
  bundle: true,
  platform: "browser",
  format: "iife",
  target: ["chrome110", "firefox110", "safari16"],
  outfile: resolve(publicDir, "platform.js"),
  minify: true,
  sourcemap: true,
});

await build({
  entryPoints: [resolve(root, "src/widget/styles.css")],
  bundle: true,
  outfile: resolve(publicDir, "widget.css"),
  minify: true,
});

await cp(
  resolve(root, "vendor/mediapipe-tasks-vision/wasm"),
  resolve(publicDir, "mediapipe/wasm"),
  { recursive: true },
);
await cp(resolve(root, "public"), publicDir, { recursive: true });
