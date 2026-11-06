# 部署状态

当前版本：`v26.0-alpha.2`

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
- `v26.0-alpha.2` 已重新部署，root API 返回六种题型，生产环境 `test=1` 不开启测试坐标。
- 远程 Playwright 在 390px 视口验证六题型页面、CSS、JS、音频与 Canvas 资源均可加载。
- 部署脚本已改为显式 `systemctl restart`，避免运行中的 systemd 服务继续执行旧版本。

## 待完成的外部操作

Cloudflare 的 `oxygenai.top` zone 不在当前机器已有 API Token 的权限范围内；当前 Token
只可见另一账户的 zone。需要在 `xingk.xncn` 账户的 Cloudflare Dashboard 添加：

| 字段 | 值 |
|---|---|
| Type | `A` |
| Name | `captcha` |
| IPv4 address | `154.219.110.138` |
| Proxy status | Proxied（橙云） |
| TTL | Auto |

Cloudflare SSL/TLS 模式沿用该 zone 现有 Full 配置。若使用 Full (strict)，需要把
`/opt/1panel/www/sites/captcha.oxygenai.top/ssl/fullchain.pem` 替换为 Cloudflare
Origin CA 证书；当前先按 Full 兼容自签名 origin。

## 记录

- 2026-11-07：服务与 OpenResty 已部署，DNS 受 Cloudflare 登录挑战阻塞，未自动修改 zone。
- 2026-11-07：`v26.0-alpha.2` 六题型部署完成；origin health、root 版本、资源与生产安全开关通过。

<!-- Git Hub@OxygenAI Lab | OxygenAILab@ StarsailsClover -->
