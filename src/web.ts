import type { AppConfig } from "./types.js";

const CHALLENGES = [
  { zhTitle: "反色诱饵", enTitle: "Inverse decoy", zhDescription: "DOM 语义陷阱与视觉数字", enDescription: "DOM semantic trap and visual digits" },
  { zhTitle: "图标网格", enTitle: "Icon grid", zhDescription: "目标识别与精确多选", enDescription: "Target recognition and exact multiselect" },
  { zhTitle: "动态覆盖", enTitle: "Motion cover", zhDescription: "持续定位移动目标", enDescription: "Track and cover a moving target" },
  { zhTitle: "声音序列", enTitle: "Audio sequence", zhDescription: "动物声音与顺序记忆", enDescription: "Animal sounds and ordered recall" },
  { zhTitle: "高难计算", enTitle: "Hard calculation", zhDescription: "提高批量尝试成本", enDescription: "Raise the cost of bulk attempts" },
  { zhTitle: "键盘指针", enTitle: "Key + pointer", zhDescription: "双输入并发与持续时间", enDescription: "Concurrent input and held duration" },
  { zhTitle: "序列记忆", enTitle: "Pattern memory", zhDescription: "图标闪烁顺序复述", enDescription: "Recall a flashing icon sequence" },
  { zhTitle: "瞬时计数", enTitle: "Flash count", zhDescription: "短时视觉编码与计数", enDescription: "Short-term visual encoding and counting" },
  { zhTitle: "股市交易", enTitle: "Market trade", zhDescription: "低点买入、高点卖出", enDescription: "Buy the low and sell the high" },
  { zhTitle: "基础确认", enTitle: "Basic check", zhDescription: "我不是机器人交互检查", enDescription: "I am not a robot interaction check" },
  { zhTitle: "方向校准", enTitle: "Rotate align", zhDescription: "旋转到正确方向", enDescription: "Rotate the object back to upright" },
  { zhTitle: "语义选择", enTitle: "Semantic pick", zhDescription: "轻量常识与理解检查", enDescription: "Lightweight semantic comprehension" },
  { zhTitle: "Cloudflare", enTitle: "Cloudflare", zhDescription: "Turnstile 托管验证", enDescription: "Turnstile managed verification" },
  { zhTitle: "手部动作", enTitle: "Hand motion", zhDescription: "WebCam 骨骼动态手势", enDescription: "WebCam skeleton gesture sequence" },
  { zhTitle: "声学一致", enTitle: "Speech wave", zhDescription: "同词多遍波形差异", enDescription: "Same-word acoustic variation" },
] as const;

export function officialSiteHtml(config: AppConfig): string {
  const origin = config.publicOrigin;
  const demoSiteKey = config.sites[0]?.key ?? "oc_public_demo";
  const challengeCards = CHALLENGES.map(
    (challenge, index) => `
      <article class="challenge-item">
        <span class="challenge-number">${String(index + 1).padStart(2, "0")}</span>
        <div>
          <h3 data-i18n="challenge.${index + 1}.title">${challenge.zhTitle}</h3>
          <p data-i18n="challenge.${index + 1}.description">${challenge.zhDescription}</p>
        </div>
      </article>`,
  ).join("");

  const translations = {
    zh: {
      "language.notice": "检测到你的浏览器语言，可以选择中文或 English。",
      "nav.challenges": "题型",
      "nav.risk": "风险体系",
      "nav.developers": "开发者",
      "nav.start": "开始验证",
      "hero.eyebrow": "Human verification for the agent era",
      "hero.title": "验证行为，<br>不只看答案。",
      "hero.body": "面向 Agent 与自动化流量的风险自适应验证平台。组合感知、动作、时序、设备与网络证据，为每一次 Challenge 生成可验证的风险上下文。",
      "hero.start": "体验随机挑战",
      "hero.docs": "查看接入",
      "hero.signal.kicker": "实时信号",
      "hero.signal.1": "行为证据",
      "hero.signal.1.body": "指针 · 按键 · 时序",
      "hero.signal.2": "设备上下文",
      "hero.signal.2.body": "UA · 平台 · 输入能力",
      "hero.signal.3": "风险决策",
      "hero.signal.3.body": "动态题数与验证路径",
      "demo.eyebrow": "Live challenge",
      "demo.title": "真实产品，不是演示占位。",
      "demo.body": "当前卡片直接连接 OxygenChallenge API。每次刷新都会重新签发一次性 Challenge，答案、题型与风险会话均只存在于服务端。",
      "demo.note": "API-only · 一次性令牌 · 自动风险升级",
      "challenge.kicker": "Challenge library",
      "challenge.heading": "十五种题型，落在同一风险会话。",
      "risk.kicker": "Adaptive risk",
      "risk.heading": "风险决定步骤，<br>而不是固定弹题。",
      "risk.1.title": "请求画像",
      "risk.1.body": "User-Agent、Client Hints、平台、系统版本、语言和 Fetch Metadata。",
      "risk.2.title": "网络上下文",
      "risk.2.body": "Cloudflare IP、国家、请求频次、User-Agent 轮换与跨境不一致。",
      "risk.3.title": "会话预算",
      "risk.3.body": "基础 3 步，风险升级为 4 / 6 / 8 步，中间步骤不签发令牌。",
      "risk.4.title": "过程证据",
      "risk.4.body": "指针、按键、时序、视频骨骼、设备端声学特征与 Turnstile。",
      "privacy.heading": "敏感数据尽量不离开设备。",
      "privacy.1": "摄像头帧在本地完成 MediaPipe 手部骨骼识别，只提交动作标签和持续时间。",
      "privacy.2": "麦克风在本地提取频段与能量特征，原始音频不上传；服务端比较同一词段多遍朗读的非完全一致性。",
      "privacy.3": "拒绝摄像头或麦克风权限时，始终保留反色遮挡与听觉无障碍替代。",
      "developer.kicker": "For builders",
      "developer.heading": "一次嵌入，服务端最终确认。",
      "developer.body": "Web Component 自动注入一次性 token；客户后端调用 siteverify 消费 token。开放平台应用使用 OxygenAccount 登录后创建与管理。",
      "developer.button": "打开开放平台",
      "footer.brand": "OxygenChallenge · Human verification for the agent era",
      "footer.privacy": "隐私政策",
      "footer.terms": "用户条款",
      ...Object.fromEntries(
        CHALLENGES.flatMap((challenge, index) => [
          [`challenge.${index + 1}.title`, challenge.zhTitle],
          [`challenge.${index + 1}.description`, challenge.zhDescription],
        ]),
      ),
    },
    en: {
      "language.notice": "Your browser language was detected. Choose 中文 or English.",
      "nav.challenges": "Challenges",
      "nav.risk": "Risk model",
      "nav.developers": "Developers",
      "nav.start": "Start challenge",
      "hero.eyebrow": "Human verification for the agent era",
      "hero.title": "Verify behavior,<br>not just answers.",
      "hero.body": "A risk-adaptive verification platform for agents and automated traffic. It combines perception, action, timing, device, and network evidence into a verifiable risk context.",
      "hero.start": "Try a random challenge",
      "hero.docs": "Read the integration guide",
      "hero.signal.kicker": "Live signal",
      "hero.signal.1": "Behavior",
      "hero.signal.1.body": "Pointer · keys · timing",
      "hero.signal.2": "Device context",
      "hero.signal.2.body": "UA · platform · capabilities",
      "hero.signal.3": "Risk decision",
      "hero.signal.3.body": "Adaptive steps and paths",
      "demo.eyebrow": "Live challenge",
      "demo.title": "A real product, not a demo placeholder.",
      "demo.body": "This card talks directly to the OxygenChallenge API. Each refresh issues a new one-time challenge; answers, challenge types, and risk sessions stay on the server.",
      "demo.note": "API-only · one-time token · adaptive risk",
      "challenge.kicker": "Challenge library",
      "challenge.heading": "Fifteen challenge types, one risk session.",
      "risk.kicker": "Adaptive risk",
      "risk.heading": "Risk chooses the steps,<br>not a fixed quiz.",
      "risk.1.title": "Request profile",
      "risk.1.body": "User-Agent, Client Hints, platform, OS version, language, and Fetch Metadata.",
      "risk.2.title": "Network context",
      "risk.2.body": "Cloudflare IP, country, request frequency, User-Agent rotation, and cross-border inconsistency.",
      "risk.3.title": "Session budget",
      "risk.3.body": "Three base steps, upgraded to 4 / 6 / 8 by risk. No token is issued before the final step.",
      "risk.4.title": "Process evidence",
      "risk.4.body": "Pointer, keys, timing, video skeleton, on-device acoustic features, and Turnstile.",
      "privacy.heading": "Keep sensitive data on the device whenever possible.",
      "privacy.1": "Camera frames are processed locally by MediaPipe; only gesture labels and durations are submitted.",
      "privacy.2": "The microphone extracts band and energy features locally. Raw audio is not uploaded; the server compares the same-word variation across repeated readings.",
      "privacy.3": "If camera or microphone permission is denied, inverse-occlusion and audio alternatives remain available.",
      "developer.kicker": "For builders",
      "developer.heading": "One embed, final verification on your server.",
      "developer.body": "The Web Component injects a one-time token; your backend consumes it with siteverify. Open Platform apps are created and managed after signing in with OxygenAccount.",
      "developer.button": "Open the platform",
      "footer.brand": "OxygenChallenge · Human verification for the agent era",
      "footer.privacy": "Privacy",
      "footer.terms": "Terms",
      ...Object.fromEntries(
        CHALLENGES.flatMap((challenge, index) => [
          [`challenge.${index + 1}.title`, challenge.enTitle],
          [`challenge.${index + 1}.description`, challenge.enDescription],
        ]),
      ),
    },
  };

  return `<!doctype html>
<html lang="zh-CN" data-lang="zh">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="description" content="OxygenChallenge 是面向 Agent 时代的人机与交互验证开放平台。">
  <title>OxygenChallenge — Human verification for the agent era</title>
  <style>
    :root { --ink:#172033; --muted:#637086; --line:#d7dee9; --paper:#f3f5f8; --white:#fff; --blue:#2f6fed; --navy:#101a2b; --serif:Georgia,"Times New Roman","Songti SC",serif; --sans:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif; --banner-h:46px; }
    *{box-sizing:border-box} html{scroll-behavior:smooth} body{margin:0;color:var(--ink);background:var(--paper);font-family:var(--sans)} body.has-language-banner{padding-top:var(--banner-h)} a{color:inherit;text-decoration:none} button,iframe{font:inherit}
    .language-banner{position:fixed;inset:0 0 auto 0;z-index:60;min-height:var(--banner-h);display:flex;align-items:center;justify-content:center;gap:14px;padding:6px 16px;background:#101a2b;color:#fff;font-size:13px}
    .language-banner.hidden{display:none}.language-actions{display:flex;align-items:center;gap:6px}.language-banner button{min-height:34px;padding:0 12px;border:1px solid rgba(255,255,255,.34);border-radius:999px;background:transparent;color:#fff;cursor:pointer}.language-banner button[aria-pressed="true"]{background:#fff;color:#101a2b}.language-close{min-width:34px;padding:0!important;font-size:18px}
    .site-nav{position:sticky;top:0;z-index:20;display:flex;align-items:center;justify-content:space-between;min-height:68px;padding:0 max(24px,calc((100vw - 1180px)/2));background:rgba(255,255,255,.92);border-bottom:1px solid rgba(23,32,51,.08);backdrop-filter:blur(16px)} body.has-language-banner .site-nav{top:var(--banner-h)}
    .brand{font-family:var(--serif);font-size:20px;font-weight:700}.nav-links{display:flex;align-items:center;gap:22px;font-size:13px;color:var(--muted)}.nav-cta,.primary-button{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 18px;border-radius:6px;background:var(--blue);color:#fff;font-weight:700}
    .hero{position:relative;min-height:min(680px,calc(100svh - 68px));display:grid;align-items:center;overflow:hidden;background:#111b2d;color:#fff}.hero-copy{position:relative;z-index:1;display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:12px;align-items:end;width:min(1180px,calc(100% - 48px));margin:0 auto;padding:80px 0 64px;color:#fff}.hero-copy>*{grid-column:1/8}.eyebrow{margin:0 0 16px;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase}h1,h2,h3{font-family:var(--serif)}h1{max-width:820px;margin:0;font-size:clamp(48px,7vw,92px);line-height:.98;letter-spacing:-.035em}.hero-copy>p:not(.eyebrow){max-width:650px;margin:24px 0 30px;color:rgba(255,255,255,.76);font-size:clamp(16px,2vw,21px);line-height:1.7}.hero-actions{display:flex;flex-wrap:wrap;gap:12px}.secondary-button{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 18px;border:1px solid rgba(255,255,255,.32);border-radius:6px;color:#fff;font-weight:650}.hero-signal{grid-column:10/13;align-self:end;display:grid;gap:16px;padding:4px 0 6px 22px;border-left:1px solid rgba(255,255,255,.22)}.hero-signal>span{display:block;color:rgba(255,255,255,.5);font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase}.hero-signal strong{display:block;margin-top:3px;color:#fff;font:400 18px/1.35 var(--serif)}.hero-signal small{display:block;margin-top:5px;color:rgba(255,255,255,.58);font-size:11px;line-height:1.45}.hero-signal-item{padding-bottom:16px;border-bottom:1px solid rgba(255,255,255,.12)}.hero-signal-item:last-child{padding-bottom:0;border-bottom:0}
    .section{padding:92px 0}.section-inner{width:min(1180px,calc(100% - 48px));margin:0 auto}.section-head{display:grid;grid-template-columns:repeat(12,1fr);gap:12px;margin-bottom:42px;align-items:end}.section-head .eyebrow{grid-column:1/4;color:var(--blue)}.section-head h2{grid-column:4/13;margin:0;font-size:clamp(34px,4.5vw,64px);line-height:1.05;letter-spacing:-.025em}.site-footer a{color:inherit;text-decoration:none}.site-footer a:hover{text-decoration:underline}
    .demo-section{background:var(--white)}.demo-grid{display:grid;grid-template-columns:1fr minmax(320px,460px);gap:56px;align-items:center}.demo-grid>*{min-width:0}.demo-copy h2{margin:0 0 18px;font-size:clamp(36px,4vw,58px);line-height:1.08}.demo-copy p{max-width:560px;margin:0 0 24px;color:var(--muted);font-size:17px;line-height:1.75}.demo-note{display:inline-flex;align-items:center;gap:8px;color:var(--blue);font-size:13px;font-weight:700}.demo-widget{position:relative;display:grid;grid-template-columns:minmax(0,1fr);justify-items:stretch;width:100%;min-width:0;min-height:260px;padding:34px 20px;border:1px solid var(--line);background:#f3f5f8}.demo-widget oxygen-challenge{max-width:100%!important}
    .challenge-grid{display:grid;grid-template-columns:repeat(3,1fr);border-top:1px solid var(--line)}.challenge-item{display:grid;grid-template-columns:40px 1fr;gap:14px;min-height:130px;padding:24px 24px 24px 0;border-bottom:1px solid var(--line)}.challenge-item:nth-child(3n+2),.challenge-item:nth-child(3n){padding-left:24px;border-left:1px solid var(--line)}.challenge-number{color:var(--blue);font:12px/1.4 var(--sans);font-weight:750}.challenge-item h3{margin:0 0 8px;font-size:21px}.challenge-item p{margin:0;color:var(--muted);font-size:13px;line-height:1.6}
    .risk-section{background:var(--navy);color:#fff}.risk-section .section-head .eyebrow{color:#8db2ff}.risk-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.14)}.risk-item{min-height:230px;padding:26px;background:var(--navy)}.risk-item span{color:#8db2ff;font-size:12px;font-weight:750}.risk-item h3{margin:30px 0 10px;font-size:26px}.risk-item p{margin:0;color:rgba(255,255,255,.68);font-size:13px;line-height:1.65}
    .privacy-grid{display:grid;grid-template-columns:1.15fr .85fr;gap:48px}.privacy-grid h2{margin:0;font-size:clamp(34px,4vw,56px);line-height:1.1}.privacy-list{display:grid;gap:18px}.privacy-list p{margin:0;padding-bottom:18px;border-bottom:1px solid var(--line);color:var(--muted);line-height:1.7}
    .developer{background:#e7ebf1}.code-card{padding:24px;border-radius:8px;background:#172033;color:#dce7ff;overflow:auto}.code-card code{font:13px/1.75 "Cascadia Code",Consolas,monospace;white-space:pre}.developer-grid{display:grid;grid-template-columns:1fr 1fr;gap:48px;align-items:center}.developer-grid h2{margin:0 0 16px;font-size:clamp(34px,4vw,56px)}.developer-grid p{color:var(--muted);line-height:1.7}.site-footer{padding:36px 0;background:#0d1523;color:rgba(255,255,255,.62);font-size:12px}.footer-inner{width:min(1180px,calc(100% - 48px));margin:0 auto;display:flex;justify-content:space-between;gap:24px}
    @media (max-width:900px){.nav-links a:not(.nav-cta){display:none}.hero-copy>*{grid-column:1/8}.hero-signal{grid-column:9/13}.demo-grid,.privacy-grid,.developer-grid{grid-template-columns:1fr}.challenge-grid{grid-template-columns:1fr 1fr}.challenge-item:nth-child(n){padding:20px;border-left:0}.challenge-item:nth-child(even){border-left:1px solid var(--line)}.risk-grid{grid-template-columns:1fr 1fr}.section-head .eyebrow,.section-head h2{grid-column:1/-1}}
    @media (max-width:620px){:root{--banner-h:70px}.language-banner{gap:8px;justify-content:flex-start;flex-wrap:wrap}.language-banner span{flex:1 1 210px}.language-banner button{min-height:40px}.site-nav{padding:0 16px}.hero-copy,.section-inner,.footer-inner{width:calc(100% - 32px)}.hero{min-height:620px}.hero-copy{padding:64px 0 52px}.hero-copy>*{grid-column:1/-1}h1{font-size:50px}.hero-signal{grid-column:1/-1;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;padding:18px 0 0;border-left:0;border-top:1px solid rgba(255,255,255,.18)}.hero-signal-item{padding:0 10px 0 0;border-right:1px solid rgba(255,255,255,.12);border-bottom:0}.hero-signal-item:last-child{border-right:0}.hero-signal strong{font-size:14px}.section{padding:68px 0}.challenge-grid,.risk-grid{grid-template-columns:1fr}.challenge-item:nth-child(n){border-left:0}.demo-widget{min-height:220px;padding:24px 8px}.demo-widget oxygen-challenge{width:100%!important}.footer-inner{flex-direction:column}}
    @media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
  </style>
</head>
<body>
  <div class="language-banner hidden" id="language-banner" role="status">
    <span data-i18n="language.notice">检测到你的浏览器语言，可以选择中文或 English。</span>
    <div class="language-actions">
      <button type="button" data-language="zh" aria-pressed="false">中文</button>
      <button type="button" data-language="en" aria-pressed="false">English</button>
      <button type="button" class="language-close" id="language-close" aria-label="关闭">×</button>
    </div>
  </div>
  <nav class="site-nav" aria-label="主导航">
    <a class="brand" href="/">OxygenChallenge</a>
    <div class="nav-links">
      <a href="#challenges" data-i18n="nav.challenges">题型</a>
      <a href="#risk" data-i18n="nav.risk">风险体系</a>
      <a href="#developers" data-i18n="nav.developers">开发者</a>
      <a class="nav-cta" href="/captcha" data-i18n="nav.start">开始验证</a>
    </div>
  </nav>
  <header class="hero">
    <div class="hero-copy">
      <p class="eyebrow" data-i18n="hero.eyebrow">Human verification for the agent era</p>
      <h1 data-i18n-html="hero.title">验证行为，<br>不只看答案。</h1>
      <p data-i18n="hero.body">面向 Agent 与自动化流量的风险自适应验证平台。组合感知、动作、时序、设备与网络证据，为每一次 Challenge 生成可验证的风险上下文。</p>
      <div class="hero-actions">
        <a class="primary-button" href="/captcha" data-i18n="hero.start">体验随机挑战</a>
        <a class="secondary-button" href="#developers" data-i18n="hero.docs">查看接入</a>
      </div>
      <aside class="hero-signal" aria-label="验证信号">
        <span data-i18n="hero.signal.kicker">实时信号</span>
        <div class="hero-signal-item"><strong data-i18n="hero.signal.1">行为证据</strong><small data-i18n="hero.signal.1.body">指针 · 按键 · 时序</small></div>
        <div class="hero-signal-item"><strong data-i18n="hero.signal.2">设备上下文</strong><small data-i18n="hero.signal.2.body">UA · 平台 · 输入能力</small></div>
        <div class="hero-signal-item"><strong data-i18n="hero.signal.3">风险决策</strong><small data-i18n="hero.signal.3.body">动态题数与验证路径</small></div>
      </aside>
    </div>
  </header>
  <section class="section demo-section">
    <div class="section-inner demo-grid">
      <div class="demo-copy">
        <p class="eyebrow" data-i18n="demo.eyebrow">Live challenge</p>
        <h2 data-i18n="demo.title">真实产品，不是演示占位。</h2>
        <p data-i18n="demo.body">当前卡片直接连接 OxygenChallenge API。每次刷新都会重新签发一次性 Challenge，答案、题型与风险会话均只存在于服务端。</p>
        <span class="demo-note" data-i18n="demo.note">API-only · 一次性令牌 · 自动风险升级</span>
      </div>
      <div class="demo-widget"><oxygen-challenge sitekey="${demoSiteKey}" action="submit" risk="low" width="400"></oxygen-challenge></div>
    </div>
  </section>
  <section class="section" id="challenges">
    <div class="section-inner">
      <div class="section-head"><p class="eyebrow" data-i18n="challenge.kicker">Challenge library</p><h2 data-i18n="challenge.heading">十五种题型，落在同一风险会话。</h2></div>
      <div class="challenge-grid">${challengeCards}</div>
    </div>
  </section>
  <section class="section risk-section" id="risk">
    <div class="section-inner">
      <div class="section-head"><p class="eyebrow" data-i18n="risk.kicker">Adaptive risk</p><h2 data-i18n-html="risk.heading">风险决定步骤，<br>而不是固定弹题。</h2></div>
      <div class="risk-grid">
        <article class="risk-item"><span>01 / IDENTITY</span><h3 data-i18n="risk.1.title">请求画像</h3><p data-i18n="risk.1.body">User-Agent、Client Hints、平台、系统版本、语言和 Fetch Metadata。</p></article>
        <article class="risk-item"><span>02 / NETWORK</span><h3 data-i18n="risk.2.title">网络上下文</h3><p data-i18n="risk.2.body">Cloudflare IP、国家、请求频次、User-Agent 轮换与跨境不一致。</p></article>
        <article class="risk-item"><span>03 / SESSION</span><h3 data-i18n="risk.3.title">会话预算</h3><p data-i18n="risk.3.body">基础 3 步，风险升级为 4 / 6 / 8 步，中间步骤不签发令牌。</p></article>
        <article class="risk-item"><span>04 / EVIDENCE</span><h3 data-i18n="risk.4.title">过程证据</h3><p data-i18n="risk.4.body">指针、按键、时序、视频骨骼、设备端声学特征与 Turnstile。</p></article>
      </div>
    </div>
  </section>
  <section class="section">
    <div class="section-inner privacy-grid">
      <h2 data-i18n="privacy.heading">敏感数据尽量不离开设备。</h2>
      <div class="privacy-list">
        <p data-i18n="privacy.1">摄像头帧在本地完成 MediaPipe 手部骨骼识别，只提交动作标签和持续时间。</p>
        <p data-i18n="privacy.2">麦克风在本地提取频段与能量特征，原始音频不上传；服务端比较同一词段多遍朗读的非完全一致性。</p>
        <p data-i18n="privacy.3">拒绝摄像头或麦克风权限时，始终保留反色遮挡与听觉无障碍替代。</p>
      </div>
    </div>
  </section>
  <section class="section developer" id="developers">
    <div class="section-inner developer-grid">
      <div>
        <p class="eyebrow" data-i18n="developer.kicker">For builders</p>
        <h2 data-i18n="developer.heading">一次嵌入，服务端最终确认。</h2>
        <p data-i18n="developer.body">Web Component 自动注入一次性 token；客户后端调用 siteverify 消费 token。开放平台应用使用 OxygenAccount 登录后创建与管理。</p>
        <a class="primary-button" href="/platform" data-i18n="developer.button">打开开放平台</a>
      </div>
      <pre class="code-card"><code>&lt;script src="${origin}/widget.js" defer&gt;&lt;/script&gt;

&lt;oxygen-challenge
  sitekey="oc_your_site_key"
  action="signup"
  risk="medium"
&gt;&lt;/oxygen-challenge&gt;</code></pre>
    </div>
  </section>
  <footer class="site-footer">
    <div class="footer-inner">
      <span data-i18n="footer.brand">OxygenChallenge · Human verification for the agent era</span>
      <span><a href="/privacy-policy" data-i18n="footer.privacy">隐私政策</a> · <a href="/user-agreement" data-i18n="footer.terms">用户条款</a> · <a href="/v1/meta">API Meta</a> · <a href="https://github.com/OxygenAILab/OxygenChallenge">Private source</a></span>
    </div>
  </footer>
  <script src="${origin}/widget.js?v=26.0.0-alpha.7" defer></script>
  <script>
    (() => {
      const translations = ${JSON.stringify(translations)};
      const root = document.documentElement;
      const banner = document.querySelector("#language-banner");
      const close = document.querySelector("#language-close");
      const saved = localStorage.getItem("oxygenchallenge-language");
      const detected = (navigator.language || "zh").toLowerCase().startsWith("zh") ? "zh" : "en";
      const language = saved === "zh" || saved === "en" ? saved : detected;
      const dismissed = localStorage.getItem("oxygenchallenge-language-banner") === "1";
      const apply = (next) => {
        const dictionary = translations[next] || translations.zh;
        root.dataset.lang = next;
        root.lang = next === "zh" ? "zh-CN" : "en";
        document.querySelectorAll("[data-i18n]").forEach((element) => {
          const value = dictionary[element.dataset.i18n];
          if (value) element.textContent = value;
        });
        document.querySelectorAll("[data-i18n-html]").forEach((element) => {
          const value = dictionary[element.dataset.i18nHtml];
          if (value) element.innerHTML = value;
        });
        document.querySelectorAll("[data-language]").forEach((button) => {
          button.setAttribute("aria-pressed", String(button.dataset.language === next));
        });
      };
      apply(language);
      if (!dismissed) {
        banner?.classList.remove("hidden");
        document.body.classList.add("has-language-banner");
      }
      document.querySelectorAll("[data-language]").forEach((button) => {
        button.addEventListener("click", () => {
          const next = button.dataset.language;
          if (next !== "zh" && next !== "en") return;
          localStorage.setItem("oxygenchallenge-language", next);
          apply(next);
          banner?.classList.add("hidden");
          document.body.classList.remove("has-language-banner");
        });
      });
      close?.addEventListener("click", () => {
        localStorage.setItem("oxygenchallenge-language-banner", "1");
        banner?.classList.add("hidden");
        document.body.classList.remove("has-language-banner");
      });
    })();
  </script>
</body>
</html>`;
}
