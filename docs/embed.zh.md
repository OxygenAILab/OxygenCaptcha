# 嵌入 Widget

推荐使用 Web Component。它只依赖 `https://captcha.oxygenai.top/widget.js`，在客户页面
创建同源 iframe，并根据挑战内容自动调整高度。

## 最小示例

```html
<script src="https://captcha.oxygenai.top/widget.js" defer></script>

<form method="post" action="/api/signup">
  <label for="email">邮箱</label>
  <input id="email" name="email" type="email" required>

  <oxygen-challenge
    sitekey="oc_public_demo"
    action="submit"
    risk="medium"
    name="oxygen-token"
  ></oxygen-challenge>

  <button type="submit">注册</button>
</form>
```

通过后会向最近的 `form` 插入：

```html
<input type="hidden" name="oxygen-token" value="short-lived-token">
```

## 属性

| 属性 | 必填 | 默认 | 说明 |
|---|---:|---|---|
| `sitekey` | 是 | - | 站点公钥 |
| `action` | 否 | `submit` | 业务动作 |
| `name` | 否 | `oxygen-token` | 隐藏字段名 |
| `challenge-type` | 否 | 随机 | 固定题型，见 API 文档 |
| `risk` | 否 | `low` | `low/medium/high/critical`，对应 3/4/6/8 步 |
| `steps` | 否 | 风险默认 | 自定义 1 到 8 步，主要用于验收 |
| `accessible` | 否 | `false` | 设为 `true` 强制反色无障碍模式 |

管理员和自动化验收可以固定题型：

```html
<oxygen-challenge
  sitekey="oc_public_demo"
  action="submit"
  challenge-type="motion_drag"
></oxygen-challenge>
```

可用值：

- `inverse_occlusion`
- `grid_select`
- `motion_drag`
- `audio_sequence`
- `calculation`
- `key_pointer`
- `pattern_memory`
- `count_flash`
- `market_trade`

显式 `challenge-type` 会固定为单题会话。风险会话在 iframe 内逐步推进，进度显示在卡片底部。

## 事件

```js
const challenge = document.querySelector("oxygen-challenge");

challenge.addEventListener("oxygenchallenge:verified", (event) => {
  console.log(event.detail.token);
});

challenge.addEventListener("oxygenchallenge:failed", (event) => {
  console.log(event.detail.code);
});

challenge.addEventListener("oxygenchallenge:step", (event) => {
  console.log(event.detail.step, event.detail.totalSteps);
});
```

重新开始：

```js
document.querySelector("oxygen-challenge").reset();
```

## 直接 iframe

不使用 Web Component 时，可以直接嵌入服务端 HTML：

```html
<iframe
  src="https://captcha.oxygenai.top/embed?sitekey=oc_public_demo&action=submit"
  title="安全验证"
  width="440"
  height="560"
  style="border:0;border-radius:8px"
></iframe>
```

直接 iframe 需要客户页面发送 `Referer`，且页面 origin 必须在站点白名单中。Web Component
会自动调整高度；裸 iframe 建议预留 520 到 620px 高度。

## 服务端渲染参数

`GET /embed`

| 查询参数 | 说明 |
|---|---|
| `sitekey` | 站点公钥 |
| `action` | 业务动作 |
| `parentOrigin` | 可选，必须在站点 origin 白名单内 |
| `challengeType` | 可选，固定题型 |
| `risk` | 可选，`low/medium/high/critical` |
| `steps` | 可选，1 到 8 |
| `accessible` | `0` 或 `1` |
| `session` | 服务器生成的会话续页，不应由客户页面自行构造 |

## CSP

客户页面的 CSP 至少允许：

```text
script-src https://captcha.oxygenai.top
frame-src https://captcha.oxygenai.top
```

如使用直接 iframe，只需开放 `frame-src`。如页面允许严格 CSP，建议保留
`connect-src 'self'`；Widget 内部的网络请求发生在验证服务的 iframe 中。

## 交互与无障碍

- 所有交互控件触控目标不小于 44px。
- 图标、刷新和无障碍按钮都有可访问名称与键盘焦点态。
- `accessible="true"` 不显示网格或动态题，强制使用反色题和 DTMF 音频。
- 风险会话只有在最后一步通过后才写入隐藏 token 字段。
- 声音题只在用户点击“播放声音”后请求和播放 WAV。
- 序列记忆只播放一次随机顺序；用户需要主动点击“播放序列”。
- 瞬时计数不展示 DOM 数量，圆点只显示约 1 秒。
- 市场题使用低点买入、高点卖出的曲线点击交互。
- 动态题和双输入题尊重 `prefers-reduced-motion`；系统要求减少动态效果时仍可通过
  `accessible` 切换到静态替代。

本版本不请求麦克风或摄像头权限。主动说话验证和动态手势验证需要在后续版本中增加明确
授权、数据处理声明和防重放设计。

## 注意

- 不要把 `decoyText` 暴露为可访问名称或表单值。
- 不要在前端验证 token 后直接放行，必须调用 `siteverify`。
- token 短时有效且一次性；不要跨 action 复用。
- 站点 secret 和 token seed 只能保存在服务端。

<!-- Git Hub@OxygenAILab | OxygenAI Lab@Sta rsailsClover -->
