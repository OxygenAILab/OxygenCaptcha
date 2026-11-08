import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildApp } from "../src/app.js";
import type { AppConfig } from "../src/types.js";

const challengePort = 8896;
const accountPort = 8898;
const publicOrigin = `http://127.0.0.1:${challengePort}`;
const accountOrigin = `http://127.0.0.1:${accountPort}`;

const account = createServer((request, response) => {
  const url = new URL(request.url ?? "/", accountOrigin);
  if (url.pathname === "/.well-known/openid-configuration") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(
      JSON.stringify({
        authorization_endpoint: `${accountOrigin}/authorize`,
        token_endpoint: `${accountOrigin}/token`,
        userinfo_endpoint: `${accountOrigin}/userinfo`,
      }),
    );
    return;
  }
  if (url.pathname === "/authorize") {
    const state = url.searchParams.get("state") ?? "";
    const callback = new URL("/auth/callback", publicOrigin);
    callback.searchParams.set("code", "alpha7-code");
    callback.searchParams.set("state", state);
    response.writeHead(302, { Location: callback.toString() });
    response.end();
    return;
  }
  if (url.pathname === "/token") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ access_token: "alpha7-access-token" }));
    return;
  }
  if (url.pathname === "/userinfo") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(
      JSON.stringify({
        sub: "alpha7-user",
        name: "Alpha 7 Tester",
        email: "alpha7@example.com",
        account_type: "user",
      }),
    );
    return;
  }
  response.writeHead(404);
  response.end("not found");
});

const config: AppConfig = {
  nodeEnv: "test",
  host: "127.0.0.1",
  port: challengePort,
  publicOrigin,
  challengeTtlSeconds: 300,
  tokenTtlSeconds: 120,
  maxAttempts: 3,
  rateLimitMax: 10_000,
  tokenSeed: randomBytes(32),
  platformDataFile: join(
    tmpdir(),
    `oxygenchallenge-alpha7-platform-${randomBytes(6).toString("hex")}.json`,
  ),
  platformDataKey: randomBytes(32),
  sites: [
    {
      key: "oc_alpha7_demo",
      secret: "oc_alpha7_demo_secret",
      origins: ["https://app.test"],
      actions: ["submit"],
    },
  ],
  oxygenAccountIssuer: accountOrigin,
  oxygenAccountClientId: "alpha7-client",
  oxygenAccountClientSecret: "alpha7-secret",
};

const built = await buildApp({ config, logger: false });
const app = await built.platformStore.create(
  { sub: "alpha7-user", name: "Alpha 7 Tester" },
  {
    name: "Alpha 7 Development",
    origins: [publicOrigin, "https://app.test"],
    actions: ["submit"],
  },
);
await built.platformStore.setIpBypass(
  "alpha7-user",
  app.id,
  "203.0.113.10",
  60,
);
await built.platformStore.setIpBypass(
  "alpha7-user",
  app.id,
  "127.0.0.1",
  60,
);

await new Promise<void>((resolve) => account.listen(accountPort, "127.0.0.1", resolve));
await built.app.listen({ host: config.host, port: config.port });
mkdirSync("_devdocs/evidence/alpha7", { recursive: true });
writeFileSync(
  "_devdocs/evidence/alpha7/platform-harness.json",
  JSON.stringify({ appId: app.id, siteKey: app.siteKey, publicOrigin }, null, 2),
);
console.log(JSON.stringify({ appId: app.id, siteKey: app.siteKey }));

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void built.app.close().finally(() => account.close());
  });
}
