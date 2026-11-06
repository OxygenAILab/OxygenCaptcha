# 服务端接入

验证令牌只能由客户后端消费，不能信任浏览器传来的 `verified:true`。

## Node.js

```js
const response = await fetch("https://captcha.oxygenai.top/v1/siteverify", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    secret: process.env.OXYGENCHALLENGE_SITE_SECRET,
    response: formData.get("oxygen-token"),
    action: "submit",
  }),
});

const result = await response.json();
if (!result.success) {
  return { status: 403, body: { error: result.errorCodes[0] } };
}
```

## Python

```python
import os
import requests

response = requests.post(
    "https://captcha.oxygenai.top/v1/siteverify",
    json={
        "secret": os.environ["OXYGENCHALLENGE_SITE_SECRET"],
        "response": token,
        "action": "submit",
    },
    timeout=5,
)
result = response.json()
if not result.get("success"):
    raise PermissionError(result.get("errorCodes"))
```

## Go

```go
body, _ := json.Marshal(map[string]string{
    "secret":   os.Getenv("OXYGENCHALLENGE_SITE_SECRET"),
    "response": token,
    "action":   "submit",
})
resp, err := http.Post(
    "https://captcha.oxygenai.top/v1/siteverify",
    "application/json",
    bytes.NewReader(body),
)
if err != nil { return err }
defer resp.Body.Close()
```

## 失败处理

- 网络错误：按站点策略重试，但不要重复提交同一个 token。
- `TOKEN_REPLAYED`：重新要求用户完成 Challenge。
- `ORIGIN_NOT_ALLOWED`：检查站点白名单和嵌入页面 origin。
- `INVALID_SITE_SECRET`：检查服务端环境变量，不要把 secret 下发到浏览器。

## 请求示例

```bash
curl -sS https://captcha.oxygenai.top/v1/siteverify \
  -H 'content-type: application/json' \
  --data '{"secret":"<site secret>","response":"<token>","action":"submit"}'
```

<!-- G itHub@OxygenAILab | OxygenAILab@Star sailsClover -->
