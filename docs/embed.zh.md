# 嵌入 Widget

推荐使用 Web Component。它只依赖 `https://captcha.oxygenai.top/widget.js`，在客户页面
创建一个固定高、可自定义宽度的紧凑入口。点击“我是人类”后才请求 Challenge；题目层
从入口向上覆盖展开，不改变宿主页面的文档流，验证成功后收回为“验证通过”。

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
| `width` | 否 | `400` | 入口宽度，范围 280 到 600px；小屏会自动限制为容器宽度 |
| `challenge-type` | 否 | 随机 | 固定题型，见 API 文档 |
| `risk` | 否 | `low` | `low/medium/high/critical`，对应 3/4/6/8 步 |
| `steps` | 否 | 风险默认 | 自定义 1 到 8 步，主要用于验收 |
| `accessible` | 否 | `false` | 设为 `true` 进入无障碍流程；配合 `accessibilityNeeds` 组合多步骤题型 |
| `api-version` | 否 | `2` | `2` 上报时区/语言/屏幕等风险上下文；`1` 回退旧版 |
| `user-language` | 否 | 页面 `lang` | 消费端用户选择的语言，用于 vNext 风险比较 |

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
- `human_check`
- `rotate_align`
- `semantic_pick`
- `turnstile`
- `hand_motion`
- `speech_wave`

显式 `challenge-type` 会固定为单题会话。风险会话在 iframe 内逐步推进，进度显示在卡片底部。
桌面端摄像头、麦克风和 Turnstile 题可在题内使用换题按钮替换一次；移动端不会出现
`key_pointer`，也不能跳过摄像头/麦克风题。

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

裸 iframe 无法像 Web Component 一样不影响页面地向上展开。如果必须使用裸 iframe，
可以直接请求已展开的 Challenge 页面并预留足够高度：

```html
<iframe
  src="https://captcha.oxygenai.top/embed?sitekey=oc_public_demo&action=submit&launch=1"
  title="安全验证"
  width="440"
  height="560"
  style="border:0;border-radius:8px"
></iframe>
```

直接 iframe 需要客户页面发送 `Referer`，且页面 origin 必须在站点白名单中。裸 iframe
建议预留 520 到 700px 高度。

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
| `apiVersion` | `1` 或 `2`；`2` 需要 `clientContext` |
| `clientContext` | URL 编码后的 JSON；Web Component 自动生成 |
| `accessibilityNeeds` | 逗号分隔的适配理由，最多四项 |
| `launch` | `0` 默认显示紧凑入口；`1` 直接创建并显示 Challenge |
| `session` | 服务器生成的会话续页，不应由客户页面自行构造 |

## CSP

客户页面的 CSP 至少允许：

```text
script-src https://captcha.oxygenai.top
frame-src https://captcha.oxygenai.top
```

如使用直接 iframe，只需开放 `frame-src`。如页面允许严格 CSP，建议保留
`connect-src 'self'`；Widget 内部的网络请求发生在验证服务的 iframe 中。
Challenge 页自身允许 MediaPipe 所需的 `'wasm-unsafe-eval'`，客户页面不需要额外开放
`unsafe-eval`。

## 交互与无障碍

- 开发与验收时可在开放平台为应用配置精确 IP 的最长 179 分钟免验证规则。命中后
  Web Component 会自动完成标准验证流程并照常发送 `verified`/`complete` 事件。
- 所有交互控件触控目标不小于 44px。
- 默认入口为 400×96px 的品牌化矩形，点击热区保持 44px，可见方框为 29px。
- 图标、刷新和无障碍按钮都有可访问名称与键盘焦点态。
- 紧凑入口的无障碍按钮会显示可多选的理由面板；至少选择一项、最多四项，不能全选。
  理由用于选择可用感官匹配的多步骤题型，而不是固定返回同一道题。
- 旧版 `accessible=1` 且不提供理由时，仍兼容单步反色题和 DTMF 音频。
- 风险会话只有在最后一步通过后才写入隐藏 token 字段。
- 声音题只在用户点击“播放声音”后请求和播放 WAV。
- 序列记忆只播放一次随机顺序；用户需要主动点击“播放序列”。
- 瞬时计数不展示 DOM 数量，圆点只显示约 1 秒。
- 市场题曲线从右侧进入并向左滚动，完整显示后停止；点击低区间买入、高区间卖出。
- 目标本金模式允许连续交易，直到资产达到本金的 +5% 到 +15%。
- 动态题和双输入题尊重 `prefers-reduced-motion`；系统要求减少动态效果时仍可通过
  `accessible` 切换到静态替代。
- `hand_motion` 只有在用户点击“启用摄像头并开始”后请求摄像头权限，视频帧在设备本地
  完成 MediaPipe 手部骨骼识别，只提交动作标签和持续时间。组件先下载模型并显示进度，
  模型就绪后才请求摄像头；模型、权限、设备占用和超时会分别给出错误。
- `speech_wave` 只有在用户点击录制后请求麦克风权限，三遍朗读只提交频段与能量特征；
  原始音频不上传，服务端比较所有目标字词窗口的非严格一致性。页面不会高亮目标词；
  特征在浏览器端量化，服务端为媒体证据保留更大的请求体上限。
- 拒绝摄像头或麦克风权限时，用户仍可使用 `accessible="true"` 切换到反色题和 DTMF
  听觉替代。
- 组件底部提供隐私政策与用户条款链接，均在 OC 自有页面打开。

## 注意

- 不要把 `decoyText` 暴露为可访问名称或表单值。
- 不要在前端验证 token 后直接放行，必须调用 `siteverify`。
- token 短时有效且一次性；不要跨 action 复用。
- 站点 secret 和 token seed 只能保存在服务端。

<!-- Git Hub@OxygenAILab | OxygenAI Lab@Sta rsailsClover -->
