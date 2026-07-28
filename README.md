# 求职闭环

求职闭环是一个本地优先的个人求职规划与经验沉淀工具。它帮助你把“记录岗位 → 跟进流程 → 生成准备材料 → 记录面试 → 复盘 → 审核沉淀 → 在下一次准备中复用”串成完整闭环。

它不是简历修改器，不代替你投递岗位，也不会自动安排提醒。V1 面向 Windows 桌面端，数据默认只保存在用户自己的电脑。

## V1 可以做什么

- 记录公司、岗位名称、兴趣度和原始 JD。
- 记录自定义流程阶段、实际日期、预计日期、反馈和备注。
- 按需调用 OpenAI-compatible API，基于 JD 和用户明确选择的项目/问题生成准备材料。
- 准备材料包含基础岗位分析，以及 Map Competencies、STARS Company Map、Dream Candidate Avatar 和 Action Guide。
- 手动记录面试文字，预览外发内容后明确确认 AI 复盘。
- AI 生成的项目、问题、能力、心得建议先进入复盘中心；只有用户接受后才写入长期资产。
- 管理项目档案、面试官问题、候选人反问、能力主题和随想心得。
- 查看岗位阶段、面试、复盘和能力频次总览。
- 导出和恢复本地 `.jobloop` 数据库备份。

## 安装与启动

### Windows 安装包

运行 `JobSearchLoop-Setup-0.1.0.exe`，按安装向导选择安装目录。安装完成后可从桌面快捷方式或开始菜单打开“求职闭环”。

如使用免安装构建，可直接运行 `win-unpacked\求职闭环.exe`。V1 安装包未进行商业代码签名，Windows 可能显示来源提醒；请只使用你自己构建或可信来源提供的安装包。

### 本地开发

需要 Node.js 24+ 与 npm。

```powershell
npm install
npm run dev
```

常用命令：

```powershell
npm test
npm run typecheck
npm run build
npm run test:e2e
npm run test:build-output
npm run package:win
npm run smoke:win
```

- `npm run dev`：启动 Vite、Electron TypeScript 监听与桌面应用。
- `npm run build`：生成 `dist/` 和 `dist-electron/`。
- `npm run test:e2e`：使用项目安装的 Electron 与本地假 AI 服务验证完整闭环，不访问外网。
- `npm run package:win`：在 `release/` 生成 x64 NSIS 安装包和 `win-unpacked/`。
- `npm run smoke:win`：启动 `release/win-unpacked/求职闭环.exe`，用临时数据目录检查窗口、数据库与 DevTools 状态。

## 本地数据与隐私

Windows 安装版的数据目录通常为：

```text
%APPDATA%\求职闭环\
```

核心记录保存在 `job-search-loop.sqlite`。AI 地址、模型和加密后的 API Key 保存在同一应用数据目录的独立配置文件中，但不会进入 `.jobloop` 备份。开发环境的数据目录由 Electron 的 `app.getPath('userData')` 决定，可能与安装版不同。

应用没有遥测，也不会自动调用 AI。以下操作会在你点击预览、检查发送范围并再次明确确认后调用外部服务：

- 生成岗位准备：公司、岗位名称、完整原始 JD、当前岗位准备 Prompt，以及你明确勾选的项目和问题。
- 面试复盘：岗位与完整原始 JD、面试文字、个人补充、反馈、当前复盘 Prompt，以及你明确勾选的长期资产。
- 共性能力分析：你明确勾选岗位的原始 JD 与当前共性能力分析 Prompt。
- 测试连接：一条最小 JSON 测试请求。

AI 输出先在本机校验。准备材料保存为只读历史快照；面试复盘和能力分析产生的资产变更必须在复盘中心由用户接受，不会直接改写长期资产。

## 配置 OpenAI-compatible API

打开“设置”，填写：

1. API 地址，例如 `https://api.example.com/v1`。
2. 服务提供的模型名称。
3. API Key。

远程服务必须使用 HTTPS。本机调试服务可以使用 `http://localhost`、`http://127.0.0.1` 或 `http://[::1]`。API Key 通过操作系统安全存储加密，并且不会回显到界面或 Renderer 进程。更换服务来源时必须重新填写密钥。

不同 OpenAI-compatible 服务对模型、配额、日志保留和数据政策的约定不同；发送前请阅读所选服务商的隐私说明。

## 备份与恢复

在“设置 → 本地备份”中：

- “导出本地备份”会创建 `.jobloop` 文件，只包含求职记录、复盘与长期资产，不包含 AI 配置和 API Key。
- “恢复本地备份”会先校验文件和数据库版本，再创建当前数据库的时间戳回滚副本并替换数据。恢复成功后应用自动重启。

恢复会替换当前本地记录，请先导出当前备份，并将 `.jobloop` 文件保存在可信位置。

## V1 明确不包含

- 手机 App、网页云端版或电脑与手机同步。
- 局域网同步、云存储或多人协作。
- 截图 OCR、一键识别 JD。
- 录音、音频保存、语音转写。
- 日历、待办、提醒或自动跟进。
- 投递来源字段或结构化 JD。
- 简历修改、自动投递或自动抓取招聘网站。

这些范围会在后续阶段单独设计，不会在 V1 中隐式上传或保留原始媒体。

## 文档

- [产品设计说明](docs/superpowers/specs/2026-07-27-job-search-loop-assistant-design.md)
- [Desktop V1 实施计划](docs/superpowers/plans/2026-07-27-desktop-v1-implementation-plan.md)
- [V1.1 加固 Backlog](docs/superpowers/plans/2026-07-27-v1-1-hardening-backlog.md)
