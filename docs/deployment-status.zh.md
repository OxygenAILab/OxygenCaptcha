# 部署状态

当前版本：`v26.0-alpha.4`

## 已完成

- HK `154.219.110.138` 上已部署 `/opt/oxygenchallenge`。
- systemd 服务：`oxygenchallenge.service`，监听 `127.0.0.1:8791`。
- 1Panel OpenResty 配置：`/opt/1panel/www/conf.d/captcha.oxygenai.top.conf`。
- 站点目录：`/opt/1panel/www/sites/captcha.oxygenai.top`。
- 公共演示 siteKey：`oc_public_demo`；secret 与 token seed 在
  `AGENTS-secrets.md` 的 `OxygenChallenge` 小节。
- origin 自签名证书已生成，供 Cloudflare Full 模式使用。
- 通过 `http://154.219.110.138/healthz` 和 `https://154.219.110.138/healthz`，带
  `Host: captcha.oxygenai.top`，均返回健康。
- 使用 `curl --resolve captcha.oxygenai.top:443:154.219.110.138` 验证了目标域名路由、
  `/embed` 的诱饵文本、SVG overlay 和 `frame.js` 引用。
- `v26.0-alpha.4` 已部署，`/v1/meta` 返回 `apiVersion=1`、十五种题型和
  low/medium/high/critical 风险步数。
- 官网 `/`、随机挑战 `/captcha`、`/platform` 和 OxygenAccount OAuth 入口均已上线；
  官网顶部横幅会自动识别语言并支持中英文切换。
- 私有源码与发布仓库为 `OxygenAILab/OxygenChallenge`，原 `OxygenAILab/OxygenCaptcha`
  已归档；`main`、开发分支和签名 tag `v26.0-alpha.4` 均已推送。
- OxygenAccount OAuth 已完成真实端到端回归：登录、授权、回调、开放平台会话与昵称资料
  均成功，头像字段在资料存在时展示。
- 远程 Playwright 在桌面与 390px 视口验证官网、随机挑战、基础交互、Turnstile 组件、
  麦克风/摄像头权限替代、开放平台和跨域 Web Component。
- 手部动作使用本地 vendored MediaPipe Hand Landmarker；模型完整性为
  `7,819,105` bytes，SHA-256 `FBC2A30080C3C557093B5DDFC334698132EB341044CCEE322CCF8BCF3607CDE1`。
- 部署脚本已改为显式 `systemctl restart`，避免运行中的 systemd 服务继续执行旧版本。
- Cloudflare `oxygenai.top` zone 已通过 Playwright 登录并创建 `captcha` A 记录。
- `https://captcha.oxygenai.top/healthz` 经 Cloudflare 公网返回 HTTP 200。

## DNS

| 字段 | 值 |
|---|---|
| Type | `A` |
| Name | `captcha` |
| IPv4 address | `154.219.110.138` |
| Proxy status | Proxied（橙云） |
| TTL | Auto |

该记录已创建并生效。Cloudflare SSL/TLS 模式沿用该 zone 现有 Full 配置。若使用 Full (strict)，需要把
`/opt/1panel/www/sites/captcha.oxygenai.top/ssl/fullchain.pem` 替换为 Cloudflare
Origin CA 证书；当前按 Full 兼容自签名 origin，公网 smoke 已通过。

## 记录

- 2026-11-07：服务与 OpenResty 已部署，DNS 受 Cloudflare 登录挑战阻塞，未自动修改 zone。
- 2026-11-07：`v26.0-alpha.2` 六题型部署完成；origin health、root 版本、资源与生产安全开关通过。
- 2026-11-07：通过 Playwright persistent profile 登录 Cloudflare，添加 `captcha` A 记录并完成公网验证。
- 2026-11-07：`v26.0-alpha.3` 九题型、风险会话和新增微型游戏部署完成。
- 2026-11-07：`v26.0-alpha.4` 十五题型、Cloudflare Turnstile、MediaPipe 手部动作、
  声学波形、风险画像和 OxygenAccount 开放平台部署完成，公网回归通过。

<!-- Git Hub@OxygenAI Lab | OxygenAILab@ StarsailsClover -->
