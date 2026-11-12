# OxygenChallenge

面向 Agent 时代的风险自适应 Challenge 服务。`v26.0.3` 提供 OC 官网、
随机挑战入口 `/captcha`、可嵌入 Web Component、跨域 iframe、OxygenAccount 开放平台、
一次性验证令牌、vNext 风险上下文、风险会话和十五类交互挑战：

- `inverse_occlusion`：同色 DOM 诱饵 + 反色透明数字图。
- `grid_select`：3×3 Lucide 图标多选。
- `motion_drag`：拖动遮罩持续覆盖 Canvas 中的移动目标，要求后段持续命中。
- `audio_sequence`：程序合成动物声音序列，选择猫叫之后的动物。
- `calculation`：需要计算器的大数四则运算。
- `key_pointer`：同时按住随机指定按键并拖动滑块的组合输入；移动端自动过滤。
- `pattern_memory`：观察并重复随机闪烁的图标序列。
- `count_flash`：记住瞬时出现的小规模圆点数量。
- `market_trade`：右向左滚动的拟真价格曲线，支持单次低买高卖和目标本金模式。
- `human_check`：Cloudflare Type “我不是机器人”交互检查。
- `rotate_align`：旋转图形回到正方向。
- `semantic_pick`：轻量常识与语义选择。
- `turnstile`：Cloudflare Turnstile 托管验证。
- `hand_motion`：WebCam 本地 MediaPipe 手部骨骼动态动作序列。
- `speech_wave`：同一句多遍朗读，比较指定字词窗口的声学非严格一致性。

自动风险评分会综合 UA、Sec-CH-UA、平台/系统版本、系统语言、浏览器时区、用户选择语言、
Cloudflare 国家、IP 频次与 UA 轮换；`low` 风险会话为 3 步，`medium/high/critical`
分别为 4/6/8 步。显式指定 `challengeType` 时保持单步；无障碍模式会依据多选的无障碍
理由组合多步骤图文/音频/基础验证。中间步骤不会签发令牌，最后一步通过后才签发。

服务没有后台仪表盘，只暴露 Challenge、资源、嵌入页和 `siteverify` 接口。验证组件默认
显示 hCaptcha 风格的固定高紧凑入口，点击后才请求挑战，并在当前层向上展开；验证完成后
收回为“验证通过”状态，不挤压宿主页面。`/captcha` 使用无会话预览模式，公开题目只取
完整变式池约 2%，覆盖全部题型但不暴露完整题库。官网顶部横幅会根据浏览器语言自动选择
中文或英文，并允许用户随时切换。

## 快速开始

```powershell
npm ci
npm run typecheck
npm test
npm run build
npm start
```

默认开发地址是 `http://127.0.0.1:8787`。本地 `.env` 可覆盖端口、站点和令牌配置。

完整浏览器回归需要本机 Python Playwright Chromium/Edge、运行中的服务和宽松测试限速：

```powershell
$env:RATE_LIMIT_MAX = "10000"
python tests/browser_smoke.py
```

## 嵌入

```html
<script src="https://captcha.oxygenai.top/widget.js" defer></script>

<form>
  <oxygen-challenge
    sitekey="oc_public_demo"
    action="submit"
    risk="medium"
  ></oxygen-challenge>
  <button type="submit">提交</button>
</form>
```

成功后会向最近的 `form` 插入名为 `oxygen-token` 的隐藏字段，并触发
`oxygenchallenge:verified` 事件。可通过 `challenge-type` 固定题型，通过
`risk` 控制会话步数。`accessible="true"` 会打开无障碍理由选择；只提供旧版参数时仍回退到单步反色模式。
`oxygenchallenge:complete` 会与 `verified` 同步触发；完成态和宿主的验证回调在同一收起
流程中处理。
没有固定宽度时默认 400px，也可用 `width="360"` 等属性定制宽度；高度保持固定，
挑战展开层不会改变宿主文档流。

```html
<oxygen-challenge
  sitekey="oc_public_demo"
  action="submit"
  challenge-type="motion_drag"
  risk="low"
  name="human-token"
></oxygen-challenge>
```

## API

| 方法 | 路径 | 用途 |
|---|---|---|
| `GET` | `/` | OC 官网 |
| `GET` | `/captcha` | 浏览器随机挑战入口 |
| `POST` | `/v1/challenges` | 创建 JSON Challenge |
| `GET` | `/embed` | 创建服务端渲染 Widget |
| `POST` | `/v1/challenges/:id/verify` | 提交答案或交互证据 |
| `POST` | `/v1/challenges/:id/swap` | 桌面媒体题型换题或切换无障碍替代 |
| `GET` | `/v1/challenges/:id/overlay.svg` | 反色透明数字图 |
| `GET` | `/v1/challenges/:id/audio.wav` | DTMF 听觉替代 |
| `GET` | `/v1/challenges/:id/target.svg` | 网格目标图标 |
| `GET` | `/v1/challenges/:id/tile/:index.svg` | 网格选项图标 |
| `GET` | `/v1/challenges/:id/sequence.wav` | 动物声音序列 |
| `POST` | `/v1/siteverify` | 服务端消费一次性令牌 |
| `GET` | `/v1/meta` | API 与题型元信息 |
| `GET` | `/v2/meta` | vNext API 与风险上下文元信息 |
| `POST` | `/v2/challenges` | 创建带客户端上下文的 vNext Challenge |
| `POST` | `/v2/challenges/:id/verify` | vNext 提交答案或交互证据 |
| `POST` | `/v2/challenges/:id/swap` | vNext 换题或无障碍适配 |
| `GET` | `/v2/challenges/:id/*` | v2 资源别名（SVG、WAV） |
| `GET` | `/v2/animal-sounds/:animal.wav` | v2 动物声音试听别名 |
| `POST` | `/v2/siteverify` | vNext 服务端消费一次性令牌 |
| `POST` | `/v2/risk/assess` | 基于浏览器上下文评估风险 |
| `GET` | `/healthz` | 健康检查 |
| `GET` | `/platform` | OxygenAccount 开放平台 |
| `GET` | `/docs` | 在线开发文档与接入示例 |
| `GET` | `/auth/login` | OxygenAccount OIDC 登录 |
| `GET/POST/DELETE` | `/api/platform/apps` | 创建、轮换与停用应用 |
| `POST` | `/api/platform/apps/:id/bypass` | 为开发 IP 添加最长 179 分钟的免验证规则 |
| `DELETE` | `/api/platform/apps/:id/bypass` | 删除指定开发 IP 免验证规则 |
| `GET` | `/api/platform/ip` | 返回当前出口 IP，便于配置开发规则 |
| `GET` | `/privacy-policy` | 隐私政策 |
| `GET` | `/user-agreement` | 用户条款 |

嵌入接入：

- [API 中文文档](docs/api.zh.md)
- [嵌入文档](docs/embed.zh.md)
- [服务端接入](docs/integration.zh.md)
- [安全边界](docs/security.zh.md)
- [开放平台与 OxygenAccount](docs/platform.zh.md)
- [部署运维](docs/operations.zh.md)
- [当前部署状态](docs/deployment-status.zh.md)
- [OpenAPI](openapi.yaml)

公共演示 key 是 `oc_public_demo`，只用于接入验证。正式站点必须使用精确 origin 与
独立 secret；secret 只保存在服务端。

## 安全模型

- Challenge ID 为随机 144 bit，默认 300 秒过期，最多 3 次尝试。
- 反色题正确答案不进入 HTML、DOM、JSON 或 SVG 文本节点。
- 网格索引、序列、声音答案、计数结果、市场极值和计算结果只保存在服务端。
- 公开预览不签发 token，也不携带风险会话 ID；风险题仍按 UA、设备类、网络和请求频次升级。
- 入口和题内无障碍按钮都会要求选择至少一项、最多四项适配理由，并按可用感官组合多步骤挑战；
  旧版 `accessible=true` 仍保留单题反色加 DTMF 的兼容路径。
- 摄像头和麦克风题提供“我现在不方便使用麦克风/摄像头。”的可点选替代入口，移动端通过无障碍流程
  也可以换题；普通刷新换题仍保留设备类限制。
- 新 Web Component 默认使用 vNext 并上报时区、系统语言、用户选择语言、屏幕与能力信号；
  客户可用 `api-version="1"` 显式回退旧版。
- 摄像头题先加载手势模型并显示进度，再请求摄像头；CSP 明确允许受限 WASM 实例化。
- 动物声音使用随机锚点动物，选项支持单声试听；语音题不再在文本中高亮检测词。
- `siteverify` 令牌使用 Ed25519 签名，默认 120 秒有效并原子消费。
- 风险会话只在最后一步签发令牌，并绑定单个 session/action/site。
- CORS、Origin/Referer 白名单、CSP、`no-store`、限速和结构化风险日志默认开启。
- 当前状态存储为单进程内存；多实例部署前必须迁移到 Redis/Valkey。

反色诱饵是强 DOM/WebFetch 风险信号，但不是完整的人类证明。截图视觉模型、真人代答和
持有站点 secret 的攻击者仍在威胁模型之外。摄像头帧只在设备本地由 MediaPipe 处理，
麦克风只提交设备端频段特征；拒绝权限时保留反色题与听觉替代。

## 开源依赖

图形使用 [Rough.js](https://github.com/pshihn/rough)，图标使用
[Lucide](https://github.com/lucide-icons/lucide)，反馈音效使用
[ZzFX](https://github.com/KilledByAPixel/ZzFX)。动物声音由服务端程序合成，不包含第三方
录音。手部骨骼识别使用 [MediaPipe Tasks Vision](https://github.com/google-ai-edge/mediapipe)
及其 Hand Landmarker 模型。完整声明见 [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md)。

## 研究

产品研究与威胁模型位于：

`C:\Users\Sails\Documents\Workspace\02-Research\OxygenChallenge-WF-2026-11-06`

Private 仓库：<https://github.com/OxygenAILab/OxygenChallenge>

## License

Apache-2.0，见 [LICENSE](LICENSE)。

<!-- Git Hub@OxygenAILab | OxygenAI Lab@Sta rsailsClover -->
