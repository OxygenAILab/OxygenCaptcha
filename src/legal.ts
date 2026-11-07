import type { AppConfig } from "./types.js";

type LegalKind = "privacy" | "terms";

type LegalSection = {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
};

type LegalDocument = {
  title: string;
  summary: string;
  updated: string;
  sections: LegalSection[];
};

const DOCUMENTS = {
  zh: {
    privacy: {
      title: "隐私政策",
      summary:
        "本政策说明 OxygenChallenge 在签发挑战、评估请求风险和完成人机验证时处理哪些信息，以及你可以如何行使相关权利。",
      updated: "生效日期：2026 年 11 月 8 日",
      sections: [
        {
          title: "1. 我们处理的信息",
          bullets: [
            "交互与验证信息：挑战类型、答题结果、鼠标或触摸轨迹、按键状态、覆盖时长、交易记录和验证时间。",
            "设备与请求信息：浏览器类型、User-Agent、Client Hints、操作系统版本、语言、屏幕与输入能力、IP 地址、请求时间和来源页面。",
            "安全与风险信息：Cloudflare 提供的网络元数据、请求频率、异常自动化特征、风控分数和验证事件日志。",
            "OxygenAccount 资料：当你登录开放平台时，我们接收账号标识、昵称、头像和邮箱等授权范围允许的展示资料。",
          ],
        },
        {
          title: "2. 摄像头与麦克风",
          paragraphs: [
            "摄像头和麦克风只在你主动授权并点击开始后启用。手部图像在浏览器本地通过 MediaPipe 提取骨骼和动作标签，原始视频帧不会上传到 OxygenChallenge 服务器。",
            "麦克风内容在浏览器本地提取用于本次验证的声学特征。原始录音不会上传；服务端只接收完成验证所需的低维特征和时序数据。你拒绝权限时，平台会根据设备与风险策略提供替代挑战。",
          ],
        },
        {
          title: "3. 使用目的",
          bullets: [
            "生成和验证一次性挑战，防止重复使用、自动化和批量攻击。",
            "根据请求画像调整挑战数量与类型，保护客户站点和 OxygenChallenge 服务。",
            "排查故障、审计安全事件、改进挑战质量并满足适用的法律义务。",
          ],
        },
        {
          title: "4. 共享与披露",
          paragraphs: [
            "我们不会出售个人信息。为提供验证服务，我们可能向托管、网络与安全基础设施供应商处理必要数据，例如 Cloudflare Turnstile。客户站点只接收验证结果和一次性令牌，不会收到原始摄像头或麦克风数据。",
            "在法律要求、调查滥用或保护用户与服务安全所必要时，我们可能披露最小必要信息。",
          ],
        },
        {
          title: "5. 保存与安全",
          paragraphs: [
            "挑战状态按短生命周期保存，通常不超过验证会话所需时间。安全日志和开放平台应用数据按运维与审计需要保存，并采用访问控制、加密和最小权限措施。",
            "互联网服务无法保证绝对安全。如发现影响你权益的安全事件，我们会按适用法律采取处置与通知措施。",
          ],
        },
        {
          title: "6. 你的权利",
          paragraphs: [
            "你可以请求访问、更正、删除或限制处理与你有关的个人信息，也可以撤回开放平台授权。部分验证日志可能因安全、争议处理或法定义务需要而保留。",
          ],
        },
        {
          title: "7. 联系方式",
          paragraphs: [
            "隐私相关问题可发送至 support@oxygenai.top。我们会在核实请求后按适用法律处理。",
          ],
        },
      ],
    },
    terms: {
      title: "用户协议",
      summary:
        "本协议适用于访问或接入 OxygenChallenge 的网站、验证组件、API 和开放平台。使用服务即表示你同意以下条款。",
      updated: "生效日期：2026 年 11 月 8 日",
      sections: [
        {
          title: "1. 服务范围",
          paragraphs: [
            "OxygenChallenge 提供风险自适应挑战、一次性验证令牌、可嵌入组件和开放平台。验证结果用于辅助判断请求是否由真实用户完成，不构成对身份、年龄、意图或交易安全的保证。",
          ],
        },
        {
          title: "2. 账户与应用",
          paragraphs: [
            "开放平台通过 OxygenAccount 登录。你应维护账户安全，对所创建应用、允许来源、动作范围和凭据使用负责。site secret 必须仅保存在服务端，不得写入公开代码、日志或客户端。",
          ],
        },
        {
          title: "3. 可接受使用",
          bullets: [
            "不得绕过、攻击、批量破解、转售或滥用验证服务。",
            "不得使用服务实施欺诈、骚扰、违法内容分发或侵害他人权利。",
            "不得伪造来源、盗用密钥、规避速率限制或干扰其他用户。",
            "应根据业务风险自行配置允许来源、动作和验证结果处理策略。",
          ],
        },
        {
          title: "4. 风险信号与自动化",
          paragraphs: [
            "服务可能分析设备、网络、交互时序和行为证据，以调整挑战数量与类型。自动化、异常代理、重复请求或设备能力不匹配可能导致更高风险等级、更多挑战或拒绝验证。",
          ],
        },
        {
          title: "5. 可用性与变更",
          paragraphs: [
            "我们可能更新挑战类型、API、风控策略或本协议。重大变更会通过网站、开放平台或适当的开发者通知发布。你应持续关注集成文档和 API 版本要求。",
          ],
        },
        {
          title: "6. 知识产权",
          paragraphs: [
            "OxygenChallenge 的软件、视觉、文档、商标和服务内容受适用法律保护。除明确授权外，不得复制、反向提供或创建实质性替代服务。开源组件适用其各自许可证。",
          ],
        },
        {
          title: "7. 免责声明与责任限制",
          paragraphs: [
            "服务按现状和可用状态提供。我们会在合理范围内维护服务与安全，但不承诺无中断、无错误或能够识别所有自动化流量。在适用法律允许的最大范围内，OxygenChallenge 不对间接损失、预期利益损失或因客户错误配置产生的责任负责。",
          ],
        },
        {
          title: "8. 终止与联系",
          paragraphs: [
            "违反本协议、危害服务安全或存在违法风险时，我们可以限制或终止访问。协议相关问题可发送至 support@oxygenai.top。",
          ],
        },
      ],
    },
  },
  en: {
    privacy: {
      title: "Privacy Policy",
      summary:
        "This policy explains how OxygenChallenge handles information when issuing challenges, assessing request risk, and completing human verification.",
      updated: "Effective date: November 8, 2026",
      sections: [
        {
          title: "1. Information we process",
          bullets: [
            "Interaction and verification data: challenge type, answers, pointer or touch paths, key state, coverage duration, trade records, and verification timing.",
            "Device and request data: browser and User-Agent, Client Hints, operating system version, language, screen and input capabilities, IP address, request time, and referring page.",
            "Security and risk data: network metadata supplied by Cloudflare, request frequency, automation indicators, risk scores, and verification event logs.",
            "OxygenAccount data: when you sign in to the Open Platform, we receive the account identifier, display name, avatar, and email allowed by the approved scopes.",
          ],
        },
        {
          title: "2. Camera and microphone",
          paragraphs: [
            "Camera and microphone access starts only after you grant permission and choose to begin. Hand images are processed locally with MediaPipe to derive landmarks and gesture labels. Raw video frames are not uploaded to OxygenChallenge.",
            "Acoustic features are extracted locally for the current verification. Raw recordings are not uploaded; the server receives only the low-dimensional features and timing needed to complete verification. If you deny access, an alternative may be offered according to the device and risk policy.",
          ],
        },
        {
          title: "3. Why we use information",
          bullets: [
            "To issue and verify one-time challenges and prevent replay, automation, and bulk attacks.",
            "To adapt challenge count and type to request risk and protect customer sites and OxygenChallenge.",
            "To troubleshoot, audit security events, improve challenge quality, and meet applicable legal obligations.",
          ],
        },
        {
          title: "4. Sharing and disclosure",
          paragraphs: [
            "We do not sell personal information. We may use hosting, network, and security providers to process necessary data, including Cloudflare Turnstile. Customer sites receive a verification result and one-time token, not raw camera or microphone data.",
            "We may disclose the minimum necessary information when required by law or when needed to investigate abuse and protect users and the service.",
          ],
        },
        {
          title: "5. Retention and security",
          paragraphs: [
            "Challenge state is short-lived and generally retained only for the verification session. Security logs and Open Platform application data are retained as needed for operations and audit, with access control, encryption, and least-privilege measures.",
            "No internet service can guarantee absolute security. If a security event affects your rights, we will take and communicate measures as required by applicable law.",
          ],
        },
        {
          title: "6. Your rights",
          paragraphs: [
            "You may request access, correction, deletion, or restriction of personal information and may revoke Open Platform authorization. Some verification logs may be retained for security, dispute handling, or legal obligations.",
          ],
        },
        {
          title: "7. Contact",
          paragraphs: [
            "Send privacy questions to support@oxygenai.top. We will process verified requests under applicable law.",
          ],
        },
      ],
    },
    terms: {
      title: "User Agreement",
      summary:
        "This agreement applies to the OxygenChallenge website, verification widget, API, and Open Platform. By using the service, you agree to these terms.",
      updated: "Effective date: November 8, 2026",
      sections: [
        {
          title: "1. Service",
          paragraphs: [
            "OxygenChallenge provides risk-adaptive challenges, one-time verification tokens, embeddable components, and an Open Platform. A verification result helps assess whether a request was completed by a real user; it does not guarantee identity, age, intent, or transaction safety.",
          ],
        },
        {
          title: "2. Accounts and applications",
          paragraphs: [
            "The Open Platform uses OxygenAccount sign-in. You are responsible for account security and for the applications, allowed origins, action scopes, and credentials you create. Site secrets must remain server-side and must not be exposed in public code, logs, or clients.",
          ],
        },
        {
          title: "3. Acceptable use",
          bullets: [
            "Do not bypass, attack, bulk-solve, resell, or otherwise abuse the verification service.",
            "Do not use the service for fraud, harassment, illegal content, or infringement of others' rights.",
            "Do not forge origins, steal keys, evade rate limits, or interfere with other users.",
            "Configure allowed origins, actions, and verification decisions according to your own business risk.",
          ],
        },
        {
          title: "4. Risk signals and automation",
          paragraphs: [
            "The service may analyze device, network, interaction timing, and behavioral evidence to adjust challenge count and type. Automation, abnormal proxies, repeated requests, or mismatched device capabilities may increase risk, add challenges, or result in rejection.",
          ],
        },
        {
          title: "5. Availability and changes",
          paragraphs: [
            "We may update challenge types, APIs, risk policies, or these terms. Material changes will be published on the website, Open Platform, or through appropriate developer notices. You are responsible for following integration documentation and API version requirements.",
          ],
        },
        {
          title: "6. Intellectual property",
          paragraphs: [
            "The OxygenChallenge software, visual design, documentation, trademarks, and service content are protected by applicable law. You may not copy, re-host, or create a substantially competing service except as expressly authorized. Open-source components remain governed by their licenses.",
          ],
        },
        {
          title: "7. Disclaimer and limitation",
          paragraphs: [
            "The service is provided as available. We work to maintain service and security but do not promise uninterrupted operation, freedom from errors, or detection of every automated request. To the maximum extent permitted by law, OxygenChallenge is not liable for indirect loss, lost profits, or consequences of customer misconfiguration.",
          ],
        },
        {
          title: "8. Termination and contact",
          paragraphs: [
            "We may restrict or terminate access for violations, security harm, or unlawful risk. Send agreement questions to support@oxygenai.top.",
          ],
        },
      ],
    },
  },
} satisfies Record<"zh" | "en", Record<LegalKind, LegalDocument>>;

function sectionsHtml(document: LegalDocument): string {
  return document.sections
    .map(
      (section) => `
        <section>
          <h2>${section.title}</h2>
          ${(section.paragraphs ?? []).map((paragraph) => `<p>${paragraph}</p>`).join("")}
          ${
            section.bullets
              ? `<ul>${section.bullets.map((item) => `<li>${item}</li>`).join("")}</ul>`
              : ""
          }
        </section>`,
    )
    .join("");
}

export function legalPageHtml(config: AppConfig, kind: LegalKind): string {
  const zh = DOCUMENTS.zh[kind];
  const en = DOCUMENTS.en[kind];
  const labels = {
    zh: {
      privacy: DOCUMENTS.zh.privacy.title,
      terms: DOCUMENTS.zh.terms.title,
      toc: "本文目录",
    },
    en: {
      privacy: DOCUMENTS.en.privacy.title,
      terms: DOCUMENTS.en.terms.title,
      toc: "On this page",
    },
  };
  return `<!doctype html>
<html lang="zh-CN" data-lang="zh">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="description" content="${zh.summary}">
  <title>${zh.title} · OxygenChallenge</title>
  <style>
    :root{--ink:#182130;--muted:#667286;--line:#d9e0e9;--paper:#f3f5f8;--white:#fff;--blue:#2364e8;--serif:Georgia,"Songti SC","Noto Serif CJK SC",serif;--sans:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif;--banner-h:46px}
    *{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--sans)}body.has-banner{padding-top:var(--banner-h)}a{color:inherit;text-decoration:none}button{font:inherit}
    .banner{position:fixed;inset:0 0 auto;z-index:20;display:flex;align-items:center;justify-content:center;gap:12px;min-height:var(--banner-h);padding:6px 16px;background:#162033;color:#fff;font-size:13px}.banner.hidden{display:none}.banner div{display:flex;gap:6px}.banner button{min-height:34px;padding:0 12px;border:1px solid rgba(255,255,255,.36);border-radius:999px;background:transparent;color:#fff;cursor:pointer}.banner button[aria-pressed="true"]{background:#fff;color:#162033}
    .nav{display:flex;align-items:center;justify-content:space-between;min-height:68px;padding:0 max(20px,calc((100vw - 960px)/2));border-bottom:1px solid rgba(24,33,48,.09);background:rgba(255,255,255,.93);backdrop-filter:blur(14px)}body.has-banner .nav{position:sticky;top:var(--banner-h)}.brand{color:var(--ink);font:700 20px var(--serif);text-decoration:none}.nav div{display:flex;gap:18px;font-size:13px}
    main{width:min(960px,calc(100% - 40px));margin:0 auto;padding:64px 0 88px}.mast{border-bottom:1px solid var(--line);padding-bottom:32px}.kicker{margin:0 0 12px;color:var(--blue);font-size:12px;font-weight:750}.mast h1{margin:0;font:700 clamp(42px,7vw,72px)/1 var(--serif);letter-spacing:-.02em}.summary{max-width:720px;margin:20px 0 0;color:var(--muted);font-size:17px;line-height:1.8}.updated{margin:16px 0 0;color:var(--muted);font-size:12px}
    .document{display:grid;grid-template-columns:220px minmax(0,1fr);gap:54px;margin-top:44px}.toc{position:sticky;top:calc(var(--banner-h) + 28px);align-self:start}.toc strong{display:block;margin-bottom:12px;font-size:12px}.toc a{display:block;padding:6px 0;color:var(--muted);font-size:12px;line-height:1.5;text-decoration:none}.toc a:hover{color:var(--blue)}article{background:var(--white);border-top:3px solid var(--ink);padding:8px 36px 36px}article section{padding:28px 0;border-bottom:1px solid var(--line)}article section:last-child{border-bottom:0}article h2{margin:0 0 14px;font:700 22px/1.3 var(--serif)}article p,article li{color:#394558;font-size:15px;line-height:1.85}article ul{margin:0;padding-left:22px}article li+li{margin-top:8px}.foot{border-top:1px solid var(--line);margin-top:36px;padding-top:20px;color:var(--muted);font-size:12px}
    @media(max-width:760px){.banner{align-items:flex-start;flex-wrap:wrap;justify-content:flex-start}.document{grid-template-columns:1fr;gap:24px}.toc{position:static;columns:2}.toc strong{column-span:all}main{padding-top:42px}article{padding:4px 20px 24px}.nav div{gap:12px}}
    @media(max-width:480px){main{width:calc(100% - 28px)}.toc{columns:1}.mast h1{font-size:42px}.nav{padding:0 14px}.nav div a:first-child{display:none}}
    @media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
  </style>
</head>
<body>
  <div class="banner hidden" id="legal-banner">
    <span id="legal-banner-copy">检测到浏览器语言，可以选择中文或 English。</span>
    <div><button type="button" data-language="zh" aria-pressed="false">中文</button><button type="button" data-language="en" aria-pressed="false">English</button></div>
  </div>
  <nav class="nav"><a class="brand" href="/">OxygenChallenge</a><div><a href="/privacy-policy" id="nav-privacy">${DOCUMENTS.zh.privacy.title}</a><a href="/user-agreement" id="nav-terms">${DOCUMENTS.zh.terms.title}</a></div></nav>
  <main>
    <header class="mast"><p class="kicker">OxygenChallenge</p><h1 id="legal-title">${zh.title}</h1><p class="summary" id="legal-summary">${zh.summary}</p><p class="updated" id="legal-updated">${zh.updated}</p></header>
    <div class="document">
      <aside class="toc" aria-label="目录"><strong id="toc-title">本文目录</strong><div id="toc-links">${zh.sections.map((section, index) => `<a href="#section-${index + 1}">${section.title}</a>`).join("")}</div></aside>
      <article id="legal-body">${sectionsHtml(zh)}</article>
    </div>
    <footer class="foot" id="legal-foot">OxygenChallenge · ${config.publicOrigin} · support@oxygenai.top</footer>
  </main>
  <script>
    (() => {
      const zh = ${JSON.stringify(zh)};
      const en = ${JSON.stringify(en)};
      const labels = ${JSON.stringify(labels)};
      const kind = ${JSON.stringify(kind)};
      const root = document.documentElement;
      const banner = document.querySelector("#legal-banner");
      const saved = localStorage.getItem("oxygenchallenge-language");
      const detected = (navigator.language || "zh").toLowerCase().startsWith("zh") ? "zh" : "en";
      const language = saved === "zh" || saved === "en" ? saved : detected;
      const escapeHtml = (value) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
      const sectionHtml = (documentData) => documentData.sections.map((section) => \`<section><h2>\${escapeHtml(section.title)}</h2>\${(section.paragraphs || []).map((paragraph) => \`<p>\${escapeHtml(paragraph)}</p>\`).join("")}\${section.bullets ? \`<ul>\${section.bullets.map((item) => \`<li>\${escapeHtml(item)}</li>\`).join("")}</ul>\` : ""}</section>\`).join("");
      const apply = (next) => {
        const documentData = next === "en" ? en : zh;
        root.dataset.lang = next;
        root.lang = next === "zh" ? "zh-CN" : "en";
        document.title = \`\${documentData.title} · OxygenChallenge\`;
        document.querySelector("#legal-title").textContent = documentData.title;
        document.querySelector("#legal-summary").textContent = documentData.summary;
        document.querySelector("#legal-updated").textContent = documentData.updated;
        document.querySelector("#legal-body").innerHTML = sectionHtml(documentData);
        document.querySelector("#legal-foot").textContent = \`OxygenChallenge · ${config.publicOrigin} · support@oxygenai.top\`;
        document.querySelector("#nav-privacy").textContent = labels[next].privacy;
        document.querySelector("#nav-terms").textContent = labels[next].terms;
        document.querySelector("#toc-title").textContent = labels[next].toc;
        document.querySelector("#toc-links").innerHTML = documentData.sections.map((section, index) => \`<a href="#section-\${index + 1}">\${escapeHtml(section.title)}</a>\`).join("");
        document.querySelector("#legal-banner-copy").textContent = next === "en" ? "Your browser language was detected. Choose English or 中文." : "检测到浏览器语言，可以选择中文或 English。";
        document.querySelectorAll("[data-language]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.language === next)));
      };
      apply(language);
      banner.classList.remove("hidden");
      document.body.classList.add("has-banner");
      document.querySelectorAll("[data-language]").forEach((button) => button.addEventListener("click", () => {
        const next = button.dataset.language;
        if (next !== "zh" && next !== "en") return;
        localStorage.setItem("oxygenchallenge-language", next);
        apply(next);
        banner.classList.add("hidden");
        document.body.classList.remove("has-banner");
      }));
    })();
  </script>
</body>
</html>`;
}
