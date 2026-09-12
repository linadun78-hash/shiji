# 拾集：小红书任务素材助手

## 当前发布线：`v0.3-local-preview`

本项目源码保留所有权利，具体使用范围见 [LICENSE.md](LICENSE.md)。公开仓库
仅用于源码查看、评估和个人非商业本地运行；除下载、安装、构建、备份和个人本地运行所需的必要复制外，不授予对外传播、商用或重新打包权利。

面试展示可先阅读 [产品 PRD 与项目复盘](docs/PRD.md)。

仓库当前提供的是本地开发者预览版。普通用户应优先使用扩展直接连接 OpenAI 兼容模型服务；`127.0.0.1:8765` 的 FastAPI 本地模式仅用于开发诊断和跨域排查，当前未完成真实端到端验收，不应视为同等稳定的用户运行路径。它不是 Chrome Web Store 的安装即用版本。完整安装、打包和隐私边界请先阅读 [LOCAL_PREVIEW.md](LOCAL_PREVIEW.md)。

直接连接模型的 BYOK 模式已经包含在本地预览版中；云端账号、额度、计费、云端历史和自动更新仍未提供。

拾集是一个 Chrome/Edge Manifest V3 浏览器扩展。用户在小红书图文笔记页主动点击“识别并拾取”后，原始素材会先保存到当前任务，Agent 1 再自动把单条素材整理为带原文引用的结构化摘要。

它不是收藏夹自动扫描器，也不会在用户浏览时自动保存内容。当前版本包含 Agent 1 单条素材自动整理，以及由用户填写目标、选择素材后主动触发的 Agent 2 目的型报告。

## 当前流程

1. 用户打开一篇小红书图文笔记并点击“识别并拾取”。
2. 标题、正文、作者、封面和本地回看地址立即进入当前任务素材箱。
3. 用户首次点击“开启 AI 自动整理”，完成一次性隐私确认。
4. 之后每次手动拾取都会非阻塞触发 Agent 1，原始素材保存不等待模型。
5. 素材卡显示“等待 AI 整理”“AI 整理中”“已整理”“原文不足”或“整理失败”。
6. 成功结果包含一句话概括、关键信息、作者观点、步骤、对象、注意事项和待确认信息。
7. `[E1]` 等引用可在“查看原始摘录”中逐条核验。
8. 素材卡默认折叠，可单条或全局展开；原始摘录继续作为二级折叠。
9. 在“报告”页填写目标并选择至少两条已整理素材，再选择自动识别/教程/旅行/通用、零基础/有一点了解，以及是否允许 AI 补充。
10. AI 补充默认关闭；开启后只会出现在“AI 补充・待核实”区块，不绑定素材引用，也不会混入素材结论。
11. 教程报告首先展示“开始操作”：用途、具体操作、完成检查、失败处理和素材来源；素材没写的步骤会明确留空。
12. 报告失败不会覆盖上一次成功结果；来源区会显示素材标题和实际引用片段。

重复拾取同一笔记会更新原始素材；正文变化后旧摘要失效并重新整理。刷新页面、关闭笔记或重新打开素材箱后，任务、原文和 AI 状态仍保存在扩展本地存储中。

## 数据与权限

当前开发清单声明以下权限：

- `storage`：保存任务、原始素材和 AI 整理状态。
- `downloads`：将报告图片保存到浏览器下载目录。
- `https://www.xiaohongshu.com/*`：在小红书网页显示拾取入口并读取当前可见图文笔记。
- `http://127.0.0.1:8765/*`：本地模式下由 Service Worker 调用用户本机的 Agent 1 服务。
- `identity` 和 `https://*.auth0.com/*`：用于云端登录试验；云端登录功能默认未启用，但这些权限仍会随开发版 manifest 静态声明。本地模式不使用这两个权限连接账号服务。

云端模式的 API 地址必须在发布前写入扩展的 `host_permissions`，并且只能使用 HTTPS；不要把任意生产域名直接加入开发包。

发送给模型服务的白名单字段只有：素材 ID、标题、公开作者昵称、正文、安全来源地址、拾取时间和内容哈希。作者字段是笔记页面公开展示的昵称，不是当前登录账号。

以下内容不会发送：

- 本地回看地址 `openUrl`
- `xsec_token` 和 `xsec_source`
- Cookie、当前登录账号或密码
- 封面和笔记图片

为减少“打开原文”跳到扫码页，扩展会在浏览器本地保存当前笔记链接中的最少回看参数。它们仅用于用户点击“打开原文”，不会进入 Agent 请求。

## 安装后端

在本目录执行：

```powershell
python -m pip install -r backend/requirements.txt
```

启动后可在扩展标题栏点击齿轮，在内嵌设置页测试并保存 OpenAI 兼容模型服务。直接模式的配置保存在浏览器扩展本地存储中；本地服务模式的配置保存在当前系统用户的本地应用数据目录。密钥不会写入仓库或截图。环境变量仍可用于开发，并优先于本地设置：

```powershell
$env:XMC_LLM_BASE_URL='https://your-provider.example/v1'
$env:XMC_LLM_API_KEY='your-local-key'
$env:XMC_LLM_MODEL='your-model-name'
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8765
```

报告提示词默认使用 `modular_v1`。需要回滚本轮提示词、但保留新旧报告和素材时，可在启动服务前设置：

```powershell
$env:XMC_REPORT_PROMPT_VERSION='legacy'
```

恢复新提示词时改回 `modular_v1`。这是内部回滚开关，不在普通用户界面展示。

健康检查：

```powershell
Invoke-RestMethod http://127.0.0.1:8765/health
```

应返回 `status: ok` 和 `agent: material-organizer`。未配置模型时健康检查仍可用，整理接口会明确返回 `llm_not_configured`，不会伪造摘要。

## 云端登录试验（默认关闭）

本轮只加入可回滚的账号与鉴权切片，默认仍是本地模式，已有素材箱、Agent 1、Agent 2 和本地模型设置不变。云端模式使用 Auth0 Universal Login 的 Authorization Code + PKCE，以及服务端 JWT 校验；扩展包不保存密码、Client Secret、模型 API Key 或 Management API Token。

### 预览

不需要真实账号即可查看云端账号面板：打开 [docs/ui-preview.html](docs/ui-preview.html) 后点击“查看云端账号预览”，或直接打开 `docs/ui-preview.html?account=cloud`。预览中的账号、登录和退出动作都是静态演示，不会连接 Auth0。

不调用真实模型也可以查看教程报告的最小结果：打开同一页面后点击“查看教程拆解预览”，或直接打开 `docs/ui-preview.html?report=tutorial`。该预览使用真实扩展渲染代码和静态示例数据，用于检查“开始操作”页、五页结构与导出入口；它不代表模型语义质量已经验收。

### 部署配置

1. 在 [src/runtime-env.js](src/runtime-env.js) 写入构建时的公开值：`mode: 'cloud'`、HTTPS `apiBaseUrl`、Auth0 `domain`（不带协议）、公开 `clientId` 和 `audience`。不要写入任何密钥。
2. 在 Auth0 应用中把 `chrome.identity.getRedirectURL("auth0")` 返回的完整地址加入 Allowed Callback URLs；通常形如 `https://<extension-id>.chromiumapp.org/auth0`。同时配置 Refresh Token Rotation。
3. 将生产 API origin 加入 `manifest.json` 的 `host_permissions`，再运行：

   ```powershell
   npm run build:background
   ```

   重新加载解压扩展并刷新小红书页面。云端登录按钮只在 `mode: 'cloud'` 且配置完整时启用。
4. 云端后端只在服务端设置以下环境变量，模型供应商密钥仍沿用服务端环境变量或 Secret Manager：

   ```powershell
   $env:XMC_AUTH_REQUIRED='true'
   $env:XMC_AUTH0_ISSUER='https://your-tenant.auth0.com/'
   $env:XMC_AUTH0_AUDIENCE='https://api.example.com'
   $env:XMC_AUTH0_JWKS_URL='https://your-tenant.auth0.com/.well-known/jwks.json'
   ```

   `/health` 保持匿名可用；素材整理、目的型报告和云端导出接口要求 Bearer JWT。本地设置接口在鉴权开启时不会暴露。

### 回滚

将 [src/runtime-env.js](src/runtime-env.js) 的 `mode` 改回 `'local'`，恢复本地 API 地址，运行 `npm run build:background` 并重新加载扩展；服务端将 `XMC_AUTH_REQUIRED` 设为 `false` 或移除即可。这个回滚不会删除本地素材、报告或历史，也不会改变 Agent 1/2 的请求合同。

本切片尚未包含真实 Auth0 租户、云端 API 部署、用量/计费和云端历史；这些属于下一阶段，不应把示例值直接用于生产。

## 安装扩展

### Chrome

1. 打开 `chrome://extensions/`。
2. 开启“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择同时包含 `manifest.json` 和 `src/` 的目录；下载扩展 ZIP 时选择它的解压目录。
5. 代码更新后，在扩展卡片点击“重新加载”，再刷新小红书页面。

### Edge

1. 打开 `edge://extensions/`。
2. 开启“开发人员模式”。
3. 点击“加载解压缩的扩展”。
4. 选择同时包含 `manifest.json` 和 `src/` 的目录；下载扩展 ZIP 时选择它的解压目录。
5. 代码更新后重新加载扩展并刷新小红书页面。

## 验证 AI 结果

- 先看素材卡的一句话概括和分组字段。
- 每条模型结论后的 `[E1]`、`[E2]` 是它附带的原文引文编号。
- 系统只确定性校验引文逐字存在于正文，不会自动证明引文在语义上充分支持结论；展开“查看原始摘录”后需要人工抽查。
- “待确认信息”表示正文没有提供，不能被当成事实补写。
- “原文不足”不会显示摘要；“整理失败”不会删除已保存的原始素材。
- 可重试失败会显示“重新整理”。

## 技术结构

| 模块 | 实际作用 | 产品边界 |
|---|---|---|
| `src/xhs-adapter.js` | 读取当前可见图文笔记 | 不扫描收藏夹，不调用小红书非公开接口 |
| `src/material.js` | 清洗字段、稳定去重和内容哈希 | 原始素材不混入 AI 状态 |
| `src/repository.js` | 保存任务和原始素材 | 使用 `xhsCollectorState` |
| `src/analysis-repository.js` | 保存同意、状态和结果 | 使用独立 `xhsAnalysisState`，后台串行写入 |
| `src/analysis-client.js` | 构造白名单请求 | 排除回看地址、token、Cookie 和图片 |
| `src/analysis-coordinator.js` | 单并发处理素材 | 失败保留原文，不生成兜底摘要 |
| `src/workbook-export.js` | 浏览器内生成报告 PNG/JPG 并下载 | 不上传报告 HTML，不创建中间 PDF |
| `src/background.js` | Service Worker 接线和中断恢复 | Content Script 不直接写 AI 结果 |
| `backend/models.py` | Pydantic 输入输出合同 | 拒绝额外字段和未知证据编号 |
| `backend/service.py` | 证据校验、一次修复和一次重试 | 引用必须逐字存在于正文 |
| `backend/report_prompts.py` | 组合报告类型、熟悉程度和补充模式规则 | 素材正文不能改变系统规则 |
| `backend/report_service.py` | 校验来源、用户要求、补充内容和数字/时间/版本 | 未通过时修复一次，仍失败则不写入新报告 |
| `backend/main.py` | FastAPI 健康与整理接口 | 安全错误不回显非法原始输入 |

## 自动化验证

```powershell
python -m pytest backend/tests -q
npm test
node --check src/material.js
node --check src/repository.js
node --check src/analysis-repository.js
node --check src/analysis-client.js
node --check src/analysis-coordinator.js
node --check src/background.js
node --check src/ui-model.js
node --check src/content.js
```

真实闭环检查见 [manual-test-checklist.md](docs/manual-test-checklist.md)，20 条 Agent 质量评估见 [agent1-evaluation.md](docs/agent1-evaluation.md)。

真实多素材报告复跑使用 `scripts/run_reliability_acceptance.py`。它依赖安装清单中的 `psutil` 比较每次模型调用前后的 `rundll32.exe` PID；无法监测或 PID 发生变化时会停止后续调用，使用方式见 [report-reliability-evaluation.md](docs/report-reliability-evaluation.md)。

## 已知边界

- 当前只支持图文笔记详情页，不处理视频字幕、语音和图片 OCR。
- 页面没有加载出的内容无法读取。
- 小红书页面结构变化后，页面适配器可能需要更新。
- 访问受限或要求扫码的笔记无法由扩展绕过平台验证。
- Agent 2 已完成结构和交互接线，但报告质量仍需使用真实多素材任务单独验收，自动化测试不能代替内容质量结论。
- 固定评测集会执行真实请求与提示词组装，但尚未自动调用付费模型；引用是否在语义上充分支持结论仍需人工核验。
- 报告支持通过“导出 PDF”调用浏览器原生打印；“导出图片”在扩展内部生成 PNG 或 JPG，按页保存，不请求本机图片后端，也不创建中间 PDF。转换逻辑随扩展市场版本一起更新。
- 后端 `/api/v1/experimental/workbook-images` 仅保留给开发诊断和回滚，正式扩展图片入口不会调用它。
