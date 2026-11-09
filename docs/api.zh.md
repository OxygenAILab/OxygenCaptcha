# OxygenChallenge API

版本：`26.0.2`

## 先决条件

- 请求源必须在站点 `origins` 白名单中。
- `POST /v1/challenges` 和 `POST /v2/challenges` 需要浏览器 `Origin` 或 `Referer`。
- `POST /v1/siteverify` 只允许客户服务端调用，必须使用站点 secret。
- 客户端可以选择发送 `X-Oxygen-Challenge-API-Version: 1` 或 `2`；发送不兼容版本时返回
  `400 API_VERSION_MISMATCH`。`/v1/**` 与 `/v2/**` 响应会分别回传 `1` 与 `2`。
- 所有 Challenge 和令牌均为一次性；资源 URL 不应被代理缓存。

## 创建 Challenge

`POST /v1/challenges`

```json
{
  "siteKey": "oc_public_demo",
  "action": "submit",
  "accessible": false,
  "challengeType": "grid_select",
  "risk": "low"
}
```

`challengeType` 可选。显式指定时创建单题会话；不传时创建风险会话。`risk` 与步数：

| `risk` | 步数 |
|---|---:|
| `low` | 3 |
| `medium` | 4 |
| `high` | 6 |
| `critical` | 8 |

测试或特殊接入可使用 `steps: 1..8` 覆盖步数。`accessible: true` 且提供 `accessibilityNeeds` 时按理由组合可用题型；未提供理由时保留单步反色题兼容行为。

## vNext 客户端上下文

`/v2/challenges` 必须提供 `clientContext`。Web Component 默认收集并通过 `/embed` 传递；
直接 API 调用示例：

```json
{
  "siteKey": "oc_public_demo",
  "action": "submit",
  "clientContext": {
    "timezone": "Asia/Shanghai",
    "timezoneOffsetMinutes": -480,
    "systemLanguage": "zh-CN",
    "languages": ["zh-CN", "en-US"],
    "selectedLanguage": "zh-CN",
    "screen": {
      "width": 1440,
      "height": 900,
      "pixelRatio": 1.25
    },
    "webdriver": false
  }
}
```

`selectedLanguage` 是消费端用户选择的界面语言，不是浏览器默认语言。`/v2/risk/assess`
可先返回 `risk`、`score`、`recommendedSteps` 和风险原因，消费者再决定是否创建挑战。
vNext 创建响应中的资源 URL 会使用 `/v2/challenges/:id/*` 与
`/v2/animal-sounds/:animal.wav`，与调用方的 API 版本保持一致。

| 类型 | 交互 |
|---|---|
| `inverse_occlusion` | 输入反色图像中的六位数字 |
| `grid_select` | 选择全部匹配目标图标的网格项 |
| `motion_drag` | 拖动遮罩持续覆盖移动目标 |
| `audio_sequence` | 听取声音序列并选择目标动物 |
| `calculation` | 输入大数四则运算结果 |
| `key_pointer` | 同时按住随机指定按键并向右拖动；移动端自动过滤 |
| `pattern_memory` | 观察并重复闪烁图标序列 |
| `count_flash` | 记住短暂显示的圆点数量 |
| `market_trade` | 在滚动曲线区间低买高卖，或累计达到目标本金 |
| `human_check` | 点击“我不是机器人”并满足最短交互停留 |
| `rotate_align` | 将图形旋转回正方向 |
| `semantic_pick` | 选择符合问题的语义选项 |
| `turnstile` | 完成 Cloudflare Turnstile |
| `hand_motion` | 按顺序完成 WebCam 动态手势 |
| `speech_wave` | 多遍朗读并比较目标字词窗口 |

`accessible: true` 且传入 `accessibilityNeeds` 时，会按可用感官组合多步骤题型。
`accessibilityNeeds` 可取 `vision`、`motor`、`hearing`、`speech`、`cognitive`，
至少一项、最多四项。未提供 `accessibilityNeeds` 时保留单步反色题与 DTMF 的兼容行为。

### 公开预览

`GET /captcha` 先返回紧凑入口；点击后请求 `GET /captcha?launch=1` 创建无 session ID、
无验证 token 的单题预览。预览覆盖全部题型，但每个题型只选择完整变式池中约 2% 的固定
代表变式，因此可以无限练习而不公开完整题库。预览通过后只返回：

```json
{
  "verified": true,
  "preview": true,
  "action": "submit",
  "siteKey": "oc_public_demo",
  "type": "grid_select"
}
```

预览结果不能用于 `/v1/siteverify`。

公共字段：

```json
{
  "challengeId": "random-one-time-id",
  "type": "grid_select",
  "siteKey": "oc_public_demo",
  "action": "submit",
  "sessionId": "random-session-id",
  "step": 1,
  "totalSteps": 3,
  "risk": "low",
  "deviceClass": "desktop",
  "preview": false,
  "swapAllowed": false,
  "expiresAt": "2026-11-07T00:10:00.000Z",
  "maxAttempts": 3,
  "prompt": "选择所有包含“奖杯”的图标"
}
```

### 反色遮挡

```json
{
  "type": "inverse_occlusion",
  "backgroundColor": "#0b1f33",
  "inverseColor": "#f4e0cc",
  "overlayUrl": "https://captcha.oxygenai.top/v1/challenges/.../overlay.svg",
  "audioUrl": "https://captcha.oxygenai.top/v1/challenges/.../audio.wav",
  "decoyText": "123456"
}
```

自定义客户端必须把 `decoyText` 渲染为与 `backgroundColor` 相同且 `aria-hidden="true"`
的文本。不要把该字段作为答案或可访问名称。

### 图标网格

```json
{
  "type": "grid_select",
  "targetName": "奖杯",
  "targetUrl": "https://captcha.oxygenai.top/v1/challenges/.../target.svg",
  "tileUrls": [
    "https://captcha.oxygenai.top/v1/challenges/.../tile/0.svg"
  ]
}
```

响应固定返回 9 个 `tileUrls`，不返回 `targetIndices`。

### 动态覆盖

```json
{
  "type": "motion_drag",
  "motion": {
    "seed": 123456,
    "width": 360,
    "height": 150,
    "durationMs": 20000,
    "requiredCoverageMs": 1800,
    "targetRadius": 32
  }
}
```

### 声音序列

```json
{
  "type": "audio_sequence",
  "audioUrl": "https://captcha.oxygenai.top/v1/challenges/.../sequence.wav",
  "anchorKey": "dog",
  "anchorLabel": "狗",
  "options": [
    { "key": "cat", "label": "猫" },
    { "key": "dog", "label": "狗" },
    { "key": "bird", "label": "鸟" },
    { "key": "horse", "label": "马" }
  ]
}
```

锚点动物随机选择，声音答案不在 JSON 中返回。选项声音可从
`GET /v1/animal-sounds/:animal.wav` 单独试听，便于在统一合成音库中建立声音与名称的
对应，不会泄露序列答案。

### 计算挑战

```json
{
  "type": "calculation",
  "expression": "265 × 25 + 85 × 33"
}
```

正确答案只保存在服务端。

### 键盘与指针双输入

```json
{
  "type": "key_pointer",
  "requiredDistance": 183,
  "requiredHoldMs": 824,
  "requiredKey": "KeyF",
  "requiredKeyLabel": "F"
}
```

### 序列记忆

```json
{
  "type": "pattern_memory",
  "pattern": {
    "seed": 123456,
    "sequenceLength": 4
  }
}
```

序列由 `seed` 和共享伪随机算法生成，不直接下发顺序数组。

### 瞬时计数

```json
{
  "type": "count_flash",
  "countFlash": {
    "seed": 123456,
    "revealMs": 900
  }
}
```

### 股市买卖

```json
{
  "type": "market_trade",
  "market": {
    "seed": 123456,
    "width": 360,
    "height": 156,
    "mode": "target",
    "sampleMs": 250,
    "durationMs": 15000,
    "initialCapital": 1000,
    "targetCapital": 1110
  }
}
```

### 基础确认与方向校准

```json
{
  "type": "human_check",
  "humanCheck": { "minDwellMs": 820 }
}
```

```json
{
  "type": "rotate_align",
  "rotateAlign": {
    "initialAngle": -93,
    "tolerance": 6
  }
}
```

### 语义选择与 Cloudflare Turnstile

```json
{
  "type": "semantic_pick",
  "prompt": "哪一个是会飞的动物？",
  "options": [
    { "key": "cat", "label": "猫" },
    { "key": "bird", "label": "鸟" }
  ]
}
```

```json
{
  "type": "turnstile",
  "turnstileSiteKey": "0x..."
}
```

Turnstile 的生产 secret 只保存在服务端；浏览器只拿到 site key。验证结果通过
Cloudflare `siteverify` 在服务端确认。

### 手部动态动作

```json
{
  "type": "hand_motion",
  "handMotion": {
    "sequence": ["thumb_up", "peace", "point_up"],
    "holdMs": 450
  }
}
```

摄像头帧在设备本地交给 MediaPipe Hand Landmarker，客户端只提交动作标签与保持时长，
不向服务端上传原始画面。

### 朗读声学一致性

```json
{
  "type": "speech_wave",
  "speechWave": {
    "phrase": "I like apples, apples are good for our health.",
    "targetWords": ["apples"],
    "focusWindows": [
      { "targetWord": "apples", "start": 0.16, "end": 0.34 }
    ],
    "takeCount": 3
  }
}
```

中文模板会逐项下发 `李光头`、`宋钢`、`笑`、`哭`、`一声`、`门板` 等
`focusWindows`。客户端只提交每遍的频段/能量特征；服务端按窗口做 DTW 比较，
要求三遍存在自然差异且整体保持同一语音内容，拒绝完全相同的波形。OC 自带嵌入页不会在
朗读文本中高亮目标词，也不会把 `focusWindows` 写入页面 DOM。

## 提交答案

`POST /v1/challenges/:id/verify`

不同题型使用不同载荷：

```json
{ "answer": "654321" }
```

```json
{ "selectedIndices": [1, 4, 7] }
```

```json
{
  "point": {
    "x": 182.4,
    "y": 73.8,
    "elapsedMs": 5200
  },
  "coverageMs": 1800
}
```

声音题：

```json
{ "answer": "dog" }
```

计算题：

```json
{ "answer": "12345" }
```

键盘与指针：

```json
{
  "holdMs": 824,
  "distance": 183,
  "keyCode": "KeyF"
}
```

序列记忆仍使用 `selectedIndices`：

```json
{ "selectedIndices": [2, 0, 3, 1] }
```

市场买卖：

```json
{
  "marketTrades": [
    { "buyIndex": 4, "sellIndex": 15 },
    { "buyIndex": 24, "sellIndex": 37 }
  ]
}

alpha.4 客户端继续发送 `{ "market": { "buyIndex": 24, "sellIndex": 84 } }`
时，服务端会包装成单笔 `marketTrades`，保持兼容。
```

基础检查、方向、Turnstile 与媒体证据：

```json
{
  "answer": "human",
  "dwellMs": 900
}
```

```json
{ "angle": 0 }
```

```json
{ "turnstileToken": "<cloudflare response token>" }
```

```json
{
  "handGestures": [
    { "action": "open", "durationMs": 520 },
    { "action": "peace", "durationMs": 610 }
  ]
}
```

```json
{
  "audioTakes": [
    [[0.12, 0.31, 0.55]],
    [[0.13, 0.29, 0.58]]
  ]
}
```

上例只展示结构；实际提交每遍至少 20 帧、每帧至少 5 个频段/能量特征，最多 160 帧、8 维。

成功：

```json
{
  "verified": true,
  "token": "short-lived-token",
  "assuranceLevel": "A1",
  "action": "submit",
  "siteKey": "oc_public_demo",
  "sessionId": "random-session-id",
  "risk": "medium",
  "stepsCompleted": 4,
  "expiresAt": "2026-11-07T00:02:00.000Z"
}
```

多步会话的中间步骤不返回令牌：

```json
{
  "verified": false,
  "stepPassed": true,
  "code": "STEP_PASSED",
  "sessionId": "random-session-id",
  "step": 2,
  "totalSteps": 4,
  "remainingSteps": 2,
  "nextChallenge": {
    "challengeId": "next-one-time-id",
    "type": "audio_sequence"
  },
  "nextEmbedUrl": "https://captcha.oxygenai.top/embed?session=...&launch=1"
}
```

自定义客户端应继续提交 `nextChallenge.challengeId`，或打开 `nextEmbedUrl`。

普通失败：

```json
{
  "verified": false,
  "code": "INVALID_SELECTION",
  "remainingAttempts": 2
}
```

同色诱饵命中对外仍返回普通 `INVALID_ANSWER`，服务端单独记录
`challenge.honeypot` 强风险事件。

## 资源接口

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/v1/challenges/:id/overlay.svg` | 反色数字图 |
| `GET` | `/v1/challenges/:id/audio.wav` | DTMF 无障碍音频 |
| `GET` | `/v1/challenges/:id/target.svg` | 网格目标图 |
| `GET` | `/v1/challenges/:id/tile/:index.svg` | 0 到 8 的网格项 |
| `GET` | `/v1/challenges/:id/sequence.wav` | 动物声音序列 |
| `GET` | `/v1/animal-sounds/:animal.wav` | 单个动物声音试听 |
| `POST` | `/v1/challenges/:id/swap` | 桌面媒体题换题；`accessible:true` 切换反色听觉替代 |

资源响应均为 `no-store`，Challenge 过期、已消费或题型不匹配时返回 HTTP 410。

## 服务端验证

`POST /v1/siteverify`

```json
{
  "secret": "<site secret>",
  "response": "<verification token>",
  "action": "submit"
}
```

成功：

```json
{
  "success": true,
  "siteKey": "oc_public_demo",
  "action": "submit",
  "assuranceLevel": "A1",
  "challengeTs": "2026-11-07T00:00:12.000Z",
  "errorCodes": []
}
```

第一次 `siteverify` 会消费令牌；同一令牌第二次返回 `TOKEN_REPLAYED`。

## 错误码

| HTTP | 代码 | 说明 |
|---:|---|---|
| 400 | `INVALID_REQUEST` | 字段缺失或格式错误 |
| 403 | `ORIGIN_NOT_ALLOWED` | 请求源不在站点白名单 |
| 403 | `ACTION_NOT_ALLOWED` | 站点未授权该动作 |
| 404 | `SITE_NOT_FOUND` | 站点密钥不存在 |
| 410 | `CHALLENGE_EXPIRED` | Challenge 已过期或已消费 |
| 200 | `INVALID_ANSWER` | 普通错误答案或诱饵命中 |
| 200 | `INVALID_SELECTION` | 网格选择不精确 |
| 200 | `INVALID_POINT` | 动态覆盖位置或时间无效 |
| 200 | `INVALID_GESTURE` | 键盘与指针证据不足 |
| 200 | `STEP_PASSED` | 会话中间步骤通过，尚未签发令牌 |
| 200 | `ATTEMPTS_EXHAUSTED` | 尝试次数耗尽 |
| 200 | `TOKEN_REPLAYED` | 验证令牌已消费 |

所有 secret、token 和 Challenge 答案不写入访问日志。

<!-- Git Hub@OxygenAILab | OxygenAI Lab@Sta rsailsClover -->
