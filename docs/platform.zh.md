# 开放平台与 OxygenAccount

OxygenChallenge 开放平台位于 `https://captcha.oxygenai.top/platform`。用户使用
OxygenAccount 登录后可以创建应用、配置精确 origin 与 action，并取得：

- `siteKey`：公开嵌入，可以出现在浏览器页面。
- `secret`：只在创建或轮换后显示一次；必须保存在客户服务端，用于 `siteverify`。

## OAuth / OIDC 流程

开放平台采用 Authorization Code + PKCE：

1. 浏览器访问 `GET /auth/login`。
2. 服务端发现 OxygenAccount OIDC metadata，并生成 `state` 与 PKCE `code_verifier`。
3. 用户在 OxygenAccount 完成登录与授权。
4. OxygenAccount 回调 `https://captcha.oxygenai.top/auth/callback`。
5. OxygenChallenge 交换 access token、读取 `/oauth2/userinfo`，并只在服务端保存用户资料快照。
6. 浏览器获得 `oc_platform_session` HttpOnly SameSite=Lax 会话 Cookie。

OxygenAccount 当前部署的授权入口兼容 `api_version=2` 查询参数；OxygenChallenge 会在
授权 URL 中附带该参数。服务端交换 token 与读取 userinfo 时同时发送
`X-OxygenAccount-API-Version: 2`，避免代理层剥离自定义头导致版本校验失败。

请求的 scope：

```text
openid profile email
```

`profile` scope 返回 OxygenAccount 的 `name`、`picture`、`locale`、`zoneinfo`、`bio` 等
展示资料。开放平台使用 `name` 作为昵称、`picture` 作为头像；未知 `account_type` 一律拒绝，
不允许降级为普通用户。

需要登记的 redirect URI：

```text
https://captcha.oxygenai.top/auth/callback
```

## 应用管理 API

所有 `/api/platform/**` 写操作都要求：

- 有效的 `oc_platform_session` Cookie。
- 与 `/api/platform/session` 返回的 `csrf` 一致的 `X-CSRF-Token`。

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/platform/session` | 当前已脱敏用户资料、CSRF 与登录状态 |
| `GET` | `/api/platform/apps` | 当前用户拥有的应用 |
| `POST` | `/api/platform/apps` | 创建应用 |
| `POST` | `/api/platform/apps/:id/rotate` | 轮换 secret，旧值立即失效 |
| `DELETE` | `/api/platform/apps/:id` | 停用应用并删除动态 site key |

创建请求：

```json
{
  "name": "OxygenAccount Signup",
  "origins": ["https://account.oxygenai.top"],
  "actions": ["signup", "login"]
}
```

创建响应会包含一次性展示的 `secret`。应用 secret 使用 AES-256-GCM 加密保存到
`OXY_PLATFORM_DATA_FILE`；数据密钥来自 `OXY_PLATFORM_DATA_KEY_BASE64`。

## 服务端环境变量

```text
OXYGENACCOUNT_ISSUER=https://account.oxygenai.top
OXYGENACCOUNT_CLIENT_ID=<oauth client id>
OXYGENACCOUNT_CLIENT_SECRET=<oauth client secret>
OXY_PLATFORM_DATA_KEY_BASE64=<32-byte base64 key>
OXY_PLATFORM_DATA_FILE=/opt/oxygenchallenge/data/platform.json
```

私有值登记在 `AGENTS-secrets.md / OxygenChallenge`，不进入仓库、日志或浏览器。

## 安全约束

- `siteKey` 可以公开；`secret` 绝不能下发浏览器。
- origin 只接受精确 HTTPS origin；本机 `localhost`/`127.0.0.1` 仅用于开发。
- CSRF、HttpOnly Cookie、SameSite=Lax 与 OIDC state/PKCE 同时启用。
- 轮换 secret 后旧 secret 立即失效，避免新旧凭据长期并行。
- 开放平台用户资料只保留 sub、昵称、头像与邮箱；不保存 OxygenAccount access token。
