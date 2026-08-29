# 复制下面的提示词到 Codex

[English](CODEX_INSTALL_PROMPT.md)

请在我的本机完整安装并启动 Marketing Pipeline：Core 模式（Dashboard、Control API、数据库与
共享 Pipeline）加 Android Phone 模式。仓库地址：

https://github.com/Huo-sui/marketing-pipeline-dashboard

请负责安装直到满足完成条件。只运行 Dashboard、但没有准备好真实实体 Android 手机，不算成功。

1. 检查宿主系统，并安全安装所有缺失的系统依赖：Git、Node.js 22.12+、npm 10+、Docker 与
   Compose v2。JDK 17 由仓库安装到本地。使用系统原生包管理器与官方来源；需要提权、接受许可
   或重启时先询问我，完成后继续。
2. 把仓库 Clone 到合理的本地目录。目录已存在时保留 `.env`、`data/` 与我的改动。Clone 后
   必须完整读取 `AGENTS.md` 和 `docs/agent-install.md`；Codex 可能在这些项目指令进入上下文
   之前就已启动。
3. 运行 `npm run setup`，修复真实依赖或安装问题；不得修改应用来绕过前置条件。
4. 运行 `npm run phone:doctor:json`，持续排查到它返回 `ready: true`：
   - 确认已连接实体手机并确认它是 Android；手机必须解锁，USB 线必须支持数据传输。
   - 分别处理“未发现设备”、`offline` 与 `unauthorized`。如果是 `unauthorized`，让我在手机上
     接受 USB 调试 RSA 指纹弹窗。
   - 无法读取机型时先检查宿主机 USB 设备列表；仍无法确认时，让我输入品牌与完整型号。联网
     查找该型号的厂商官方开发者选项、USB 调试和（Windows）OEM USB Driver 说明，给出准确
     的手机端操作，只在必须由我完成时暂停。
   - 每次调整后重新运行 Doctor，不要假设设置已经生效。
   - 确认 TikTok 和/或小红书已安装。登录、验证码、同意授权和风控由我直接在手机上完成。
5. 如果 AutoGLM 未配置，有浏览器控制能力时打开智谱官方 API Key 页面，否则提供：
   https://open.bigmodel.cn/usercenter/apikeys
   指导我注册并创建 Key，让我直接把 Key 写入仓库本地 `.env` 的 `ZHIPU_API_KEY=` 后。不要
   让我把 Key 粘贴到聊天、不要回显，也不要提交 `.env`。
6. 运行 `npm start`，只能绑定 `127.0.0.1`。保持它运行，等待就绪，并在第二个终端执行
   `npm run health`。如果 Dashboard 端口被占用，在 `.env` 选择空闲的
   `MARKETING_PIPELINE_PORT`；不得改绑 `0.0.0.0` 来绕过。
7. 打开或提供本地 Dashboard URL（默认 3210），指导我添加检测到的 Phone 账号、在手机上
   登录，并确认系统读取到的真实账号身份。
8. 只有完成后才能总结：服务 URL、Health 结果、已脱敏的手机厂商/型号与 Android 版本、
   Phone Doctor READY 状态、已安装的平台 App，以及任何确实尚未实现的平台能力。除非真实
   Adapter 声明对应能力且已实际验证，否则不得声称发布或互动可用。

保护 Key、Cookie、账号资料、设备序列号、UI dump、日志和浏览器 Profile。不得使用 Fixture、
假链接、随机 ID 或“当前时间冒充发布时间”制造安装或平台运行成功。
