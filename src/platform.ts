import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { createHash, randomBytes } from "node:crypto";
import { isIP } from "node:net";
import { z } from "zod";
import type { PlatformStore } from "./platform-store.js";
import { clientIp } from "./risk.js";
import type { AppConfig } from "./types.js";

type OidcDiscovery = {
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
};

type PlatformUser = {
  sub: string;
  name: string;
  email?: string;
  picture?: string;
  account_type?: string;
};

type PlatformSession = {
  user: {
    sub: string;
    name: string;
    email?: string;
    picture?: string;
  };
  csrf: string;
  expiresAt: number;
};

const OXYGENACCOUNT_API_VERSION = "2";

const createAppSchema = z.object({
  name: z.string().trim().min(2).max(64),
  origins: z.array(z.string().url()).min(1).max(10),
  actions: z.array(z.string().min(1).max(64)).min(1).max(10),
});

const bypassSchema = z
  .object({
    ip: z.string().trim().min(2).max(64),
    durationMinutes: z.number().int().min(1).max(179),
  })
  .refine((value) => isIP(value.ip) > 0, {
    message: "IP address is invalid",
  });

const bypassDeleteSchema = z
  .object({
    ip: z.string().trim().min(2).max(64),
  })
  .refine((value) => isIP(value.ip) > 0, {
    message: "IP address is invalid",
  });

function parseCookies(header: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  for (const part of (header ?? "").split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName && rawValue.length) {
      result[rawName] = decodeURIComponent(rawValue.join("="));
    }
  }
  return result;
}

function normalizeOrigin(value: string): string | undefined {
  try {
    const url = new URL(value);
    const loopback =
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "[::1]";
    if (url.protocol !== "https:" && !(loopback && url.protocol === "http:")) {
      return undefined;
    }
    return url.origin;
  } catch {
    return undefined;
  }
}

function setSessionCookie(config: AppConfig, reply: FastifyReply, token: string): void {
  const secure = config.nodeEnv === "production" ? "; Secure" : "";
  reply.header(
    "Set-Cookie",
    `oc_platform_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=28800${secure}`,
  );
}

function clearSessionCookie(config: AppConfig, reply: FastifyReply): void {
  const secure = config.nodeEnv === "production" ? "; Secure" : "";
  reply.header(
    "Set-Cookie",
    `oc_platform_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`,
  );
}

function platformHtml(config: AppConfig): string {
  const enabled = Boolean(
    config.oxygenAccountIssuer &&
      config.oxygenAccountClientId &&
      config.oxygenAccountClientSecret &&
      config.platformDataKey,
  );
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <title>OxygenChallenge Open Platform</title>
  <style>
    :root { --ink:#172033; --muted:#637086; --blue:#2f6fed; --line:#d7dee9; --paper:#f2f5f8; --white:#fff; }
    * { box-sizing:border-box; }
    body { margin:0; background:var(--paper); color:var(--ink); font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif; }
    body.has-language-banner { padding-top:46px; }
    .language-banner { position:fixed; inset:0 0 auto 0; z-index:60; min-height:46px; display:flex; align-items:center; justify-content:center; gap:12px; padding:6px 16px; background:#101a2b; color:#fff; font-size:13px; }
    .language-banner.hidden { display:none; }
    .language-banner button { min-height:34px; padding:0 12px; border:1px solid rgba(255,255,255,.34); border-radius:999px; background:transparent; color:#fff; cursor:pointer; }
    .language-banner button[aria-pressed="true"] { background:#fff; color:#101a2b; }
    button,input { font:inherit; }
    .topbar { display:flex; justify-content:space-between; align-items:center; min-height:68px; padding:0 max(20px,calc((100vw - 1120px)/2)); background:rgba(255,255,255,.94); border-bottom:1px solid rgba(23,32,51,.08); }
    .brand { font:700 20px Georgia,"Times New Roman",serif; }
    .top-actions { display:flex; align-items:center; gap:10px; }
    .account-name { display:flex; align-items:center; gap:8px; }
    .account-avatar { width:28px; height:28px; border-radius:50%; object-fit:cover; background:#e6ebf3; }
    .layout { width:min(1120px,calc(100% - 40px)); margin:40px auto 80px; display:grid; grid-template-columns:280px minmax(0,1fr); gap:28px; }
    .sidebar,.panel { border:1px solid var(--line); border-radius:8px; background:var(--white); }
    .sidebar { align-self:start; padding:20px; position:sticky; top:92px; }
    .sidebar h1 { margin:0 0 8px; font:700 24px Georgia,"Times New Roman",serif; }
    .sidebar p { color:var(--muted); font-size:12px; line-height:1.65; }
    .nav-item { display:block; padding:10px 12px; margin-top:18px; border-radius:6px; background:#eaf1ff; color:var(--blue); font-weight:700; }
    .panel { padding:24px; }
    .panel h2 { margin:0 0 6px; font:700 28px Georgia,"Times New Roman",serif; }
    .muted { color:var(--muted); }
    .hidden { display:none !important; }
    .button { display:inline-flex; align-items:center; justify-content:center; min-height:44px; padding:0 16px; border:0; border-radius:6px; background:var(--blue); color:white; font-weight:700; cursor:pointer; text-decoration:none; }
    .button.secondary { background:#eef2f7; color:#35445c; border:1px solid var(--line); }
    .button.danger { background:#fff0ef; color:#b42318; border:1px solid #f3b8b3; }
    .login-card { max-width:520px; margin:48px auto; text-align:center; padding:48px 28px; }
    .login-card h2 { font-size:36px; }
    .login-card p { max-width:420px; margin:10px auto 24px; color:var(--muted); }
    .app-list { display:grid; gap:12px; margin-top:20px; }
    .app-row { display:grid; grid-template-columns:1fr auto; gap:16px; padding:18px; border:1px solid var(--line); border-radius:6px; }
    .app-row h3 { margin:0 0 5px; font-size:16px; }
    .app-row code { color:#2f6fed; font:12px "Cascadia Code",Consolas,monospace; }
    .app-meta { margin-top:8px; color:var(--muted); font-size:12px; }
    .app-actions { display:flex; align-items:flex-start; gap:8px; }
    .form-grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-top:20px; }
    .field { display:grid; gap:6px; }
    .field.full { grid-column:1/-1; }
    label { color:#35445c; font-size:12px; font-weight:700; }
    input,textarea { width:100%; min-height:44px; padding:10px 12px; border:1px solid var(--line); border-radius:6px; background:#fff; color:var(--ink); font-size:16px; }
    textarea { min-height:88px; resize:vertical; }
    .notice { padding:12px 14px; margin-top:16px; border-radius:6px; background:#eaf1ff; color:#174ea6; }
    .secret { margin-top:16px; padding:16px; border:1px solid #9fc7ad; border-radius:6px; background:#edf8f1; }
    .secret code { display:block; margin-top:8px; overflow:auto; color:#0f5e36; }
    .error { background:#fff0ef; color:#b42318; }
    .loading { color:var(--muted); }
    @media (max-width:800px){ .layout{grid-template-columns:1fr}.sidebar{position:static}.form-grid{grid-template-columns:1fr}.field.full{grid-column:auto}.app-row{grid-template-columns:1fr}.app-actions{flex-wrap:wrap}.topbar{padding:0 16px}.layout{width:calc(100% - 28px)} }
    a { color:inherit; text-decoration:none; }
    .platform-page { width:min(1180px,calc(100% - 40px)); margin:0 auto; padding:54px 0 88px; }
    .topbar .brand { color:#182130; text-decoration:none; }
    .platform-intro { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:28px; align-items:end; margin-bottom:26px; padding-bottom:26px; border-bottom:1px solid rgba(23,32,51,.12); }
    .platform-intro p { max-width:620px; margin:10px 0 0; color:#68748a; font-size:15px; line-height:1.75; }
    .platform-intro h1 { margin:0; font:700 clamp(38px,5vw,58px)/1 Georgia,"Songti SC",serif; letter-spacing:-.02em; }
    .platform-state { display:grid; gap:6px; min-width:180px; padding-left:20px; border-left:1px solid #d7dee9; color:#68748a; font-size:12px; }
    .platform-state strong { color:#182130; font:700 16px/1.3 Georgia,"Songti SC",serif; }
    .platform-root-panel { border:0; background:transparent; padding:0; }
    .workspace-grid { display:grid; grid-template-columns:minmax(0,1fr) 286px; gap:30px; align-items:start; }
    .workspace-main { min-width:0; }
    .workspace-side { position:sticky; top:94px; display:grid; gap:18px; }
    .section-heading { display:flex; justify-content:space-between; gap:20px; align-items:flex-end; margin-bottom:18px; }
    .section-heading h2 { margin:0; font:700 28px/1.2 Georgia,"Songti SC",serif; }
    .section-heading p { margin:7px 0 0; color:#68748a; font-size:13px; line-height:1.65; }
    .metrics { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); margin-bottom:28px; border:1px solid #d7dee9; background:#fff; }
    .metric { padding:18px 20px; border-right:1px solid #e4e9f0; }
    .metric:last-child { border-right:0; }
    .metric span { display:block; color:#7a8699; font-size:11px; font-weight:700; }
    .metric strong { display:block; margin-top:8px; color:#182130; font:700 24px/1 Georgia,"Songti SC",serif; font-variant-numeric:tabular-nums; }
    .create-panel { margin-bottom:24px; border:1px solid #cfd8e4; background:#fff; }
    .create-panel summary { padding:16px 18px; color:#263246; font-size:14px; font-weight:750; cursor:pointer; list-style:none; }
    .create-panel summary::-webkit-details-marker { display:none; }
    .create-panel summary::after { float:right; content:"+"; color:#2364e8; font-size:18px; line-height:1; }
    .create-panel[open] summary { border-bottom:1px solid #e4e9f0; }
    .create-panel[open] summary::after { content:"−"; }
    .create-panel .form-grid { margin:0; padding:20px; }
    .app-list { display:grid; gap:0; margin-top:0; border-top:1px solid #d7dee9; }
    .app-row { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:22px; padding:22px 0; border:0; border-bottom:1px solid #d7dee9; border-radius:0; background:transparent; }
    .app-row h3 { margin:0 0 8px; font:700 19px/1.3 Georgia,"Songti SC",serif; }
    .app-row code { display:inline-flex; max-width:100%; padding:5px 7px; overflow:auto; border:1px solid #dde4ee; border-radius:4px; background:#f6f8fb; color:#315a9f; font:12px "Cascadia Code",Consolas,monospace; }
    .app-meta { margin-top:8px; color:#748094; font-size:12px; line-height:1.6; }
    .bypass-panel { width:100%; margin-top:16px; padding-top:14px; border-top:1px solid #e4e9f0; }
    .bypass-head { display:flex; align-items:baseline; justify-content:space-between; gap:12px; margin-bottom:10px; }
    .bypass-head strong { color:#263246; font-size:13px; }
    .bypass-head span { color:#7a8699; font-size:11px; }
    .bypass-form { display:grid; grid-template-columns:minmax(180px,1fr) 116px auto; gap:8px; width:100%; }
    .bypass-form input { min-height:38px; font-size:14px; }
    .bypass-form .button { min-width:88px; min-height:38px; padding:0 12px; font-size:12px; white-space:nowrap; }
    .bypass-rules { display:grid; gap:6px; width:100%; margin-top:10px; }
    .bypass-rule { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:8px 10px; border:1px solid #e1e7ef; background:#f8fafc; color:#56647a; font-size:12px; }
    .bypass-rule code { padding:0; border:0; background:transparent; color:#263246; font-size:12px; }
    .bypass-rule button { min-height:30px; padding:0 8px; border:1px solid #efc1bc; border-radius:4px; background:#fff; color:#b42318; font-size:11px; }
    .app-actions { display:flex; align-items:flex-start; gap:8px; }
    .side-panel { border-top:3px solid #182130; background:#fff; padding:20px; }
    .side-panel h3 { margin:0 0 12px; font:700 19px/1.3 Georgia,"Songti SC",serif; }
    .side-panel p { margin:0 0 14px; color:#68748a; font-size:12px; line-height:1.7; }
    .side-panel code { display:block; padding:10px; overflow:auto; border:1px solid #e0e6ee; background:#f7f9fc; color:#315a9f; font:11px/1.55 "Cascadia Code",Consolas,monospace; }
    .side-links { display:grid; gap:1px; margin-top:16px; background:#e4e9f0; border:1px solid #e4e9f0; }
    .side-links a { display:flex; align-items:center; gap:8px; padding:10px 12px; background:#fff; color:#35445c; font-size:12px; font-weight:650; text-decoration:none; }
    .side-links a:hover { color:#2364e8; }
    .login-view { display:grid; grid-template-columns:minmax(0,1fr) minmax(320px,420px); gap:56px; align-items:center; min-height:380px; padding:22px 0; }
    .login-copy h2 { margin:0; font:700 clamp(36px,5vw,54px)/1.05 Georgia,"Songti SC",serif; }
    .login-copy p { max-width:560px; margin:18px 0 0; color:#68748a; font-size:15px; line-height:1.78; }
    .login-box { padding:28px; border:1px solid #d7dee9; background:#fff; box-shadow:0 18px 40px rgba(23,32,51,.08); }
    .login-box .button { width:100%; }
    .button svg,.app-actions svg { width:16px; height:16px; }
    .button { gap:8px; }
    .secret { display:grid; gap:10px; }
    .secret code { white-space:normal; word-break:break-all; }
    .account-name { color:#35445c; font-size:12px; }
    .notice { border-radius:0; }
    @media (max-width:900px){ .workspace-grid,.login-view{grid-template-columns:1fr}.workspace-side{position:static}.platform-intro{grid-template-columns:1fr}.platform-state{padding-left:0;border-left:0}.metrics{grid-template-columns:1fr}.metric{border-right:0;border-bottom:1px solid #e4e9f0}.metric:last-child{border-bottom:0}.bypass-form{grid-template-columns:1fr}.bypass-head{display:grid} }
  </style>
</head>
<body data-platform-enabled="${enabled ? "1" : "0"}" data-login-url="/auth/login">
  <div class="language-banner hidden" id="platform-language-banner">
    <span>检测到浏览器语言，可以选择中文或 English。</span>
    <button type="button" data-platform-language="zh" aria-pressed="false">中文</button>
    <button type="button" data-platform-language="en" aria-pressed="false">English</button>
  </div>
  <header class="topbar">
    <a class="brand" href="/">OxygenChallenge</a>
    <div class="top-actions">
      <span id="account-name" class="muted"></span>
      <a class="button secondary hidden" id="logout-link" href="/auth/logout">退出</a>
    </div>
  </header>
  <main class="platform-page">
    <header class="platform-intro">
      <div>
        <h1>开放平台</h1>
        <p>通过 OxygenAccount 登录，管理 OxygenChallenge 应用、允许来源、动作范围与 API 凭据。site key 用于浏览器嵌入，secret 仅保存在你的服务端。</p>
      </div>
      <div class="platform-state">
        <span>API</span>
        <strong>v1</strong>
        <span>captcha.oxygenai.top</span>
      </div>
    </header>
    <section class="panel platform-root-panel" id="platform-root">
      <div class="loading">正在读取登录状态…</div>
    </section>
  </main>
  <script defer src="/platform.js?v=26.0.0-alpha.10"></script>
</body>
</html>`;
}

export async function registerPlatform(
  app: FastifyInstance,
  config: AppConfig,
  store: PlatformStore,
): Promise<void> {
  const sessions = new Map<string, PlatformSession>();
  const pending = new Map<string, { verifier: string; returnTo: string; expiresAt: number }>();
  let discoveryCache: OidcDiscovery | null = null;

  const platformEnabled = Boolean(
    config.oxygenAccountIssuer &&
      config.oxygenAccountClientId &&
      config.oxygenAccountClientSecret &&
      config.platformDataKey,
  );

  const sessionFor = (request: FastifyRequest): PlatformSession | undefined => {
    const token = parseCookies(request.headers.cookie).oc_platform_session;
    if (!token) {
      return undefined;
    }
    const session = sessions.get(token);
    if (!session || session.expiresAt <= Date.now()) {
      sessions.delete(token);
      return undefined;
    }
    return session;
  };

  const requireSession = (
    request: FastifyRequest,
    reply: FastifyReply,
  ): PlatformSession | undefined => {
    const session = sessionFor(request);
    if (!session) {
      void reply.code(401).send({ error: "OXYGENACCOUNT_LOGIN_REQUIRED" });
      return undefined;
    }
    return session;
  };

  const requireCsrf = (
    request: FastifyRequest,
    reply: FastifyReply,
    session: PlatformSession,
  ): boolean => {
    if (request.headers["x-csrf-token"] !== session.csrf) {
      void reply.code(403).send({ error: "CSRF_REJECTED" });
      return false;
    }
    return true;
  };

  const discovery = async (): Promise<OidcDiscovery> => {
    if (discoveryCache) {
      return discoveryCache;
    }
    if (!config.oxygenAccountIssuer) {
      throw new Error("OxygenAccount issuer is not configured");
    }
    const response = await fetch(
      `${config.oxygenAccountIssuer.replace(/\/$/, "")}/.well-known/openid-configuration`,
      { signal: AbortSignal.timeout(8_000) },
    );
    if (!response.ok) {
      throw new Error("OxygenAccount discovery failed");
    }
    discoveryCache = (await response.json()) as OidcDiscovery;
    return discoveryCache;
  };

  app.get("/platform", async (_request, reply) => {
    reply
      .type("text/html; charset=utf-8")
      .header("Cache-Control", "no-store")
      .header(
        "Content-Security-Policy",
        "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
      );
    return reply.send(platformHtml(config));
  });

  app.get("/auth/login", async (_request, reply) => {
    if (!platformEnabled) {
      return reply.code(503).send({ error: "PLATFORM_NOT_CONFIGURED" });
    }
    const metadata = await discovery();
    const verifier = randomBytes(48).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const state = randomBytes(24).toString("base64url");
    pending.set(state, {
      verifier,
      returnTo: "/platform",
      expiresAt: Date.now() + 10 * 60_000,
    });
    const redirectUri = `${config.publicOrigin}/auth/callback`;
    const authorization = new URL(metadata.authorization_endpoint);
    authorization.searchParams.set("response_type", "code");
    authorization.searchParams.set("client_id", config.oxygenAccountClientId ?? "");
    authorization.searchParams.set("redirect_uri", redirectUri);
    authorization.searchParams.set("scope", "openid profile email");
    authorization.searchParams.set("state", state);
    authorization.searchParams.set("code_challenge", challenge);
    authorization.searchParams.set("code_challenge_method", "S256");
    authorization.searchParams.set("api_version", OXYGENACCOUNT_API_VERSION);
    return reply.redirect(authorization.toString());
  });

  app.get("/auth/callback", async (request, reply) => {
    if (!platformEnabled) {
      return reply.code(503).send({ error: "PLATFORM_NOT_CONFIGURED" });
    }
    const query = request.query as {
      code?: string;
      state?: string;
      error?: string;
    };
    if (query.error || !query.code || !query.state) {
      return reply.code(400).send({ error: query.error ?? "OAUTH_CALLBACK_INVALID" });
    }
    const stored = pending.get(query.state);
    pending.delete(query.state);
    if (!stored || stored.expiresAt <= Date.now()) {
      return reply.code(400).send({ error: "OAUTH_STATE_INVALID" });
    }
    const metadata = await discovery();
    const redirectUri = `${config.publicOrigin}/auth/callback`;
    const form = new URLSearchParams({
      grant_type: "authorization_code",
      code: query.code,
      redirect_uri: redirectUri,
      client_id: config.oxygenAccountClientId ?? "",
      client_secret: config.oxygenAccountClientSecret ?? "",
      code_verifier: stored.verifier,
    });
    const tokenResponse = await fetch(metadata.token_endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-OxygenAccount-API-Version": OXYGENACCOUNT_API_VERSION,
      },
      body: form,
      signal: AbortSignal.timeout(10_000),
    });
    if (!tokenResponse.ok) {
      return reply.code(401).send({ error: "OAUTH_TOKEN_EXCHANGE_FAILED" });
    }
    const tokens = (await tokenResponse.json()) as { access_token?: string };
    if (!tokens.access_token) {
      return reply.code(401).send({ error: "OAUTH_ACCESS_TOKEN_MISSING" });
    }
    const userResponse = await fetch(metadata.userinfo_endpoint, {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        "X-OxygenAccount-API-Version": OXYGENACCOUNT_API_VERSION,
      },
      signal: AbortSignal.timeout(8_000),
    });
    if (!userResponse.ok) {
      return reply.code(401).send({ error: "OXYGENACCOUNT_USERINFO_FAILED" });
    }
    const user = (await userResponse.json()) as PlatformUser;
    if (!user.sub || (user.account_type && user.account_type !== "user")) {
      return reply.code(403).send({ error: "OXYGENACCOUNT_USER_REQUIRED" });
    }
    const id = randomBytes(32).toString("base64url");
    sessions.set(id, {
      user: {
        sub: user.sub,
        name: user.name || user.email || "OxygenAccount user",
        ...(user.email ? { email: user.email } : {}),
        ...(user.picture?.startsWith("https://") ? { picture: user.picture } : {}),
      },
      csrf: randomBytes(24).toString("base64url"),
      expiresAt: Date.now() + 8 * 60 * 60_000,
    });
    setSessionCookie(config, reply, id);
    return reply.redirect(stored.returnTo);
  });

  app.get("/auth/logout", async (request, reply) => {
    const token = parseCookies(request.headers.cookie).oc_platform_session;
    if (token) {
      sessions.delete(token);
    }
    clearSessionCookie(config, reply);
    return reply.redirect("/platform");
  });

  app.get("/api/platform/session", async (request) => {
    const session = sessionFor(request);
    return session
      ? {
          authenticated: true,
          user: session.user,
          csrf: session.csrf,
        }
      : { authenticated: false };
  });

  app.get("/api/platform/apps", async (request, reply) => {
    const session = requireSession(request, reply);
    if (!session) {
      return;
    }
    return { apps: store.list(session.user.sub) };
  });

  app.get("/api/platform/ip", async (request, reply) => {
    const session = requireSession(request, reply);
    if (!session) {
      return;
    }
    return { ip: clientIp({ headers: request.headers, ip: request.ip }) };
  });

  app.post("/api/platform/apps", async (request, reply) => {
    const session = requireSession(request, reply);
    if (!session || !requireCsrf(request, reply, session)) {
      return;
    }
    const parsed = createAppSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "INVALID_APP", issues: parsed.error.issues });
    }
    const origins = [...new Set(parsed.data.origins.map(normalizeOrigin))];
    if (origins.some((origin) => !origin)) {
      return reply.code(400).send({ error: "ORIGIN_MUST_BE_EXACT_HTTPS" });
    }
    const created = await store.create(
      { sub: session.user.sub, name: session.user.name },
      {
        name: parsed.data.name,
        origins: origins as string[],
        actions: [...new Set(parsed.data.actions)],
      },
    );
    return reply.code(201).send(created);
  });

  app.post("/api/platform/apps/:id/rotate", async (request, reply) => {
    const session = requireSession(request, reply);
    if (!session || !requireCsrf(request, reply, session)) {
      return;
    }
    const { id } = request.params as { id: string };
    const rotated = await store.rotate(session.user.sub, id);
    if (!rotated) {
      return reply.code(404).send({ error: "APP_NOT_FOUND" });
    }
    return rotated;
  });

  app.delete("/api/platform/apps/:id", async (request, reply) => {
    const session = requireSession(request, reply);
    if (!session || !requireCsrf(request, reply, session)) {
      return;
    }
    const { id } = request.params as { id: string };
    const archived = await store.archive(session.user.sub, id);
    if (!archived) {
      return reply.code(404).send({ error: "APP_NOT_FOUND" });
    }
    return { archived: true };
  });

  app.post("/api/platform/apps/:id/bypass", async (request, reply) => {
    const session = requireSession(request, reply);
    if (!session || !requireCsrf(request, reply, session)) {
      return;
    }
    const parsed = bypassSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "INVALID_IP_BYPASS", issues: parsed.error.issues });
    }
    const { id } = request.params as { id: string };
    const app = await store.setIpBypass(
      session.user.sub,
      id,
      parsed.data.ip,
      parsed.data.durationMinutes,
    );
    if (!app) {
      return reply.code(404).send({ error: "APP_NOT_FOUND" });
    }
    return app;
  });

  app.delete("/api/platform/apps/:id/bypass", async (request, reply) => {
    const session = requireSession(request, reply);
    if (!session || !requireCsrf(request, reply, session)) {
      return;
    }
    const parsed = bypassDeleteSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "INVALID_IP_BYPASS" });
    }
    const { id } = request.params as { id: string };
    const app = await store.clearIpBypass(session.user.sub, id, parsed.data.ip);
    if (!app) {
      return reply.code(404).send({ error: "APP_NOT_FOUND" });
    }
    return app;
  });
}
