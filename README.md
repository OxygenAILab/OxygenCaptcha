# OxygenChallenge

面向 Agent 时代的风险自适应 Challenge 服务。`v26.0-alpha.3` 提供 API-only 服务、
可嵌入 Web Component、跨域 iframe、一次性验证令牌、风险会话和九类交互挑战：

- `inverse_occlusion`：同色 DOM 诱饵 + 反色透明数字图。
- `grid_select`：3×3 Lucide 图标多选。
- `motion_drag`：拖动遮罩持续覆盖 Canvas 中的移动目标。
- `audio_sequence`：程序合成动物声音序列，选择猫叫之后的动物。
- `calculation`：需要计算器的大数四则运算。
- `key_pointer`：同时按住空格键并拖动滑块的组合输入。
- `pattern_memory`：观察并重复随机闪烁的图标序列。
- `count_flash`：记住瞬时出现的小规模圆点数量。
- `market_trade`：在价格曲线低点买入、高点卖出。

`low` 风险会话为 3 步，`medium/high/critical` 分别为 4/6/8 步。显式指定
`challengeType` 或使用无障碍模式时保持单步；中间步骤不会签发令牌，最后一步通过后才签发。

服务没有仪表盘，只暴露 Challenge、资源、嵌入页和 `siteverify` 接口。视觉采用紧凑白色
验证卡、冷灰画布、统一蓝色强调色、44px 触控目标和自动尺寸 iframe。

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
`risk` 控制会话步数，通过 `accessible="true"` 强制单步反色无障碍模式。

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
| `POST` | `/v1/challenges` | 创建 JSON Challenge |
| `GET` | `/embed` | 创建服务端渲染 Widget |
| `POST` | `/v1/challenges/:id/verify` | 提交答案或交互证据 |
| `GET` | `/v1/challenges/:id/overlay.svg` | 反色透明数字图 |
| `GET` | `/v1/challenges/:id/audio.wav` | DTMF 听觉替代 |
| `GET` | `/v1/challenges/:id/target.svg` | 网格目标图标 |
| `GET` | `/v1/challenges/:id/tile/:index.svg` | 网格选项图标 |
| `GET` | `/v1/challenges/:id/sequence.wav` | 动物声音序列 |
| `POST` | `/v1/siteverify` | 服务端消费一次性令牌 |
| `GET` | `/healthz` | 健康检查 |

嵌入接入：

- [API 中文文档](docs/api.zh.md)
- [嵌入文档](docs/embed.zh.md)
- [服务端接入](docs/integration.zh.md)
- [安全边界](docs/security.zh.md)
- [部署运维](docs/operations.zh.md)
- [当前部署状态](docs/deployment-status.zh.md)
- [OpenAPI](openapi.yaml)

公共演示 key 是 `oc_public_demo`，只用于接入验证。正式站点必须使用精确 origin 与
独立 secret；secret 只保存在服务端。

## 安全模型

- Challenge ID 为随机 144 bit，默认 300 秒过期，最多 3 次尝试。
- 反色题正确答案不进入 HTML、DOM、JSON 或 SVG 文本节点。
- 网格索引、序列、声音答案、计数结果、市场极值和计算结果只保存在服务端。
- `siteverify` 令牌使用 Ed25519 签名，默认 120 秒有效并原子消费。
- 风险会话只在最后一步签发令牌，并绑定单个 session/action/site。
- CORS、Origin/Referer 白名单、CSP、`no-store`、限速和结构化风险日志默认开启。
- 当前状态存储为单进程内存；多实例部署前必须迁移到 Redis/Valkey。

反色诱饵是强 DOM/WebFetch 风险信号，但不是完整的人类证明。截图视觉模型、真人代答和
持有站点 secret 的攻击者仍在威胁模型之外。麦克风、摄像头和主动说话/手势验证只进入研究
路线，本版本不会请求这些权限。

## 开源依赖

图形使用 [Rough.js](https://github.com/pshihn/rough)，图标使用
[Lucide](https://github.com/lucide-icons/lucide)，反馈音效使用
[ZzFX](https://github.com/KilledByAPixel/ZzFX)。动物声音由服务端程序合成，不包含第三方
录音。完整声明见 [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md)。

## 研究

产品研究与威胁模型位于：

`C:\Users\Sails\Documents\Workspace\02-Research\OxygenChallenge-WF-2026-11-06`

Public 仓库：<https://github.com/OxygenAILab/OxygenCaptcha>

## License

Apache-2.0，见 [LICENSE](LICENSE)。

<!-- Git Hub@OxygenAILab | OxygenAI Lab@Sta rsailsClover -->
