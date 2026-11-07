import {
  Copy,
  createElement,
  ExternalLink,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide";

type PlatformUser = {
  sub: string;
  name: string;
  email?: string;
  picture?: string;
};

type PlatformApp = {
  id: string;
  name: string;
  siteKey: string;
  origins: string[];
  actions: string[];
  createdAt: string;
  secret?: string;
};

type SessionResponse =
  | { authenticated: false }
  | {
      authenticated: true;
      user: PlatformUser;
      csrf: string;
    };

const root = document.querySelector<HTMLElement>("#platform-root");
const accountName = document.querySelector<HTMLElement>("#account-name");
const logoutLink = document.querySelector<HTMLElement>("#logout-link");
const enabled = document.body.dataset.platformEnabled === "1";
const savedLanguage = localStorage.getItem("oxygenchallenge-language");
const detectedLanguage = (navigator.language || "zh").toLowerCase().startsWith("zh")
  ? "zh"
  : "en";
const language =
  savedLanguage === "zh" || savedLanguage === "en" ? savedLanguage : detectedLanguage;
document.documentElement.dataset.lang = language;
document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
const languageBanner = document.querySelector<HTMLElement>("#platform-language-banner");
languageBanner?.classList.remove("hidden");
document.body.classList.add("has-language-banner");
document.querySelectorAll<HTMLButtonElement>("[data-platform-language]").forEach((button) => {
  button.setAttribute(
    "aria-pressed",
    String(button.dataset.platformLanguage === language),
  );
  button.addEventListener("click", () => {
    const next = button.dataset.platformLanguage;
    if (next !== "zh" && next !== "en") {
      return;
    }
    localStorage.setItem("oxygenchallenge-language", next);
    location.reload();
  });
});
let csrf = "";

function t(zh: string, en: string): string {
  return language === "en" ? en : zh;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderLogin(): void {
  if (!root) {
    return;
  }
  root.innerHTML = `
    <div class="login-view">
      <div class="login-copy">
        <h2>${t("使用 OxygenAccount 连接你的应用", "Connect an application with OxygenAccount")}</h2>
        <p>${t(
          "登录后可创建 OxygenChallenge 应用，管理允许的 origin、action、site key 与服务端 secret。",
          "Create OxygenChallenge applications and manage allowed origins, actions, site keys, and server secrets.",
        )}</p>
      </div>
      <div class="login-box">
        <div class="notice">${t(
          "OxygenAccount 会确认你的账户身份，OxygenChallenge 不会保存访问令牌。",
          "OxygenAccount confirms your identity. OxygenChallenge does not retain access tokens.",
        )}</div>
        ${
          enabled
            ? `<a class="button" href="/auth/login" style="margin-top:16px">${t("使用 OxygenAccount 登录", "Sign in with OxygenAccount")}</a>`
            : `<div class="notice error">${t("开放平台 OAuth 尚未配置。", "Open Platform OAuth is not configured.")}</div>`
        }
      </div>
    </div>`;
}

function appMarkup(app: PlatformApp): string {
  return `
    <article class="app-row" data-app-id="${escapeHtml(app.id)}">
      <div>
        <h3>${escapeHtml(app.name)}</h3>
        <code>${escapeHtml(app.siteKey)}</code>
        <div class="app-meta">${app.origins.map(escapeHtml).join(" · ")}</div>
        <div class="app-meta">actions: ${app.actions.map(escapeHtml).join(", ")}</div>
      </div>
      <div class="app-actions">
        <button class="button secondary" data-copy-site="${escapeHtml(app.siteKey)}" type="button">${t("复制 site key", "Copy site key")}</button>
        <button class="button secondary" data-action="rotate" data-id="${escapeHtml(app.id)}" type="button">${t("轮换 secret", "Rotate secret")}</button>
        <button class="button danger" data-action="archive" data-id="${escapeHtml(app.id)}" type="button">${t("停用", "Disable")}</button>
      </div>
    </article>`;
}

async function loadApps(): Promise<void> {
  if (!root) {
    return;
  }
  const response = await fetch("/api/platform/apps");
  if (!response.ok) {
    root.innerHTML = `<div class="notice error">${t("无法读取应用列表。", "Could not load applications.")}</div>`;
    return;
  }
  const body = (await response.json()) as { apps: PlatformApp[] };
  const list = body.apps.length
    ? body.apps.map(appMarkup).join("")
    : `<div class="notice">${t(
        "还没有应用。创建第一个应用后即可接入 captcha.oxygenai.top。",
        "No applications yet. Create one to start integrating captcha.oxygenai.top.",
      )}</div>`;
  const originCount = new Set(body.apps.flatMap((app) => app.origins)).size;
  const actionCount = new Set(body.apps.flatMap((app) => app.actions)).size;
  root.innerHTML = `
    <div class="metrics">
      <div class="metric"><span>${t("应用", "Applications")}</span><strong>${body.apps.length}</strong></div>
      <div class="metric"><span>${t("允许来源", "Allowed origins")}</span><strong>${originCount}</strong></div>
      <div class="metric"><span>${t("动作范围", "Action scopes")}</span><strong>${actionCount}</strong></div>
    </div>
    <div class="workspace-grid">
      <div class="workspace-main">
        <div class="section-heading">
          <div>
            <h2>${t("应用与凭据", "Applications and credentials")}</h2>
            <p>${t(
              "site key 用于浏览器嵌入；secret 仅保存在服务端，用于调用 siteverify。",
              "Use the site key in the browser. Keep the secret server-side and use it only with siteverify.",
            )}</p>
          </div>
        </div>
        <details class="create-panel" ${body.apps.length === 0 ? "open" : ""}>
          <summary>${t("创建新应用", "Create application")}</summary>
          <form id="create-app-form" class="form-grid">
            <div class="field full">
              <label for="app-name">${t("应用名称", "Application name")}</label>
              <input id="app-name" name="name" required minlength="2" maxlength="64" placeholder="${t("例如 OxygenAccount Signup", "For example OxygenAccount Signup")}">
            </div>
            <div class="field full">
              <label for="app-origins">${t("允许的 origin，每行一个", "Allowed origins, one per line")}</label>
              <textarea id="app-origins" name="origins" required placeholder="https://account.oxygenai.top"></textarea>
            </div>
            <div class="field full">
              <label for="app-actions">${t("动作，逗号分隔", "Actions, comma separated")}</label>
              <input id="app-actions" name="actions" required value="signup,login,submit">
            </div>
            <div class="field full">
              <button class="button" type="submit">${t("创建应用", "Create application")}</button>
            </div>
          </form>
        </details>
        <div id="platform-secret"></div>
        <div class="app-list">${list}</div>
      </div>
      <aside class="workspace-side">
        <section class="side-panel">
          <h3>${t("快速接入", "Quick integration")}</h3>
          <p>${t(
            "将组件放入表单。用户完成验证后，浏览器获得一次性 token。",
            "Place the component in a form. After verification, the browser receives a one-time token.",
          )}</p>
          <code>&lt;oxygen-challenge sitekey="..."&gt;&lt;/oxygen-challenge&gt;</code>
          <div class="side-links">
            <a href="/docs/embed" target="_blank" rel="noopener noreferrer">${t("嵌入文档", "Embed guide")}</a>
            <a href="/docs/integration" target="_blank" rel="noopener noreferrer">${t("服务端校验", "Server verification")}</a>
            <a href="/v1/meta" target="_blank" rel="noopener noreferrer">API Meta</a>
          </div>
        </section>
        <section class="side-panel">
          <h3>${t("凭据边界", "Credential boundary")}</h3>
          <p>${t(
            "不要在前端、日志或公开仓库中放置 secret。轮换后旧 secret 立即失效。",
            "Never put a secret in client code, logs, or public repositories. Rotation invalidates the old secret immediately.",
          )}</p>
        </section>
      </aside>
    </div>`;

  const decorate = (
    selector: string,
    icon: Parameters<typeof createElement>[0],
  ) => {
    root.querySelectorAll<HTMLElement>(selector).forEach((element) => {
      element.prepend(
        createElement(icon, {
          width: 16,
          height: 16,
          "stroke-width": 1.8,
          "aria-hidden": "true",
        }),
      );
    });
  };
  decorate("[data-copy-site]", Copy);
  decorate('[data-action="rotate"]', RefreshCw);
  decorate('[data-action="archive"]', Trash2);
  decorate("#create-app-form button[type=submit]", ShieldCheck);
  decorate(".side-links a", ExternalLink);

  root.querySelector<HTMLFormElement>("#create-app-form")?.addEventListener(
    "submit",
    async (event) => {
      event.preventDefault();
      const form = event.currentTarget as HTMLFormElement;
      const data = new FormData(form);
      const origins = String(data.get("origins") ?? "")
        .split(/\r?\n/)
        .map((value) => value.trim())
        .filter(Boolean);
      const actions = String(data.get("actions") ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      const response = await fetch("/api/platform/apps", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf,
        },
        body: JSON.stringify({
          name: String(data.get("name") ?? ""),
          origins,
          actions,
        }),
      });
      const body = (await response.json()) as PlatformApp & { error?: string };
      if (!response.ok) {
        showSecret(`${t("创建失败", "Create failed")}: ${body.error ?? "INVALID_APP"}`, true);
        return;
      }
      showSecret(
        `${t("应用已创建。Secret 只显示一次", "Application created. The secret is shown once")}:<br><code>${escapeHtml(body.secret ?? "")}</code>`,
        false,
      );
      await loadApps();
    },
  );

  root.querySelectorAll<HTMLButtonElement>("[data-copy-site]").forEach((button) => {
    button.addEventListener("click", async () => {
      const value = button.dataset.copySite;
      if (!value) {
        return;
      }
      try {
        await navigator.clipboard.writeText(value);
        showSecret(t("site key 已复制。", "Site key copied."), false);
      } catch {
        showSecret(t("复制失败，请手动选择。", "Copy failed. Select it manually."), true);
      }
    });
  });

  root.querySelectorAll<HTMLButtonElement>("[data-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.dataset.id;
      const action = button.dataset.action;
      if (!id || !action) {
        return;
      }
      button.disabled = true;
      const response = await fetch(
        action === "rotate"
          ? `/api/platform/apps/${encodeURIComponent(id)}/rotate`
          : `/api/platform/apps/${encodeURIComponent(id)}`,
        {
          method: action === "rotate" ? "POST" : "DELETE",
          headers: { "X-CSRF-Token": csrf },
        },
      );
      const body = (await response.json()) as PlatformApp & { error?: string };
      if (!response.ok) {
        showSecret(`${t("操作失败", "Operation failed")}: ${body.error ?? "UNKNOWN"}`, true);
        button.disabled = false;
        return;
      }
      if (action === "rotate") {
        showSecret(
          `${t("Secret 已轮换，旧 secret 立即失效", "Secret rotated. The previous secret is now invalid")}:<br><code>${escapeHtml(body.secret ?? "")}</code>`,
          false,
        );
      } else {
        showSecret(t("应用已停用。", "Application disabled."), false);
      }
      await loadApps();
    });
  });
}

function showSecret(message: string, error: boolean): void {
  const target = document.querySelector<HTMLElement>("#platform-secret");
  if (!target) {
    return;
  }
  target.innerHTML = `<div class="secret${error ? " error" : ""}">${message}</div>`;
}

async function main(): Promise<void> {
  if (!root) {
    return;
  }
  const response = await fetch("/api/platform/session");
  const session = (await response.json()) as SessionResponse;
  if (!session.authenticated) {
    renderLogin();
    return;
  }
  csrf = session.csrf;
  if (accountName) {
    accountName.classList.add("account-name");
    accountName.innerHTML = `${
      session.user.picture
        ? `<img class="account-avatar" src="${escapeHtml(session.user.picture)}" alt="">`
        : ""
    }<span>${escapeHtml(session.user.name)}</span>`;
  }
  logoutLink?.classList.remove("hidden");
  await loadApps();
}

void main();
