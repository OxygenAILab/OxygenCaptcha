# 部署运维

## 环境变量

| 变量 | 必填 | 示例 | 说明 |
|---|---:|---|---|
| `NODE_ENV` | 是 | `production` | 生产环境 |
| `HOST` | 是 | `127.0.0.1` | 仅监听本机 |
| `PORT` | 是 | `8791` | 服务端口 |
| `PUBLIC_ORIGIN` | 是 | `https://captcha.oxygenai.top` | 对外地址 |
| `OXY_SITES_JSON` | 是 | JSON | 站点密钥、origin、actions |
| `OXY_TOKEN_SEED_BASE64` | 是 | base64 | 32 字节 Ed25519 seed |
| `CHALLENGE_TTL_SECONDS` | 否 | `300` | Challenge 总有效期 |
| `TOKEN_TTL_SECONDS` | 否 | `120` | 验证令牌有效期 |
| `MAX_ATTEMPTS` | 否 | `3` | 单题最大尝试次数 |
| `RATE_LIMIT_MAX` | 否 | `120` | 每 IP 每分钟请求上限 |
| `TURNSTILE_SITE_KEY` | 否 | `0x...` | Cloudflare Turnstile 公钥 |
| `TURNSTILE_SECRET_KEY` | 否 | - | Cloudflare Turnstile secret，只放服务端 |
| `OXY_PLATFORM_DATA_FILE` | 否 | `/opt/oxygenchallenge/data/platform.json` | 开放平台应用数据文件 |
| `OXY_PLATFORM_DATA_KEY_BASE64` | 开放平台 | base64 | 32 字节 AES-256-GCM 数据密钥 |
| `OXYGENACCOUNT_ISSUER` | 开放平台 | `https://account.oxygenai.top` | OxygenAccount OIDC issuer |
| `OXYGENACCOUNT_CLIENT_ID` | 开放平台 | - | OAuth client id |
| `OXYGENACCOUNT_CLIENT_SECRET` | 开放平台 | - | OAuth client secret |

`OXY_SITES_JSON` 的 secret 只放在服务器环境，不写进仓库或前端。
当前公共演示 key 的 secret 与 token seed 已登记在
`C:\Users\Sails\.codex\private\AGENTS-secrets.md` 的 `OxygenChallenge` 小节。

## 构建

```bash
npm ci
npm run typecheck
npm test
npm run build
```

浏览器回归：

```powershell
$env:RATE_LIMIT_MAX = "10000"
python -m py_compile tests/browser_smoke.py
python tests/browser_smoke.py
```

回归会覆盖十五个题型、390px 移动端、紧凑入口展开/收起、动态指针轨迹与持续覆盖、
随机键位双输入、序列记忆、瞬时等大不重叠计数、股市滚动与目标本金、基础交互、方向校准、
语义选择、手部动作测试注入、读写声学测试注入、风险会话逐题推进、诱饵命中、
`accessible=1` 实用替代、官网、无会话 `/captcha` 预览、开放平台、法律页面和跨域
Web Component 的向上展开与成功收起。
截图写入 `_devdocs/evidence/`，不提交到 Private 仓库。

## systemd

`systemd/oxygenchallenge.service` 是模板。部署后：

```bash
systemctl daemon-reload
systemctl enable --now oxygenchallenge
systemctl status oxygenchallenge
```

## Nginx

使用 `deploy/nginx-captcha.conf` 作为反向代理模板：

- 只反代到 `127.0.0.1:8791`。
- 不缓存 `/v1/` 和 `/embed`。
- 传递 `Host`、`X-Real-IP`、`X-Forwarded-For`。
- API 和 Widget 使用同一 host，避免跨域。

## 健康检查

```bash
curl -fsS http://127.0.0.1:8791/healthz
```

## 扩容

当前 Challenge 和令牌消费状态在单进程内存中。扩展为多实例前必须迁移到 Redis/Valkey，并保证 challenge 消费和 token replay 检查原子化。

<!-- G itHub@OxygenAILab | OxygenAILab@StarsailsClo ver -->
