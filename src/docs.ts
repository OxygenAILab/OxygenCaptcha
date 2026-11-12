import type { AppConfig } from "./types.js";

export type DocsPage = "index" | "embed" | "integration" | "platform";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const PAGE_META: Record<
  DocsPage,
  {
    titleZh: string;
    titleEn: string;
    kickerZh: string;
    kickerEn: string;
  }
> = {
  index: {
    titleZh: "OxygenChallenge 开发文档",
    titleEn: "OxygenChallenge Developer Docs",
    kickerZh: "面向 Agent 时代的风险自适应验证",
    kickerEn: "Risk-adaptive verification for the agent era",
  },
  embed: {
    titleZh: "嵌入 Widget",
    titleEn: "Embed the widget",
    kickerZh: "Web Component、iframe 与宿主页面事件",
    kickerEn: "Web Component, iframe, and host-page events",
  },
  integration: {
    titleZh: "服务端接入",
    titleEn: "Server integration",
    kickerZh: "siteverify、令牌生命周期与错误处理",
    kickerEn: "siteverify, token lifecycle, and error handling",
  },
  platform: {
    titleZh: "开放平台",
    titleEn: "Open Platform",
    kickerZh: "OxygenAccount、应用凭据与开发 IP 免验证",
    kickerEn: "OxygenAccount, app credentials, and development IP bypass",
  },
};

function navMarkup(active: DocsPage): string {
  return [
    ["/docs", "index", "概览", "Overview"],
    ["/docs/embed", "embed", "嵌入", "Embed"],
    ["/docs/integration", "integration", "接入", "Integration"],
    ["/docs/platform", "platform", "开放平台", "Platform"],
  ]
    .map(
      ([href, page, zh, en]) => `
        <a class="${page === active ? "is-active" : ""}" href="${href}">
          <span class="zh">${zh}</span><span class="en">${en}</span>
        </a>`,
    )
    .join("");
}

function pageIndex(origin: string): string {
  const base = escapeHtml(origin);
  return `
    <section class="doc-hero doc-hero-secondary">
      <div class="doc-hero-copy">
        <p class="doc-kicker"><span class="zh">API v1 + vNext</span><span class="en">API v1 + vNext</span></p>
        <h2><span class="zh">在几分钟内接入验证</span><span class="en">Add verification in minutes</span></h2>
        <p>
          <span class="zh">OxygenChallenge 同时提供浏览器组件与服务端 JSON API。浏览器负责一次交互，业务后端只需要消费一次性令牌。</span>
          <span class="en">OxygenChallenge provides a browser widget and a server JSON API. The browser completes one interaction; your backend consumes a one-time token.</span>
        </p>
      </div>
      <div class="doc-hero-links">
        <a class="button-primary" href="/platform"><span class="zh">打开开放平台</span><span class="en">Open Platform</span></a>
        <a class="button-secondary" href="/docs/embed"><span class="zh">阅读嵌入文档</span><span class="en">Read embed guide</span></a>
      </div>
    </section>
    <section class="doc-grid">
      <article class="doc-card">
        <span class="doc-number">01</span>
        <h2><span class="zh">创建应用</span><span class="en">Create an application</span></h2>
        <p><span class="zh">使用 OxygenAccount 登录开放平台，登记精确 HTTPS origin 与 action，并取得 site key 和 secret。</span><span class="en">Sign in with OxygenAccount, register exact HTTPS origins and actions, then obtain a site key and secret.</span></p>
      </article>
      <article class="doc-card">
        <span class="doc-number">02</span>
        <h2><span class="zh">嵌入组件</span><span class="en">Embed the widget</span></h2>
        <p><span class="zh">在表单放入 <code>&lt;oxygen-challenge&gt;</code>。验证通过后会写入隐藏 token。</span><span class="en">Place <code>&lt;oxygen-challenge&gt;</code> in the form. A hidden token is written after verification.</span></p>
      </article>
      <article class="doc-card">
        <span class="doc-number">03</span>
        <h2><span class="zh">服务端校验</span><span class="en">Verify on the server</span></h2>
        <p><span class="zh">后端调用 <code>POST /v1/siteverify</code>，确认 site key、action 与令牌一次性消费结果。</span><span class="en">Your backend calls <code>POST /v1/siteverify</code> to validate the site key, action, and one-time token consumption.</span></p>
      </article>
    </section>
    <section class="doc-section">
      <div class="doc-section-head">
        <h2><span class="zh">接口地图</span><span class="en">Endpoint map</span></h2>
        <p><span class="zh">Captcha API 版本为 v1；请求可携带 <code>X-Oxygen-Challenge-API-Version: 1</code>。</span><span class="en">The Captcha API is version 1; requests may send <code>X-Oxygen-Challenge-API-Version: 1</code>.</span></p>
      </div>
      <div class="endpoint-table">
        <div><code>POST /v1/challenges</code><span><span class="zh">创建挑战或风险会话</span><span class="en">Create a challenge or risk session</span></span></div>
        <div><code>POST /v2/challenges</code><span><span class="zh">带时区、系统语言与用户选择语言的 vNext 会话</span><span class="en">vNext session with timezone, system language, and user-selected language</span></span></div>
        <div><code>POST /v2/risk/assess</code><span><span class="zh">在创建挑战前评估风险</span><span class="en">Assess risk before creating a challenge</span></span></div>
        <div><code>POST /v1/challenges/:id/verify</code><span><span class="zh">提交交互证据</span><span class="en">Submit interaction evidence</span></span></div>
        <div><code>POST /v1/siteverify</code><span><span class="zh">消费一次性验证令牌</span><span class="en">Consume a one-time verification token</span></span></div>
        <div><code>GET /embed</code><span><span class="zh">服务端渲染嵌入式验证</span><span class="en">Server-rendered embeddable verification</span></span></div>
        <div><code>GET /openapi.yaml</code><span><span class="zh">OpenAPI 3.1 描述</span><span class="en">OpenAPI 3.1 description</span></span></div>
      </div>
    </section>
    <section class="doc-callout">
      <strong><span class="zh">不要在前端放 secret</span><span class="en">Never expose a secret in the browser</span></strong>
      <p><span class="zh">site key 可以公开；secret 只能保存在业务服务端。令牌默认短时有效且一次性。</span><span class="en">A site key is public. Keep the secret on your server. Tokens are short-lived and single-use.</span></p>
      <p class="doc-origin"><span class="zh">服务入口</span><span class="en">Service origin</span>: <code>${base}</code></p>
    </section>`;
}

function pageEmbed(origin: string): string {
  const base = escapeHtml(origin);
  return `
    <section class="doc-section">
      <div class="doc-section-head">
        <h2><span class="zh">最小接入</span><span class="en">Minimal integration</span></h2>
        <p><span class="zh">推荐使用 Web Component。组件默认是 96px 高的紧凑入口，点击后向上展开，不挤压宿主文档流。</span><span class="en">Use the Web Component. It starts as a compact 96px entry, expands upward on interaction, and does not reflow the host page.</span></p>
      </div>
      <pre><code>&lt;script src="${base}/widget.js" defer&gt;&lt;/script&gt;

&lt;form method="post" action="/api/signup"&gt;
  &lt;label for="email"&gt;Email&lt;/label&gt;
  &lt;input id="email" name="email" type="email" required&gt;

  &lt;oxygen-challenge
    sitekey="oc_your_site_key"
    action="signup"
    risk="medium"
    name="oxygen-token"
  &gt;&lt;/oxygen-challenge&gt;

  &lt;button type="submit"&gt;Create account&lt;/button&gt;
&lt;/form&gt;</code></pre>
    </section>
    <section class="doc-section">
      <div class="doc-section-head">
        <h2><span class="zh">组件属性</span><span class="en">Component attributes</span></h2>
      </div>
      <div class="prop-table">
        <div><code>sitekey</code><span><span class="zh">必填。开放平台生成的公开站点 key。</span><span class="en">Required. Public site key generated by the platform.</span></span></div>
        <div><code>action</code><span><span class="zh">业务动作，默认 <code>submit</code>。</span><span class="en">Business action, defaults to <code>submit</code>.</span></span></div>
        <div><code>risk</code><span><span class="zh"><code>low/medium/high/critical</code>，默认 3/4/6/8 步。</span><span class="en"><code>low/medium/high/critical</code>, mapping to 3/4/6/8 steps.</span></span></div>
        <div><code>steps</code><span><span class="zh">1 到 8 的自定义题数，主要用于验收。</span><span class="en">Custom step count from 1 to 8, mainly for acceptance tests.</span></span></div>
        <div><code>challenge-type</code><span><span class="zh">固定题型，仅用于开发与测试。</span><span class="en">Pin a challenge type for development and testing only.</span></span></div>
        <div><code>accessible</code><span><span class="zh">设为 <code>true</code> 时保留兼容替代；入口和题内面板都会收集至少一项、最多四项适配理由。</span><span class="en">Set to <code>true</code> for the compatibility alternative; entry and in-challenge panels collect one to four accessibility reasons.</span></span></div>
        <div><code>media</code><span><span class="zh">无障碍理由中表示当前不便使用麦克风或摄像头；移动端媒体题也可据此换题。</span><span class="en">An accessibility reason for camera or microphone unavailability, including mobile media challenges.</span></span></div>
        <div><code>api-version</code><span><span class="zh">默认 <code>2</code>，上报 vNext 客户端上下文；设为 <code>1</code> 回退旧版。</span><span class="en">Defaults to <code>2</code> and reports vNext context; set <code>1</code> for legacy.</span></span></div>
        <div><code>user-language</code><span><span class="zh">消费端用户选择的界面语言，不是浏览器默认语言。</span><span class="en">Customer-selected interface language, not the browser default.</span></span></div>
        <div><code>name</code><span><span class="zh">隐藏字段名，默认 <code>oxygen-token</code>。</span><span class="en">Hidden input name, defaults to <code>oxygen-token</code>.</span></span></div>
      </div>
    </section>
    <section class="doc-section">
      <div class="doc-section-head">
        <h2><span class="zh">浏览器事件</span><span class="en">Browser events</span></h2>
        <p><span class="zh">组件会触发 <code>verified</code>、<code>complete</code>、<code>step</code> 和 <code>failed</code> 事件。</span><span class="en">The component emits <code>verified</code>, <code>complete</code>, <code>step</code>, and <code>failed</code> events.</span></p>
      </div>
      <pre><code>const challenge = document.querySelector("oxygen-challenge");

challenge.addEventListener("oxygenchallenge:verified", (event) =&gt; {
  console.log(event.detail.token);
});

challenge.addEventListener("oxygenchallenge:step", (event) =&gt; {
  console.log(event.detail.step, event.detail.totalSteps);
});</code></pre>
    </section>
    <section class="doc-section">
      <div class="doc-section-head">
        <h2><span class="zh">开发 IP 免验证</span><span class="en">Development IP bypass</span></h2>
        <p><span class="zh">在开放平台为应用添加当前开发 IP，最长 179 分钟。该 IP 访问此应用的嵌入时无需人工操作，仍会获得正常的一次性 token。</span><span class="en">Add the current development IP to an application for up to 179 minutes. That IP completes the embed without manual interaction and still receives a normal one-time token.</span></p>
      </div>
      <div class="doc-callout compact">
        <strong><span class="zh">仅开发与测试</span><span class="en">Development and testing only</span></strong>
        <p><span class="zh">Captcha API 路径、请求和响应形状不变；免验证规则只影响已登记应用与精确 IP。</span><span class="en">Captcha API paths and payloads do not change; bypass rules only affect the configured application and exact IP.</span></p>
      </div>
    </section>
    <section class="doc-section">
      <div class="doc-section-head">
        <h2><span class="zh">直接 iframe</span><span class="en">Direct iframe</span></h2>
        <p><span class="zh">如果不能使用 Web Component，可直接请求已展开的 Challenge 页面并预留高度。</span><span class="en">If the Web Component is not suitable, request the expanded challenge page and reserve enough height.</span></p>
      </div>
      <pre><code>&lt;iframe
  src="${base}/embed?sitekey=oc_your_site_key&amp;action=submit&amp;launch=1"
  title="Security verification"
  width="440"
  height="560"
  style="border:0"
&gt;&lt;/iframe&gt;</code></pre>
    </section>
    <section class="doc-section">
      <div class="doc-section-head">
        <h2><span class="zh">CSP</span><span class="en">CSP</span></h2>
      </div>
      <pre><code>script-src ${base};
frame-src ${base};</code></pre>
    </section>`;
}

function pageIntegration(origin: string): string {
  const base = escapeHtml(origin);
  return `
    <section class="doc-section">
      <div class="doc-section-head">
        <h2><span class="zh">vNext 风险上下文</span><span class="en">vNext risk context</span></h2>
        <p><span class="zh">API vNext 要求创建挑战时提供 <code>clientContext</code>，并建议消费端传入用户实际选择的语言。Web Component 默认自动收集。</span><span class="en">API vNext requires <code>clientContext</code> when creating a challenge and expects the customer-selected user language. The Web Component collects it by default.</span></p>
      </div>
      <pre><code>{
  "siteKey": "oc_your_site_key",
  "action": "signup",
  "clientContext": {
    "timezone": "Asia/Shanghai",
    "timezoneOffsetMinutes": -480,
    "systemLanguage": "zh-CN",
    "languages": ["zh-CN", "en-US"],
    "selectedLanguage": "zh-CN",
    "hardwareConcurrency": 8,
    "webdriver": false,
    "screen": { "width": 1440, "height": 900, "pixelRatio": 1.25 }
  }
}</code></pre>
      <p class="doc-note"><span class="zh">可以调用 <code>POST /v2/risk/assess</code> 先获得风险等级与建议步数；详细字段见 <code>/openapi.yaml</code>。</span><span class="en">Call <code>POST /v2/risk/assess</code> to obtain a risk level and recommended step count before creating the challenge.</span></p>
    </section>
    <section class="doc-section">
      <div class="doc-section-head">
        <h2><span class="zh">消费令牌</span><span class="en">Consume the token</span></h2>
        <p><span class="zh">浏览器只负责拿到 token。是否放行必须由业务后端调用 <code>siteverify</code> 判断。</span><span class="en">The browser only obtains a token. Your backend must call <code>siteverify</code> before allowing the action.</span></p>
      </div>
      <pre><code>const response = await fetch("${base}/v1/siteverify", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-oxygen-challenge-api-version": "1"
  },
  body: JSON.stringify({
    secret: process.env.OXYGENCHALLENGE_SITE_SECRET,
    response: formData.get("oxygen-token"),
    action: "signup"
  })
});

const result = await response.json();
if (!result.success) {
  throw new Error(result.errorCodes[0]);
}</code></pre>
    </section>
    <section class="doc-section">
      <div class="doc-section-head">
        <h2><span class="zh">响应字段</span><span class="en">Response fields</span></h2>
      </div>
      <div class="prop-table">
        <div><code>success</code><span><span class="zh">令牌是否有效且成功消费。</span><span class="en">Whether the token was valid and successfully consumed.</span></span></div>
        <div><code>siteKey</code><span><span class="zh">令牌绑定的公开站点 key。</span><span class="en">Public site key bound to the token.</span></span></div>
        <div><code>action</code><span><span class="zh">令牌绑定的业务动作。</span><span class="en">Business action bound to the token.</span></span></div>
        <div><code>challengeTs</code><span><span class="zh">验证完成时间。</span><span class="en">Verification completion time.</span></span></div>
      </div>
    </section>
    <section class="doc-section">
      <div class="doc-section-head">
        <h2><span class="zh">错误处理</span><span class="en">Error handling</span></h2>
      </div>
      <div class="prop-table">
        <div><code>TOKEN_REPLAYED</code><span><span class="zh">令牌已被消费，要求用户重新验证。</span><span class="en">Token already consumed; request a fresh verification.</span></span></div>
        <div><code>INVALID_SITE_SECRET</code><span><span class="zh">服务端 secret 错误或已轮换。</span><span class="en">Server secret is invalid or was rotated.</span></span></div>
        <div><code>ORIGIN_NOT_ALLOWED</code><span><span class="zh">嵌入来源不在开放平台白名单。</span><span class="en">Embedding origin is not allowed by the application.</span></span></div>
        <div><code>ACTION_NOT_ALLOWED</code><span><span class="zh">应用没有登记该 action。</span><span class="en">The application did not register that action.</span></span></div>
      </div>
    </section>
    <section class="doc-section">
      <div class="doc-section-head">
        <h2><span class="zh">JSON API 与开发免验证</span><span class="en">JSON API and development bypass</span></h2>
        <p><span class="zh">直接调用 <code>POST /v1/challenges</code> 时，如果当前 IP 命中开发规则，响应仍是标准 <code>human_check</code>，但 <code>minDwellMs</code> 为 0。调用方提交 <code>{"answer":"human","dwellMs":0}</code> 即可拿到正常 token。</span><span class="en">When <code>POST /v1/challenges</code> is called from a matching development IP, the response remains a standard <code>human_check</code> with <code>minDwellMs</code> set to 0. Submit <code>{"answer":"human","dwellMs":0}</code> to receive a normal token.</span></p>
      </div>
      <pre><code>const challenge = await createChallenge({ siteKey, action: "submit" });
// Development bypass: challenge.type === "human_check", minDwellMs === 0
const receipt = await verifyChallenge(challenge.challengeId, {
  answer: "human",
  dwellMs: 0
});
// Consume receipt.token with POST /v1/siteverify exactly as usual.</code></pre>
    </section>`;
}

function pagePlatform(origin: string): string {
  const base = escapeHtml(origin);
  return `
    <section class="doc-section">
      <div class="doc-section-head">
        <h2><span class="zh">OxygenAccount 登录</span><span class="en">OxygenAccount sign-in</span></h2>
        <p><span class="zh">开放平台使用 Authorization Code + PKCE。访问 <code>${base}/platform</code>，选择“使用 OxygenAccount 登录”即可。</span><span class="en">The platform uses Authorization Code + PKCE. Open <code>${base}/platform</code> and choose “Sign in with OxygenAccount”.</span></p>
      </div>
      <div class="doc-callout compact">
        <strong><span class="zh">凭据边界</span><span class="en">Credential boundary</span></strong>
        <p><span class="zh">site key 可以进入浏览器；secret 只在创建或轮换时显示一次，必须保存在业务服务端。</span><span class="en">A site key may live in the browser. A secret is shown once at creation or rotation and must stay on your server.</span></p>
      </div>
    </section>
    <section class="doc-section">
      <div class="doc-section-head">
        <h2><span class="zh">应用管理 API</span><span class="en">Application API</span></h2>
        <p><span class="zh">平台 API 使用 HttpOnly 会话 Cookie，并在写操作中校验 <code>X-CSRF-Token</code>。</span><span class="en">Platform APIs use an HttpOnly session cookie and require <code>X-CSRF-Token</code> on writes.</span></p>
      </div>
      <div class="prop-table">
        <div><code>GET /api/platform/session</code><span><span class="zh">登录状态与 CSRF。</span><span class="en">Sign-in state and CSRF token.</span></span></div>
        <div><code>GET /api/platform/apps</code><span><span class="zh">当前账号拥有的应用。</span><span class="en">Applications owned by the current account.</span></span></div>
        <div><code>POST /api/platform/apps</code><span><span class="zh">创建应用并返回一次性 secret。</span><span class="en">Create an application and return a one-time secret.</span></span></div>
        <div><code>POST /api/platform/apps/:id/rotate</code><span><span class="zh">轮换 secret，旧值立即失效。</span><span class="en">Rotate the secret; the old value expires immediately.</span></span></div>
        <div><code>POST /api/platform/apps/:id/bypass</code><span><span class="zh">新增开发 IP 免验证规则。</span><span class="en">Add a development IP bypass rule.</span></span></div>
        <div><code>DELETE /api/platform/apps/:id/bypass</code><span><span class="zh">删除指定 IP 规则。</span><span class="en">Remove a specific IP rule.</span></span></div>
      </div>
    </section>
    <section class="doc-section">
      <div class="doc-section-head">
        <h2><span class="zh">开发 IP 免验证</span><span class="en">Development IP bypass</span></h2>
        <p><span class="zh">在应用详情内填写 IP 与有效分钟数（1 到 179）。规则到期后自动失效，也可以手动删除。平台会显示当前出口 IP，便于直接添加。</span><span class="en">Enter an IP and a duration from 1 to 179 minutes in the application panel. Rules expire automatically and can be removed manually. The platform displays the current egress IP for convenience.</span></p>
      </div>
      <pre><code>POST /api/platform/apps/&lt;app-id&gt;/bypass
X-CSRF-Token: &lt;csrf&gt;

{
  "ip": "203.0.113.10",
  "durationMinutes": 60
}</code></pre>
      <p class="doc-note"><span class="zh">这不是生产白名单，也不改变 Captcha API。它只用于减少开发和自动化验收时的重复人工操作。</span><span class="en">This is not a production allowlist and does not change the Captcha API. It only removes repetitive manual work during development and acceptance testing.</span></p>
    </section>
    <section class="doc-section">
      <div class="doc-section-head">
        <h2><span class="zh">安全约束</span><span class="en">Security constraints</span></h2>
      </div>
      <div class="prop-table">
        <div><code>origin</code><span><span class="zh">只接受精确 HTTPS origin；localhost 仅用于开发。</span><span class="en">Only exact HTTPS origins are accepted; localhost is for development.</span></span></div>
        <div><code>CSRF</code><span><span class="zh">所有写操作要求会话 Cookie 与 CSRF 头同时匹配。</span><span class="en">Every write requires a matching session cookie and CSRF header.</span></span></div>
        <div><code>secret</code><span><span class="zh">使用服务端数据密钥加密保存，不返回列表接口。</span><span class="en">Encrypted at rest with the server data key and omitted from list responses.</span></span></div>
        <div><code>token</code><span><span class="zh">一次性、短时有效，并绑定 site key 与 action。</span><span class="en">Single-use, short-lived, and bound to a site key and action.</span></span></div>
      </div>
    </section>`;
}

export function docsPageHtml(config: AppConfig, page: DocsPage): string {
  const meta = PAGE_META[page];
  const content =
    page === "embed"
      ? pageEmbed(config.publicOrigin)
      : page === "integration"
        ? pageIntegration(config.publicOrigin)
        : page === "platform"
          ? pagePlatform(config.publicOrigin)
          : pageIndex(config.publicOrigin);
  return `<!doctype html>
<html lang="zh-CN" data-lang="zh">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <title>${escapeHtml(meta.titleZh)} · OxygenChallenge</title>
  <style>
    :root { --ink:#182130; --muted:#68748a; --line:#d9e0e9; --paper:#f4f6f8; --white:#fff; --blue:#2364e8; --green:#12633f; }
    * { box-sizing:border-box; }
    html { scroll-behavior:smooth; }
    body { margin:0; background:var(--paper); color:var(--ink); font:14px/1.75 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif; }
    body.has-language-banner { padding-top:46px; }
    .language-banner { position:fixed; inset:0 0 auto 0; z-index:60; min-height:46px; display:flex; align-items:center; justify-content:center; gap:12px; padding:6px 16px; background:#101a2b; color:#fff; font-size:13px; }
    .language-banner.hidden { display:none; }
    .language-banner button { min-height:34px; padding:0 12px; border:1px solid rgba(255,255,255,.34); border-radius:999px; background:transparent; color:#fff; cursor:pointer; }
    .language-banner button[aria-pressed="true"] { background:#fff; color:#101a2b; }
    a { color:inherit; }
    .topbar { position:sticky; top:0; z-index:30; display:flex; align-items:center; justify-content:space-between; min-height:68px; padding:0 max(20px,calc((100vw - 1180px)/2)); border-bottom:1px solid rgba(24,33,48,.08); background:rgba(255,255,255,.95); backdrop-filter:blur(14px); }
    .brand { color:var(--ink); font:700 21px Georgia,"Songti SC",serif; text-decoration:none; }
    .top-links { display:flex; gap:8px; align-items:center; }
    .top-links a { padding:8px 10px; border-radius:4px; color:#4d5b70; font-size:12px; font-weight:700; text-decoration:none; }
    .top-links a:hover { background:#eef3fb; color:var(--blue); }
    .layout { display:grid; grid-template-columns:230px minmax(0,1fr); gap:44px; width:min(1180px,calc(100% - 40px)); margin:0 auto; padding:42px 0 88px; align-items:start; }
    .side { position:sticky; top:96px; display:grid; gap:5px; }
    .side a { display:block; padding:10px 12px; border-left:2px solid transparent; color:#59677c; font-size:13px; font-weight:650; text-decoration:none; }
    .side a:hover { color:var(--blue); }
    .side a.is-active { border-left-color:var(--blue); background:#fff; color:var(--blue); }
    .doc-kicker { margin:0 0 10px; color:var(--blue); font-size:11px; font-weight:800; letter-spacing:.12em; text-transform:uppercase; }
    .doc-hero { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:28px; align-items:end; padding:10px 0 34px; border-bottom:1px solid var(--line); }
    .doc-hero-secondary { padding-top:0; border-top:0; }
    .doc-hero h1,.doc-hero-secondary h2 { max-width:760px; margin:0; font:700 clamp(38px,5vw,62px)/1.05 Georgia,"Songti SC",serif; letter-spacing:-.025em; }
    .doc-hero p { max-width:700px; margin:18px 0 0; color:var(--muted); font-size:16px; line-height:1.8; }
    .doc-hero-links { display:flex; flex-wrap:wrap; gap:10px; padding-bottom:4px; }
    .button-primary,.button-secondary { display:inline-flex; align-items:center; justify-content:center; min-height:44px; padding:0 16px; border-radius:5px; font-size:13px; font-weight:750; text-decoration:none; }
    .button-primary { background:var(--blue); color:#fff; }
    .button-secondary { border:1px solid #cbd5e2; background:#fff; color:#35445c; }
    .doc-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:1px; margin:28px 0 34px; border:1px solid var(--line); background:var(--line); }
    .doc-card,.doc-section,.doc-callout { background:var(--white); }
    .doc-card { min-height:210px; padding:24px; }
    .doc-number { color:var(--blue); font:700 12px/1 Georgia,serif; }
    .doc-card h2,.doc-section h2,.doc-callout strong { color:var(--ink); }
    .doc-card h2 { margin:34px 0 10px; font:700 22px/1.25 Georgia,"Songti SC",serif; }
    .doc-card p { margin:0; color:var(--muted); font-size:13px; }
    .doc-section { margin-top:22px; padding:28px; border:1px solid var(--line); }
    .doc-section-head { max-width:800px; margin-bottom:18px; }
    .doc-section h2 { margin:0; font:700 27px/1.22 Georgia,"Songti SC",serif; }
    .doc-section-head p,.doc-note { margin:8px 0 0; color:var(--muted); }
    .doc-callout { margin-top:22px; padding:24px 28px; border-left:4px solid var(--blue); }
    .doc-callout.compact { margin:0; padding:18px 20px; }
    .doc-callout strong { font:700 18px/1.3 Georgia,"Songti SC",serif; }
    .doc-callout p { margin:8px 0 0; color:var(--muted); }
    .doc-origin { font-size:12px; }
    pre { margin:0; padding:18px; overflow:auto; border:1px solid #dbe2ec; border-radius:5px; background:#101a2b; color:#e9eef7; font:12px/1.65 "Cascadia Code",Consolas,monospace; }
    code { color:#315a9f; font-family:"Cascadia Code",Consolas,monospace; }
    pre code { color:inherit; }
    .endpoint-table,.prop-table { display:grid; border-top:1px solid var(--line); }
    .endpoint-table > div,.prop-table > div { display:grid; grid-template-columns:minmax(210px,.45fr) minmax(0,1fr); gap:20px; padding:13px 0; border-bottom:1px solid #e7ebf1; }
    .endpoint-table > div > span,.prop-table > div > span { color:var(--muted); }
    .endpoint-table code,.prop-table code { font-size:12px; }
    .en { display:none; }
    html[data-lang="en"] .zh { display:none; }
    html[data-lang="en"] .en { display:inline; }
    @media (max-width:900px) {
      .layout { grid-template-columns:1fr; gap:24px; width:min(100% - 28px,680px); padding-top:28px; }
      .side { position:static; grid-template-columns:repeat(2,minmax(0,1fr)); }
      .side a { border:1px solid var(--line); border-left-width:1px; background:#fff; }
      .side a.is-active { border-color:var(--blue); }
      .doc-hero { grid-template-columns:1fr; }
      .doc-grid { grid-template-columns:1fr; }
      .doc-card { min-height:0; }
      .endpoint-table > div,.prop-table > div { grid-template-columns:1fr; gap:5px; }
      .topbar { padding:0 14px; }
      .top-links { display:none; }
    }
  </style>
</head>
<body>
  <div class="language-banner hidden" id="docs-language-banner">
    <span><span class="zh">检测到浏览器语言，可以选择中文或 English。</span><span class="en">Browser language detected. Choose English or Chinese.</span></span>
    <button type="button" data-docs-language="zh" aria-pressed="false">中文</button>
    <button type="button" data-docs-language="en" aria-pressed="false">English</button>
  </div>
  <header class="topbar">
    <a class="brand" href="/">OxygenChallenge</a>
    <nav class="top-links">
      <a href="/docs">Docs</a>
      <a href="/platform">Open Platform</a>
      <a href="/openapi.yaml">OpenAPI</a>
      <a href="/captcha">/captcha</a>
    </nav>
  </header>
  <main class="layout">
    <aside class="side" aria-label="Documentation">${navMarkup(page)}</aside>
    <article>
      <header class="doc-hero" style="padding:0">
        <div class="doc-hero-copy">
          <p class="doc-kicker"><span class="zh">${escapeHtml(meta.kickerZh)}</span><span class="en">${escapeHtml(meta.kickerEn)}</span></p>
          <h1><span class="zh">${escapeHtml(meta.titleZh)}</span><span class="en">${escapeHtml(meta.titleEn)}</span></h1>
        </div>
      </header>
      ${content}
    </article>
  </main>
  <script>
    (function () {
      var saved = localStorage.getItem("oxygenchallenge-language");
      var detected = (navigator.language || "zh").toLowerCase().indexOf("zh") === 0 ? "zh" : "en";
      var language = saved === "zh" || saved === "en" ? saved : detected;
      document.documentElement.dataset.lang = language;
      document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
      var banner = document.getElementById("docs-language-banner");
      if (banner) {
        banner.classList.remove("hidden");
        document.body.classList.add("has-language-banner");
        Array.prototype.forEach.call(document.querySelectorAll("[data-docs-language]"), function (button) {
          button.setAttribute("aria-pressed", String(button.dataset.docsLanguage === language));
          button.addEventListener("click", function () {
            var next = button.dataset.docsLanguage;
            if (next !== "zh" && next !== "en") return;
            localStorage.setItem("oxygenchallenge-language", next);
            location.reload();
          });
        });
      }
    }());
  </script>
</body>
</html>`;
}
