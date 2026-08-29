# 复制下面的提示词到 Claude Code

[English](CLAUDE_CODE_INSTALL_PROMPT.md)

请在我的本机完整安装并启动 Marketing Pipeline：Core 模式（Dashboard、Control API、数据库与
共享 Pipeline）加 Android Phone 模式。仓库地址：

https://github.com/Huo-sui/marketing-pipeline-dashboard

请自主完成所有安全的本地步骤。只运行 Dashboard 不算完整安装；成功必须包含一台真实、已
授权的 Android 手机。

1. 识别宿主系统，并通过系统原生包管理器与官方来源安装缺失依赖：Git、Node.js 22.12+、
   npm 10+、Docker 与 Compose v2。JDK 17 由仓库安装到本地。提权、许可接受或重启前先询问。
2. Clone 仓库。目录已存在时保留 `.env`、`data/` 和本地改动。继续前必须完整读取
   `CLAUDE.md`、`AGENTS.md` 与 `docs/agent-install.md`。
3. 运行 `npm run setup`。诊断真实失败；不得修改产品代码来隐藏缺失依赖。
4. 运行 `npm run phone:doctor:json`，反复排查到 `ready: true`：
   - 确认实体 Android 手机已连接、解锁，并使用支持数据传输的 USB 线。
   - 分别处理“未发现设备”、`offline` 与 `unauthorized`；等待授权时让我在手机上接受 RSA
     指纹弹窗。
   - 无法读取机型时先检查系统 USB 列表；仍未知时向我询问准确品牌与完整型号。只优先研究
     该型号厂商官方说明，给出开发者选项、USB 调试与 Windows OEM Driver 的准确操作。每次
     用户操作后重新运行诊断。
   - 确认 TikTok 和/或小红书已安装。登录、验证码、同意授权与风控由我在手机上完成。
5. 如果缺少 AutoGLM 配置，尽可能打开官方页面，否则提供
   https://open.bigmodel.cn/usercenter/apikeys。指导我注册和创建 API Key，让我直接把它写入
   本地 `.env` 的 `ZHIPU_API_KEY=...`；不得在聊天中索取、输出或提交 Key。
6. 用 `npm start` 启动产品，只绑定 `127.0.0.1`，保持服务运行，并在第二个终端使用
   `npm run health` 验证。如果 Dashboard 端口被占用，在 `.env` 选择空闲的
   `MARKETING_PIPELINE_PORT`；不得改绑 `0.0.0.0` 来绕过。
7. 给出本地 Dashboard URL（默认 3210），指导完成产品内 Phone 账号设置，直到读取到真实
   账号身份并由我确认。
8. 之后才能汇总 URL、Health 状态、已脱敏的手机型号/Android 版本、Phone Doctor READY、
   已安装平台 App 与确实尚未实现的能力。不得发明平台数据或声称未验证的 Adapter 已可用。

保护 `.env`、Key、Cookie、账号信息、序列号、UI dump、日志与 Profile。不得使用 Mock 数据、
假 URL、随机 external ID 或伪造发布时间来声称安装成功。
