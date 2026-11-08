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
  languagePriority?: string;
  sections: LegalSection[];
};

const DOCUMENTS = {
  zh: {
    privacy: {
      title: "隐私政策",
      summary:
        "本政策说明 OxygenAI Tech., SG 运营的 OxygenChallenge 如何在下发验证挑战、评估请求风险、管理开放平台和处理音视频权限时使用信息。",
      updated: "生效日期：2026 年 11 月 8 日",
      languagePriority:
        "英文版本为具有法律效力的权威文本；中文版本用于阅读便利。若两者不一致，以英文版本为准。",
      sections: [
        {
          title: "1. 我们处理的信息",
          bullets: [
            "交互与验证信息：挑战类型和步骤、答案或选择、鼠标或触摸轨迹、按键状态、覆盖与停留时长、交易模拟记录、验证结果和时间戳。",
            "设备与请求信息：浏览器类型、User-Agent、Client Hints、操作系统版本、语言、屏幕与输入能力、公网 IP、请求时间、来源页面、设备和能力一致性信号。",
            "安全与风险信息：Cloudflare 提供的网络与国家/地区元数据、请求频率、自动化特征、内部风险评分、异常轮换信号和验证事件日志。",
            "OxygenAccount 开发者资料：登录开放平台时，依据已授权 scope 接收账号标识、昵称、头像、邮箱以及必要的账户类型判断结果。",
            "应用与配置信息：应用名称、site key、允许的 origin/action、加密保存的 secret、开发 IP 免验证规则及到期时间。",
            "支持与沟通信息：你主动提供的故障描述、法律请求、滥用举报、邮件和相关附件。",
          ],
        },
        {
          title: "2. 摄像头与麦克风",
          paragraphs: [
            "摄像头或麦克风只会在你明确授予浏览器权限并主动点击开始后启用。我们不会在后台静默开启设备，也不会把原始视频帧或原始录音上传到 OxygenChallenge 后端。",
            "手部挑战在浏览器本地通过 MediaPipe 提取手部关键点、动作标签和持续时间。我们不以摄像头进行人脸识别、身份核验、情绪识别或生物特征建档。",
            "朗读挑战在浏览器本地提取频段能量、波形统计和时间窗口等低维声学特征。服务端仅接收完成一致性校验所需的特征、词语窗口和时序数据。",
            "拒绝设备权限时，平台可以根据设备能力和风险策略提供替代挑战；部分题目可能因此不可用。请勿在摄像头前展示身份证件、屏幕秘密或其他敏感内容。",
          ],
        },
        {
          title: "3. 使用目的与法律依据",
          bullets: [
            "履行服务合同或应你请求采取措施：创建和验证挑战、签发令牌、提供开放平台、维护应用配置和处理支持请求。",
            "基于正当利益：防止重放、自动化、批量攻击、账户滥用和服务故障，维护网络与接口安全并改进验证质量。",
            "基于同意：访问摄像头或麦克风，以及在适用法律要求时使用非必要本地存储。你可以拒绝或撤回同意，但不影响此前处理的合法性。",
            "履行法律义务：回应有效法律请求、处理争议、保留必要审计记录并执行适用平台的合规要求。",
          ],
        },
        {
          title: "4. 共享与披露",
          paragraphs: [
            "我们不会出售个人信息，也不会为跨情境行为广告而共享个人信息。我们不运行广告网络，不使用验证数据建立跨站营销画像。",
            "为提供托管、网络、安全和身份服务，我们可能让 Cloudflare、OxygenAccount 及服务器/网络基础设施运营方按最小必要原则处理数据。选择 Cloudflare Turnstile 题型时，Turnstile 还会按其自身条款和隐私政策处理必要的浏览器与网络信息。",
            "客户站点或其后端只接收验证结果、一次性令牌、site key、action 和有限会话信息，不会从 OxygenChallenge 接收原始摄像头或麦克风内容。",
            "在收到有效法律程序、调查滥用、处理安全事件、保护用户或服务权利所必要时，我们可能披露最小必要信息。",
          ],
        },
        {
          title: "5. 保存期限",
          paragraphs: [
            "挑战状态保存在短期进程内存中，并会在成功完成、失败次数耗尽或过期后移除。验证令牌通常在两分钟内有效；令牌消费记录仅保留防止重放所需的时间。",
            "开放平台应用、origin/action 配置和开发 IP 免验证规则会保留到你删除应用、规则到期、账户终止或为安全与法律目的需要保留的期间。开发 IP 规则最长 179 分钟。",
            "安全日志、限流和审计记录按运维与安全所需保留，并受基础设施日志轮转设置约束。发生安全事件、争议或法律保留义务时，相关记录可能保留更长时间。",
            "我们不会仅为未来通用 AI 训练而保留验证挑战答案或原始音视频内容。",
          ],
        },
        {
          title: "6. 安全措施与事件通知",
          paragraphs: [
            "我们采用传输加密、访问控制、最小权限、短期令牌、secret 加密存储和服务端来源校验等措施。没有任何互联网服务能够保证绝对安全。",
            "如发生影响你权益的安全事件，我们会按适用法律采取缓解、调查和通知措施，并在需要时通知受影响的客户或监管机构。",
          ],
        },
        {
          title: "7. 你的权利与选择",
          paragraphs: [
            "根据你所在地区的法律，你可能有权请求访问、更正、删除、限制或反对处理，获取可携带副本，撤回授权，或拒绝某些处理。开发者可以在 OxygenAccount 或开放平台撤回授权。",
            "为保护账户与验证完整性，我们可能先核实请求。部分挑战日志、令牌消费记录、滥用证据或法律保留材料可能因安全、争议或合规义务不能立即删除。",
            "新加坡用户可向 Personal Data Protection Commission (PDPC) 投诉；其他地区用户可联系当地数据保护机构。我们不会因你行使合法隐私权利而歧视你。",
          ],
        },
        {
          title: "8. 跨境传输",
          paragraphs: [
            "OxygenChallenge 当前服务器与运营支持可能位于香港或其他服务区域，Cloudflare、OxygenAccount 和基础设施供应商也可能在全球范围内处理数据。因此，信息可能在你所在国家或地区以外处理。",
            "在法律要求时，我们会使用合同、访问控制、最小化和其他适当保障措施处理跨境传输。不同地区的法律保护水平可能不同。",
          ],
        },
        {
          title: "9. Cookie 与本地存储",
          paragraphs: [
            "开放平台使用严格必要的 HttpOnly 会话 Cookie 和 CSRF 防护。语言选择保存在浏览器 localStorage。Cloudflare 可能为安全、路由和 Turnstile 功能设置必要的 Cookie 或类似技术。",
            "这些技术不用于跨站广告画像。客户站点应在其自身 Cookie 与隐私声明中说明其页面所设置的任何额外技术。",
          ],
        },
        {
          title: "10. 儿童与第三方网站",
          paragraphs: [
            "OxygenChallenge 面向开发者与一般互联网用户，不面向未满 13 周岁的儿童；在 EEA/英国等地区，如适用法律要求更高年龄，则以该年龄为准。我们不会有意收集儿童资料。",
            "当你在客户网站遇到 OxygenChallenge 组件时，该客户网站是与你关系的主要运营者，其自身隐私政策也适用。客户应提供必要通知，并在法律要求时为摄像头、麦克风或其他处理取得有效同意。",
          ],
        },
        {
          title: "11. 风险评分与限制",
          paragraphs: [
            "风险评分用于选择挑战类型、数量、超时和拒绝策略，不用于决定信贷、就业、住房、医疗、保险、教育录取、司法或其他产生法律或类似重大影响的资格。客户不得把验证结果作为此类决定的唯一依据。",
            "我们不把验证数据用于跨站行为广告画像，也不声称验证结果能够证明真实身份、年龄、意图或交易安全。",
          ],
        },
        {
          title: "12. 联系方式",
          paragraphs: [
            "隐私问题、数据主体权利请求和滥用报告可发送至 contact@oxygenai.top。我们会在核实请求后按适用法律处理。",
          ],
        },
      ],
    },
    terms: {
      title: "用户协议",
      summary:
        "本协议约束 OxygenAI Tech., SG 运营的 OxygenChallenge 网站、验证组件、API、开放平台及开发者工具。访问或使用服务即表示同意本协议。",
      updated: "生效日期：2026 年 11 月 8 日",
      languagePriority:
        "英文版本为具有法律效力的权威文本；中文版本用于阅读便利。若两者不一致，以英文版本为准。",
      sections: [
        {
          title: "1. 服务与运营者",
          paragraphs: [
            "OxygenChallenge 提供风险自适应挑战、一次性验证令牌、可嵌入组件、JSON API、文档和 OxygenAccount 开放平台。验证结果用于辅助判断请求是否更可能由真实用户完成，是概率性安全信号。",
            "服务不提供身份认证、年龄核验、征信、背景调查、法律、医疗、金融或其他专业结论，也不保证下游账户、交易或内容绝对安全。",
          ],
        },
        {
          title: "2. 资格与终端用户",
          paragraphs: [
            "你必须具备签订有约束力协议所需的法律能力。若代表组织使用服务，你声明有权约束该组织。客户负责确保其网站、应用和验证流程符合当地法律、年龄限制、无障碍要求和用户告知义务。",
          ],
        },
        {
          title: "3. 账户、应用与凭据",
          paragraphs: [
            "开放平台通过 OxygenAccount 登录。你对应账户、应用、允许 origin/action、订阅或配置变更以及所有凭据使用负责。site secret 只能保存在服务端，不得出现在浏览器、公开仓库、日志、截图或客户端安装包中。",
            "发现账户被盗、secret 泄露、异常调用或未授权配置时，应立即轮换 secret、停用受影响应用并联系 contact@oxygenai.top。轮换后旧 secret 会立即失效。",
          ],
        },
        {
          title: "4. 客户集成责任",
          bullets: [
            "在需要的页面准确嵌入组件，验证服务端 token，并校验 success、siteKey、action、过期和一次性消费结果。",
            "不得仅依赖浏览器传来的 verified 字段，不得自行伪造、重放或跨 action/site key 复用 token。",
            "根据业务风险设计验证触发和二次验证，不得把 CAPTCHA 作为高影响决策的唯一证据。",
            "应为摄像头、麦克风、Cookie、localStorage 和其他数据处理提供适用法律要求的通知与同意。",
            "应遵守 API 版本、弃用、速率限制、origin 白名单和无障碍要求，并为终端用户提供可用的替代验证路径。",
          ],
        },
        {
          title: "5. 可接受使用",
          bullets: [
            "不得绕过、破解、攻击、压力测试、批量自动化求解、转售、出租、白标或以其他方式滥用验证服务。",
            "不得使用服务实施欺诈、骚扰、垃圾信息、违法内容分发、账户接管、金融犯罪或侵害第三方权利。",
            "不得伪造 origin/referer、盗用密钥、规避速率限制、轮换 IP/UA 逃避风控、探测未公开接口或干扰其他客户。",
            "不得使用服务收集儿童数据、推断敏感属性、建立跨站广告画像或作出信贷、就业、住房、医疗、保险、教育录取、司法等高风险决定。",
            "不得将开发 IP 免验证、测试注入、固定题型或其他开发能力用于生产流量、绕过付费限制或规避人工验证。",
          ],
        },
        {
          title: "6. 风险信号与自动化判定",
          paragraphs: [
            "服务可能分析设备能力、网络元数据、IP 频率、UA/Client Hints、语言、交互时序和行为证据，以调整挑战数量、题型、超时、换题和拒绝策略。",
            "自动化流量、异常代理、重复请求、设备能力不一致、伪造来源或可疑媒体证据可能导致更多挑战或直接拒绝。结果可能含有假阳性和假阴性；客户应提供纠错、申诉或人工复核渠道。",
          ],
        },
        {
          title: "7. 令牌、可用性与安全",
          paragraphs: [
            "验证令牌短时有效、一次性并绑定 site key 与 action，客户不得缓存、转售或跨业务复用。我们采用商业合理措施维护服务，但不保证无中断、零错误或识别所有自动化流量。",
            "维护、网络故障、Cloudflare/OxygenAccount 等第三方服务异常、容量限制和不可抗力可能造成延迟或暂停。请为客户流程设计失败关闭、重试和降级策略。",
          ],
        },
        {
          title: "8. 开发 IP 免验证与测试功能",
          paragraphs: [
            "开放平台允许为精确 IP 配置最长 179 分钟的免验证规则，仅供开发、集成和自动化验收使用。它不是生产白名单，不代表生产流量已获人工验证。",
            "你应限制规则范围、及时删除不再需要的规则，并防止开发环境凭据或配置泄露。滥用免验证、固定题型、test 模式或无障碍替代规避安全控制属于重大违约。",
          ],
        },
        {
          title: "9. 变更、实验功能与弃用",
          paragraphs: [
            "我们可能更新挑战、风控策略、文档、API、SDK、限流和本协议。重大变更会通过官网、开放平台、文档或发布说明通知。标注 alpha、beta、preview 或实验性的功能可能变更或停止。",
            "我们会按合理方式处理 API 版本和弃用流程，但客户有责任持续关注文档并在通知期内完成迁移。",
          ],
        },
        {
          title: "10. 知识产权",
          paragraphs: [
            "OxygenChallenge 的软件、挑战设计、视觉、文档、商标、名称、服务内容和接口组织受适用法律保护。除明确书面授权或开源许可证允许外，不得复制、自建部署、反编译、逆向工程或创建实质性替代服务。",
            "第三方开源组件适用其各自许可证。你保留自己应用、内容和数据中的权利，并授予我们为提供、保护和改进服务所需的有限处理许可。",
          ],
        },
        {
          title: "11. 隐私与设备权限",
          paragraphs: [
            "我们的隐私政策说明验证数据、账户资料、摄像头/麦克风和日志处理方式，并构成本协议的一部分。摄像头和麦克风必须由终端用户主动授权。",
            "客户不得在未告知的情况下开启设备、收集超出验证所需的内容，或诱导用户展示身份证件、密码、财务信息或其他敏感材料。",
          ],
        },
        {
          title: "12. 暂停与终止",
          paragraphs: [
            "如发生重大违约、凭据滥用、违法风险、危害服务安全、规避限流或对第三方造成风险，我们可以限制、暂停或终止访问，并在适当情况下通知。",
            "终止后你应停止调用 API、删除 secret、关闭应用并移除嵌入组件。安全、法律、计费和争议相关记录可按隐私政策继续保留。",
          ],
        },
        {
          title: "13. 免责声明",
          paragraphs: [
            "在适用法律允许的最大范围内，服务按“现状”和“可用”状态提供。我们不提供适销性、特定用途、不侵权、持续可用或适用于高风险决策的明示或默示保证。",
            "客户对自身网站、用户告知、权限同意、无障碍、下游风控、数据保护和法律合规承担主要责任。",
          ],
        },
        {
          title: "14. 责任限制与赔偿",
          paragraphs: [
            "在适用法律允许的最大范围内，OxygenAI Tech., SG 不对间接、附带、特殊、惩罚性或衍生损失，利润、收入、数据、商誉或业务中断损失负责。",
            "任何情形下，本协议项下全部累计责任不超过你在索赔发生前十二个月实际支付的服务费用；如该期间未付费，则不超过新加坡元 100 元或适用法律允许的最低金额。",
            "如因你的应用、内容、配置、设备权限、隐私告知、违法使用、凭据泄露或违反本协议导致第三方索赔，你应在我们合理要求范围内进行抗辩和赔偿。",
          ],
        },
        {
          title: "15. 适用法律与争议解决",
          paragraphs: [
            "本协议受新加坡共和国法律管辖，排除冲突法规则和《联合国国际货物销售合同公约》。",
            "争议应先进行善意协商。协商不成，提交新加坡国际仲裁中心 SIAC 按其届时有效规则仲裁；仲裁地为新加坡，仲裁语言为英文。法律强制赋予消费者的不可放弃权利不受本条限制。",
          ],
        },
        {
          title: "16. 联系方式",
          paragraphs: [
            "协议、滥用、安全和法律通知可发送至 contact@oxygenai.top。请勿在邮件中发送 secret、验证令牌、原始录音或无关敏感信息。",
          ],
        },
      ],
    },
  },
  en: {
    privacy: {
      title: "Privacy Policy",
      summary:
        "This Policy explains how OxygenChallenge, operated by OxygenAI Tech., SG, handles information when issuing challenges, assessing request risk, operating the Open Platform, and using camera or microphone permissions.",
      updated: "Effective date: November 8, 2026",
      languagePriority:
        "The English version is the authoritative legal text. The Chinese translation is provided for convenience; if they conflict, the English version controls.",
      sections: [
        {
          title: "1. Information we process",
          bullets: [
            "Interaction and verification data: challenge type and step, answers or selections, pointer or touch paths, key state, coverage and dwell duration, simulated trade records, verification results, and timestamps.",
            "Device and request data: browser and User-Agent, Client Hints, operating-system version, language, screen and input capabilities, public IP address, request time, referring page, and device-capability consistency signals.",
            "Security and risk data: network and country/region metadata supplied by Cloudflare, request frequency, automation indicators, internal risk scores, abnormal rotation signals, and verification event logs.",
            "OxygenAccount developer data: when you sign in to the Open Platform, the account identifier, display name, avatar, email, and necessary account-type determination permitted by approved scopes.",
            "Application and configuration data: application name, site key, allowed origins/actions, encrypted site secret, development IP bypass rules, and expiration times.",
            "Support and communications data: fault descriptions, legal requests, abuse reports, emails, and attachments you voluntarily provide.",
          ],
        },
        {
          title: "2. Camera and microphone",
          paragraphs: [
            "Camera or microphone access starts only after you explicitly grant browser permission and actively choose to begin. We do not activate devices silently in the background or upload raw video frames or raw audio recordings to OxygenChallenge servers.",
            "Hand challenges use MediaPipe locally in your browser to derive hand landmarks, gesture labels, and duration. We do not use the camera for facial recognition, identity verification, emotion inference, or biometric enrollment.",
            "Speech challenges extract low-dimensional band-energy, waveform-statistic, and timing features locally. The server receives only derived features, target-word windows, and timing required for consistency checks.",
            "If you deny device permission, an alternative challenge may be offered based on device capability and risk policy; some challenge types may become unavailable. Do not present identity documents, screen secrets, or other sensitive content to a camera challenge.",
          ],
        },
        {
          title: "3. Purposes and legal bases",
          bullets: [
            "Contract or steps requested by you: create and verify challenges, issue tokens, operate the Open Platform, maintain application configuration, and provide support.",
            "Legitimate interests: prevent replay, automation, bulk attacks, account abuse, and service failure; protect network and API security; and improve verification quality.",
            "Consent: access camera or microphone and use non-essential local storage where consent is legally required. You may refuse or withdraw consent without affecting prior lawful processing.",
            "Legal obligation: respond to valid legal process, handle disputes, retain necessary audit records, and comply with applicable platform obligations.",
          ],
        },
        {
          title: "4. Sharing and disclosure",
          paragraphs: [
            "We do not sell personal information and do not share it for cross-context behavioral advertising. We do not operate an advertising network or build cross-site marketing profiles from verification data.",
            "We may use Cloudflare, OxygenAccount, and hosting or network infrastructure operators as service providers processing the minimum data necessary. If a Cloudflare Turnstile challenge is selected, Turnstile also processes necessary browser and network information under its own terms and privacy policy.",
            "Customer sites and backends receive verification results, one-time tokens, site key, action, and limited session information. They do not receive raw camera or microphone content from OxygenChallenge.",
            "We may disclose minimum necessary information when required by valid legal process, to investigate abuse, handle a security incident, or protect users, the service, or legal rights.",
          ],
        },
        {
          title: "5. Retention",
          paragraphs: [
            "Challenge state is held in short-lived process memory and is removed after successful completion, exhaustion of attempts, or expiration. Verification tokens generally remain valid for two minutes, and replay records are retained only as long as needed to prevent reuse.",
            "Open Platform applications, origin/action configuration, and development IP bypass rules remain until you delete the application, a rule expires, the account is terminated, or security or legal needs require retention. Development IP rules may not exceed 179 minutes.",
            "Security, rate-limit, and audit logs are kept as needed for operations and security and are subject to infrastructure log rotation. Records may be retained longer during an incident, dispute, or legal hold.",
            "We do not retain challenge answers or raw audio/video merely for general future AI training.",
          ],
        },
        {
          title: "6. Security and incident notification",
          paragraphs: [
            "We use transport encryption, access controls, least privilege, short-lived tokens, encrypted secret storage, and server-side origin validation. No internet service can guarantee absolute security.",
            "If a security event affects your rights, we will take mitigation and investigation measures and provide notifications as required by applicable law.",
          ],
        },
        {
          title: "7. Your rights and choices",
          paragraphs: [
            "Depending on your location, you may have rights to access, correct, delete, restrict, or object to processing, obtain a portable copy, withdraw consent, or opt out of certain processing. Developers may revoke OxygenAccount or Open Platform authorization.",
            "We may verify a request to protect accounts and verification integrity. Some challenge logs, token-replay records, abuse evidence, or legally held materials may not be immediately deletable because of security, dispute, or compliance obligations.",
            "Singapore users may complain to the Personal Data Protection Commission (PDPC); users elsewhere may contact their local data-protection authority. We will not discriminate against you for exercising applicable privacy rights.",
          ],
        },
        {
          title: "8. International transfers",
          paragraphs: [
            "OxygenChallenge currently uses servers and operational support that may be located in Hong Kong or other service regions. Cloudflare, OxygenAccount, and infrastructure providers may process information globally. Information may therefore be processed outside your country or region.",
            "Where required, we use contractual, access-control, minimization, and other appropriate safeguards for international transfers. Local legal protections may differ.",
          ],
        },
        {
          title: "9. Cookies and local storage",
          paragraphs: [
            "The Open Platform uses a strictly necessary HttpOnly session cookie and CSRF protection. Language selection is stored in browser localStorage. Cloudflare may set necessary cookies or similar technologies for security, routing, and Turnstile.",
            "These technologies are not used for cross-site advertising profiles. Customer sites must disclose any additional technologies they deploy.",
          ],
        },
        {
          title: "10. Children and third-party sites",
          paragraphs: [
            "OxygenChallenge is intended for developers and general internet users and is not directed to children under 13. Where EEA/UK or other law sets a higher age, that age applies. We do not knowingly collect children's data.",
            "When you encounter an OxygenChallenge widget on a customer site, that customer is the primary operator of its relationship with you and its privacy policy also applies. Customers must provide notices and obtain valid consent for camera, microphone, or other processing where required.",
          ],
        },
        {
          title: "11. Risk scoring and limitations",
          paragraphs: [
            "Risk scores select challenge type, count, timeout, and rejection strategy. They are not used to determine credit, employment, housing, healthcare, insurance, education admission, judicial outcomes, or other decisions producing legal or similarly significant effects. Customers must not use verification as the sole basis for such decisions.",
            "We do not use verification data for cross-site behavioral advertising. A verification result does not prove identity, age, intent, or transaction safety.",
          ],
        },
        {
          title: "12. Contact",
          paragraphs: [
            "Send privacy questions, data-subject requests, and abuse reports to contact@oxygenai.top. We will handle verified requests under applicable law.",
          ],
        },
      ],
    },
    terms: {
      title: "User Agreement",
      summary:
        "This Agreement governs the OxygenChallenge website, verification widget, APIs, Open Platform, and developer tools operated by OxygenAI Tech., SG. Accessing or using the Service constitutes acceptance.",
      updated: "Effective date: November 8, 2026",
      languagePriority:
        "The English version is the authoritative legal text. The Chinese translation is provided for convenience; if they conflict, the English version controls.",
      sections: [
        {
          title: "1. Service and operator",
          paragraphs: [
            "OxygenChallenge provides risk-adaptive challenges, one-time verification tokens, embeddable components, a JSON API, documentation, and the OxygenAccount Open Platform. A verification result is a probabilistic signal that a request is more likely to have been completed by a real user.",
            "The Service does not provide identity authentication, age verification, credit reporting, background checks, legal, medical, financial, or other professional conclusions, and does not guarantee that a downstream account, transaction, or content is safe.",
          ],
        },
        {
          title: "2. Eligibility and end users",
          paragraphs: [
            "You must have legal capacity to enter a binding agreement. If you use the Service for an organization, you represent that you are authorized to bind it. Customers are responsible for making their websites, applications, and verification flows comply with local law, age limits, accessibility requirements, and user-notice obligations.",
          ],
        },
        {
          title: "3. Accounts, applications, and credentials",
          paragraphs: [
            "The Open Platform uses OxygenAccount sign-in. You are responsible for your account, applications, allowed origins/actions, subscription or configuration changes, and all credential use. Site secrets must remain server-side and must not appear in browsers, public repositories, logs, screenshots, or client bundles.",
            "If you suspect account compromise, secret leakage, abnormal calls, or unauthorized configuration, promptly rotate the secret, disable affected applications, and contact us at contact@oxygenai.top. A rotated secret invalidates the previous secret immediately.",
          ],
        },
        {
          title: "4. Customer integration responsibilities",
          bullets: [
            "Embed the component only on intended pages, verify tokens on your server, and check success, siteKey, action, expiration, and one-time consumption.",
            "Do not trust a browser-supplied verified field, forge tokens, replay tokens, or reuse a token across actions or site keys.",
            "Design verification triggers and secondary checks for your business risk; do not use CAPTCHA as the sole evidence for high-impact decisions.",
            "Provide notices and obtain consent for camera, microphone, cookies, localStorage, and other processing where required by law.",
            "Follow API versions, deprecation notices, rate limits, origin allowlists, and accessibility requirements, and provide a usable alternative verification path.",
          ],
        },
        {
          title: "5. Acceptable use",
          bullets: [
            "Do not bypass, reverse-solve, attack, stress-test, bulk-automate, resell, rent, white-label, or otherwise abuse the verification service.",
            "Do not use the Service for fraud, harassment, spam, illegal content, account takeover, financial crime, or infringement of third-party rights.",
            "Do not forge origins or referrers, steal keys, evade rate limits, rotate IPs or user agents to evade risk controls, probe non-public endpoints, or interfere with other customers.",
            "Do not use the Service to collect children's data, infer sensitive attributes, build cross-site advertising profiles, or make credit, employment, housing, healthcare, insurance, education-admission, judicial, or other high-risk decisions.",
            "Do not use development IP bypasses, test instrumentation, pinned challenge types, or other development capabilities for production traffic, quota evasion, or circumventing human verification.",
          ],
        },
        {
          title: "6. Risk signals and automated assessment",
          paragraphs: [
            "The Service may analyze device capability, network metadata, IP frequency, user agent and Client Hints, language, interaction timing, and behavioral evidence to adjust challenge count, type, timeout, swapping, and rejection strategy.",
            "Automation, abnormal proxies, repeated requests, inconsistent device capability, forged origins, or suspicious media evidence may cause additional challenges or rejection. Results may contain false positives and false negatives; Customers must provide correction, appeal, or human-review paths appropriate to their use case.",
          ],
        },
        {
          title: "7. Tokens, availability, and security",
          paragraphs: [
            "Verification tokens are short-lived, single-use, and bound to a site key and action. Customers must not cache, resell, or reuse them across business flows. We use commercially reasonable measures to maintain the Service but do not guarantee uninterrupted, error-free, or complete detection of automated traffic.",
            "Maintenance, network failures, Cloudflare/OxygenAccount or other provider outages, capacity limits, and force majeure may cause delay or suspension. Customers should design fail-closed, retry, and degradation behavior appropriate to their flows.",
          ],
        },
        {
          title: "8. Development IP bypass and test features",
          paragraphs: [
            "The Open Platform allows exact-IP bypass rules for at most 179 minutes, solely for development, integration, and automated acceptance testing. A bypass is not a production allowlist and does not mean production traffic has been verified by a human.",
            "You must narrow rules, remove them when no longer needed, and protect development credentials and configuration. Abusing bypasses, pinned challenge types, test mode, or accessibility alternatives to evade security controls is a material violation.",
          ],
        },
        {
          title: "9. Changes, experimental features, and deprecation",
          paragraphs: [
            "We may update challenges, risk policies, documentation, APIs, SDKs, rate limits, and this Agreement. Material changes will be published on the website, Open Platform, documentation, or release notes. Features labeled alpha, beta, preview, or experimental may change or be discontinued.",
            "We will apply reasonable API versioning and deprecation processes, but Customers must monitor documentation and complete migrations within notice periods.",
          ],
        },
        {
          title: "10. Intellectual property",
          paragraphs: [
            "The OxygenChallenge software, challenge designs, visual design, documentation, trademarks, names, service content, and interface organization are protected by applicable law. Except as expressly authorized or permitted by an open-source license, you may not copy, self-host, decompile, reverse-engineer, or create a substantially competing service.",
            "Third-party open-source components remain governed by their licenses. You retain rights in your application, content, and data and grant us a limited license to process them as needed to provide, protect, and improve the Service.",
          ],
        },
        {
          title: "11. Privacy and device permissions",
          paragraphs: [
            "Our Privacy Policy explains verification data, account information, camera/microphone processing, and logs, and forms part of this Agreement. Camera and microphone access require an end user's active permission.",
            "Customers must not activate devices without notice, collect content beyond verification needs, or induce users to display identity documents, passwords, financial information, or other sensitive materials.",
          ],
        },
        {
          title: "12. Suspension and termination",
          paragraphs: [
            "We may restrict, suspend, or terminate access for material breach, credential abuse, unlawful risk, security harm, rate-limit evasion, or risk to third parties, with notice where appropriate.",
            "After termination, you must stop API calls, delete secrets, disable applications, and remove embedded components. Security, legal, billing, and dispute records may be retained under the Privacy Policy.",
          ],
        },
        {
          title: "13. Disclaimer",
          paragraphs: [
            "To the maximum extent permitted by law, the Service is provided as is and as available. We disclaim express or implied warranties of merchantability, fitness for a particular purpose, non-infringement, continuous availability, or suitability for high-risk decisions.",
            "Customers are primarily responsible for their websites, user notices, permission consent, accessibility, downstream risk controls, data protection, and legal compliance.",
          ],
        },
        {
          title: "14. Limitation of liability and indemnity",
          paragraphs: [
            "To the maximum extent permitted by law, OxygenAI Tech., SG is not liable for indirect, incidental, special, punitive, or consequential loss, or for lost profits, revenue, data, goodwill, or business interruption.",
            "Our aggregate liability under this Agreement will not exceed the service fees you actually paid during the twelve months preceding the claim; if no fees were paid, it will not exceed SGD 100 or the minimum amount permitted by applicable law.",
            "If a third-party claim arises from your application, content, configuration, device permissions, privacy notices, unlawful use, credential leakage, or breach of this Agreement, you will defend and indemnify us as reasonably requested.",
          ],
        },
        {
          title: "15. Governing law and dispute resolution",
          paragraphs: [
            "This Agreement is governed by the laws of the Republic of Singapore, excluding conflict-of-law rules and the UN Convention on Contracts for the International Sale of Goods.",
            "Disputes will first be addressed through good-faith negotiation. If unresolved, they will be submitted to arbitration administered by the Singapore International Arbitration Centre (SIAC) under its then-current rules. The seat is Singapore and the language is English. Mandatory consumer rights that cannot be waived remain unaffected.",
          ],
        },
        {
          title: "16. Contact",
          paragraphs: [
            "Send agreement, abuse, security, and legal notices to contact@oxygenai.top. Do not send secrets, verification tokens, raw audio, or unrelated sensitive information by email.",
          ],
        },
      ],
    },
  },
} satisfies Record<"zh" | "en", Record<LegalKind, LegalDocument>>;

function sectionsHtml(document: LegalDocument): string {
  return document.sections
    .map(
      (section, index) => `
        <section id="section-${index + 1}">
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
    main{width:min(960px,calc(100% - 40px));margin:0 auto;padding:64px 0 88px}.mast{border-bottom:1px solid var(--line);padding-bottom:32px}.kicker{margin:0 0 12px;color:var(--blue);font-size:12px;font-weight:750}.mast h1{margin:0;font:700 clamp(42px,7vw,72px)/1 var(--serif);letter-spacing:-.02em}.summary{max-width:720px;margin:20px 0 0;color:var(--muted);font-size:17px;line-height:1.8}.priority{max-width:720px;margin:18px 0 0;padding:12px 14px;border-left:3px solid var(--blue);background:#eef4ff;color:#354967;font-size:13px;line-height:1.7}.updated{margin:16px 0 0;color:var(--muted);font-size:12px}
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
    <header class="mast"><p class="kicker">OxygenChallenge</p><h1 id="legal-title">${zh.title}</h1><p class="summary" id="legal-summary">${zh.summary}</p><p class="priority" id="legal-language-priority">${zh.languagePriority ?? ""}</p><p class="updated" id="legal-updated">${zh.updated}</p></header>
    <div class="document">
      <aside class="toc" aria-label="目录"><strong id="toc-title">本文目录</strong><div id="toc-links">${zh.sections.map((section, index) => `<a href="#section-${index + 1}">${section.title}</a>`).join("")}</div></aside>
      <article id="legal-body">${sectionsHtml(zh)}</article>
    </div>
    <footer class="foot" id="legal-foot">OxygenChallenge · ${config.publicOrigin} · contact@oxygenai.top</footer>
  </main>
  <script>
    (() => {
      const zh = ${JSON.stringify(zh)};
      const en = ${JSON.stringify(en)};
      const labels = ${JSON.stringify(labels)};
      const contactEmail = "contact@oxygenai.top";
      const kind = ${JSON.stringify(kind)};
      const root = document.documentElement;
      const banner = document.querySelector("#legal-banner");
      const saved = localStorage.getItem("oxygenchallenge-language");
      const detected = (navigator.language || "zh").toLowerCase().startsWith("zh") ? "zh" : "en";
      const language = saved === "zh" || saved === "en" ? saved : detected;
      const escapeHtml = (value) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
      const sectionHtml = (documentData) => documentData.sections.map((section, index) => \`<section id="section-\${index + 1}"><h2>\${escapeHtml(section.title)}</h2>\${(section.paragraphs || []).map((paragraph) => \`<p>\${escapeHtml(paragraph)}</p>\`).join("")}\${section.bullets ? \`<ul>\${section.bullets.map((item) => \`<li>\${escapeHtml(item)}</li>\`).join("")}</ul>\` : ""}</section>\`).join("");
      const apply = (next) => {
        const documentData = next === "en" ? en : zh;
        root.dataset.lang = next;
        root.lang = next === "zh" ? "zh-CN" : "en";
        document.title = \`\${documentData.title} · OxygenChallenge\`;
        document.querySelector("#legal-title").textContent = documentData.title;
        document.querySelector("#legal-summary").textContent = documentData.summary;
        document.querySelector("#legal-language-priority").textContent = documentData.languagePriority || "";
        document.querySelector("#legal-updated").textContent = documentData.updated;
        document.querySelector("#legal-body").innerHTML = sectionHtml(documentData);
        document.querySelector("#legal-foot").textContent = \`OxygenChallenge · ${config.publicOrigin} · \${contactEmail}\`;
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
