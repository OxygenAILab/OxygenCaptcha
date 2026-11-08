# 部署状态

当前版本：`v26.0-alpha.9`

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
- `v26.0-alpha.9` 已部署，`/v1/meta` 返回 `apiVersion=1`、十五种题型和
  low/medium/high/critical 风险步数。
- 官网 `/`、随机挑战 `/captcha`、`/platform` 和 OxygenAccount OAuth 入口均已上线；
  官网顶部横幅会自动识别语言并支持中英文切换。
- 私有源码与发布仓库为 `OxygenAILab/OxygenChallenge`，原 `OxygenAILab/OxygenCaptcha`
  已归档；`main`、开发分支和签名 tag `v26.0-alpha.4` 均已推送。
- OxygenAccount OAuth 已完成真实端到端回归：登录、授权、回调、开放平台会话与昵称资料
  均成功，头像字段在资料存在时展示。
- 远程 Playwright 在桌面与 390px 视口验证纯色官网、紧凑入口、无会话随机挑战、
  Turnstile 组件、麦克风/摄像头权限替代、法律页面、开放平台和跨域 Web Component。
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
- 2026-11-08：`v26.0-alpha.5` 部署完成。新增紧凑入口/成功收起、约 2% 公开预览、
  更长持续覆盖、滚动市场与目标本金、移动设备题型过滤、实用无障碍换题、开放平台
  工作台 UI、官网纯色首屏、双语隐私政策和用户协议；生产环境变量原样保留。
- 2026-11-08：`v26.0-alpha.6` 部署完成。修复 MediaPipe WASM CSP 导致的摄像头初始化
  失败，加入模型加载进度与分阶段错误；扩大移动录音证据请求体并量化特征；动物声音
  随机锚点并增加选项试听；移除朗读目标词高亮；缩小紧凑入口方框、图标化无障碍入口；
  修复宿主完成事件和官网/开放平台链接样式继承问题。
- 2026-11-08：`v26.0-alpha.7` 部署完成。加强展开/收起动效；开放平台新增最长 179 分钟的
  开发 IP 免验证规则与自动验证流程；补齐 `/docs`、`/docs/embed`、`/docs/integration`、
  `/docs/platform` 在线文档和 `/openapi.yaml` 静态描述。生产 Playwright smoke、桌面/移动
  官网、随机挑战、基础验证、Turnstile、摄像头权限路径、OAuth 入口和法律页面均通过；
  `/v1/meta`、官网资源查询串与 `/openapi.yaml` 均确认指向 `26.0.0-alpha.7`。
- 2026-11-08：`v26.0-alpha.8` 部署完成。细化中英文隐私政策与用户协议，明确英文权威版本、
  OxygenAI Tech., SG 运营者、实际香港/全球服务商数据路径、摄像头与麦克风本地处理、
  OxygenAccount、Cloudflare、开发 IP 免验证、客户嵌入责任、高风险用途限制、留存边界、
  用户权利、责任限制和 SIAC 争议解决，并修复法律文档目录锚点。
- 2026-11-08：`v26.0-alpha.9` 部署完成。修复宿主重排或移动 `<oxygen-challenge>` 后
  iframe 重载导致已完成状态回退为待验证的问题；Web Component 现在在宿主层保存 token
  成功状态并渲染紧凑完成视图，隐藏字段不再作为自定义元素子节点插入；同时隐藏 iframe
  内部滚动条外观，保留滚动可达性。

<!-- Git Hub@OxygenAI Lab | OxygenAILab@ StarsailsClover -->
