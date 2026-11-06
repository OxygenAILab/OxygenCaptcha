# OxygenChallenge API

版本：`26.0.0-alpha.2`

## 先决条件

- 请求源必须在站点 `origins` 白名单中。
- `POST /v1/challenges` 需要浏览器 `Origin` 或 `Referer`。
- `POST /v1/siteverify` 只允许客户服务端调用，必须使用站点 secret。
- 所有 Challenge 和令牌均为一次性；资源 URL 不应被代理缓存。

## 创建 Challenge

`POST /v1/challenges`

```json
{
  "siteKey": "oc_public_demo",
  "action": "submit",
  "accessible": false,
  "challengeType": "grid_select"
}
```

`challengeType` 可选。不传时由服务端随机选择题型；正式接入通常不固定题型。

| 类型 | 交互 |
|---|---|
| `inverse_occlusion` | 输入反色图像中的六位数字 |
| `grid_select` | 选择全部匹配目标图标的网格项 |
| `motion_drag` | 拖动遮罩持续覆盖移动目标 |
| `audio_sequence` | 听取声音序列并选择目标动物 |
| `calculation` | 输入大数四则运算结果 |
| `key_pointer` | 同时按住空格键并向右拖动 |

`accessible: true` 会强制使用 `inverse_occlusion`，并提供 DTMF 音频替代。

公共字段：

```json
{
  "challengeId": "random-one-time-id",
  "type": "grid_select",
  "siteKey": "oc_public_demo",
  "action": "submit",
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
    "durationMs": 9000
  }
}
```

### 声音序列

```json
{
  "type": "audio_sequence",
  "audioUrl": "https://captcha.oxygenai.top/v1/challenges/.../sequence.wav",
  "options": [
    { "key": "cat", "label": "猫" },
    { "key": "dog", "label": "狗" },
    { "key": "bird", "label": "鸟" }
  ]
}
```

声音答案不在 JSON 中返回。

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
  "requiredHoldMs": 824
}
```

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
    "elapsedMs": 1200
  }
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
  "distance": 183
}
```

成功：

```json
{
  "verified": true,
  "token": "short-lived-token",
  "assuranceLevel": "A1",
  "action": "submit",
  "siteKey": "oc_public_demo",
  "expiresAt": "2026-11-07T00:02:00.000Z"
}
```

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
| 200 | `ATTEMPTS_EXHAUSTED` | 尝试次数耗尽 |
| 200 | `TOKEN_REPLAYED` | 验证令牌已消费 |

所有 secret、token 和 Challenge 答案不写入访问日志。

<!-- Git Hub@OxygenAILab | OxygenAI Lab@Sta rsailsClover -->
