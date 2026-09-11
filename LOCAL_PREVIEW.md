# 拾集 v0.3-local-preview

这是一个面向开发者和早期测试者的本地预览版，不是 Chrome Web Store 的安装即用版本。源码保留所有权利，允许个人非商业本地运行；具体限制见 [LICENSE.md](LICENSE.md)。

## 运行方式

本预览版支持两种本地运行链路：

```text
小红书页面 -> 浏览器扩展 -> 本机 FastAPI 服务 (127.0.0.1:8765) -> 你自己的模型 API
小红书页面 -> 浏览器扩展 -> 你填写的 OpenAI 兼容模型 API
```

模型费用由使用者自己的模型账号承担。拾集开发者不会在这个版本中提供云端模型额度，也不会把模型密钥提交到仓库。

## 前置条件

- Windows 10/11
- Python 3.11 或更新版本
- Chrome 或 Edge 的开发者模式
- 一个 OpenAI 兼容的模型服务地址、模型名称和 API 密钥（直接模式或本地服务模式）

只有修改源码、运行前端测试或重新打包时才需要 Node.js 和 npm。安装 Release 中的扩展 ZIP 不需要 Node.js。

## 安装步骤

1. 克隆仓库，或下载并解压 Release 的源码，进入同时包含 `manifest.json` 和 `backend/` 的项目目录。只有扩展 ZIP 时，还需要下载源码来运行本地服务。
2. 如果使用本地服务模式，安装本地服务依赖：

   ```powershell
   python -m pip install -r backend/requirements.txt
   ```

3. 如果使用本地服务模式，启动本地服务：

   ```powershell
   python -m uvicorn backend.main:app --host 127.0.0.1 --port 8765
   ```

4. 打开 `chrome://extensions/` 或 `edge://extensions/`，打开开发者模式，加载包含 `manifest.json` 的项目目录，或者加载 GitHub Release 中的扩展 ZIP 解压目录。已有安装请先阅读下方“更新和回滚”，继续使用原安装目录。
5. 打开小红书图文笔记，点击拾取入口，然后在扩展设置中选择直接模式或本地模式并填写模型配置。
6. 点击“测试连接”，确认成功后再开启 AI 整理。

## 打包本地扩展

在项目根目录执行：

```powershell
npm run build:background
npm run package:local
```

脚本会生成：

```text
dist/xhs-task-material-collector-v0.3.0.zip
dist/xhs-task-material-collector-v0.3.0.zip.sha256
```

ZIP 只包含扩展运行所需的 `manifest.json`、`src/` 和 `assets/`，不会把 Python 服务、测试夹具或仓库配置混入扩展包。

打包脚本仅允许输出到项目的 `dist/` 或其子目录，拒绝目录链接、符号链接和常见密钥文件。归档使用固定文件顺序和时间戳；在相同源码和相同 Windows PowerShell 5.1/.NET 环境中，重复运行 `npm run package:local` 会生成相同的校验值。PowerShell 7 等不同运行环境的压缩结果可能不同，请使用上述命令复现发布包。

## 数据和安全边界

- 原始素材、报告和手册保存在当前浏览器的扩展本地存储中；PNG/JPG 通过浏览器下载保存为文件，PDF 通过浏览器打印窗口保存。
- 直接模式的模型配置（包括 API 密钥）保存在浏览器扩展本地存储中；本地服务模式的配置位于本机 `%LOCALAPPDATA%\XhsTaskMaterialCollector\settings.json`。不要把任何配置文件放入源码或发布包。
- 开启 AI 后，白名单字段会发送到用户填写的模型服务；封面图片、Cookie、登录密码和小红书访问令牌不在请求白名单中。
- 当前本地预览版的 API 密钥表单仍位于小红书页面内的扩展抽屉中，因此只适合个人或受信任的本地测试，不应被描述为生产级密钥保险库。
- 不要把真实 `.env`、API 密钥、日志、个人素材或测试导出文件提交到 GitHub。
- 推荐为测试创建专用、低额度、可撤销的模型密钥。

## 已知限制

- 使用本地服务模式时，浏览器重启后需要确认本地服务仍在运行；直接模式不需要启动 Python 服务。
- 直接模式依赖模型服务允许浏览器跨域请求，并要求用户自行承担 API 账户、额度和费用。
- 当前版本不包含云端账号、额度、计费、云端历史或自动更新。
- 当前版本是解压加载的开发者预览版，不是 Chrome Web Store 的安装即用版本。

## 更新和回滚

本次发布准备不改变素材、报告和手册的数据结构。已有用户请保留同一个浏览器配置和扩展安装目录，不要先卸载扩展：

1. 更新前备份原安装目录；需要独立保留的重要报告可先导出 PDF/图片。
2. 将新包的运行文件覆盖到原安装目录，在扩展管理页点击“重新加载”，再刷新小红书页面。
3. 需要回滚时，将备份的运行文件恢复到同一个目录，再重新加载和刷新页面。

把 ZIP 解压到新目录并另行加载，可能会被浏览器识别为另一份扩展，原有手册不会自动迁移；卸载扩展也可能删除其本地数据。当前没有手册库整体备份/导入功能，导出 PDF/图片仅用于独立阅读。

## GitHub 发布说明

建议把这个版本标为 `v0.3-local-preview`，并在 Release 页面同时提供源码和上述扩展 ZIP。发布前逐项执行 [PUBLIC_SOURCE_CHECKLIST.md](PUBLIC_SOURCE_CHECKLIST.md)，并确认 `LICENSE.md` 中的版权主体为 `linadun78-hash`。作品集应链接到 Release，而不是把本地 `127.0.0.1` 地址作为公开演示地址。
