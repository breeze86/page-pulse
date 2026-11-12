# PagePulse · 页脉

[![Release](https://img.shields.io/github/v/release/breeze86/page-pulse?label=release&color=4F46E5)](https://github.com/breeze86/page-pulse/releases/latest)
[![License](https://img.shields.io/github/license/breeze86/page-pulse?color=4F46E5)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Chrome%20%7C%20Edge-4F46E5)](https://github.com/breeze86/page-pulse)
[![Manifest](https://img.shields.io/badge/manifest-v3-7C3AED)](manifest.json)
[![Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)](package.json)

> 让页面保持呼吸，按随机节奏刷新。

**[下载最新版](https://github.com/breeze86/page-pulse/releases/latest)** ·
[隐私说明](PRIVACY.md) ·
[更新日志](CHANGELOG.md) ·
[问题反馈](https://github.com/breeze86/page-pulse/issues)

![PagePulse](docs/assets/social-preview.png)

PagePulse（页脉）是一个 Chrome / Edge 扩展：**按随机时间周期自动刷新指定页面**，让需要保活的网站保持会话活跃。支持同时配置多个站点，每条规则独立计时、互不干扰；到点时如果该站点没有任何标签页，会自动在后台打开一个。

适合这些场景：需要**定时刷新网页**的在线时长统计、**自动刷新页面**防止会话掉线的管理后台、需要**页面保活**的工单系统与限时活动页，以及希望**随机间隔刷新**而不是机械固定周期的任何页面。

## English

PagePulse is a Manifest V3 extension for Chrome and Microsoft Edge that **reloads selected pages on a randomized schedule** to keep sessions alive. Configure multiple sites with independent timers; every round draws a new random delay, so refreshes never settle into a fixed pattern. If no tab matches a rule when it fires, PagePulse opens one in the background.

- Random interval per rule (default 60–120 min, configurable 30 s–24 h)
- Host / URL glob / regular-expression matching
- Skips the focused tab and tabs playing audio by default
- Multiple sites, independent timers, global pause, JSON import/export
- 100% local: no analytics, no network requests, no host permissions
- Chrome and Edge, Manifest V3, zero runtime dependencies

Download the latest zip from [Releases](https://github.com/breeze86/page-pulse/releases/latest), unzip it, then open `chrome://extensions` (or `edge://extensions`), enable Developer mode and choose **Load unpacked**.

## 功能

- **随机周期刷新**：每条规则可设置随机区间，默认 **60–120 分钟**，范围 30 秒–24 小时；每轮触发都会重新抽取延迟，不会形成固定节奏。
- **多站点独立**：一条规则对应一个站点，规则之间互不影响；可分别启停。
- **三种匹配方式**：域名（含所有子域）、URL 通配、正则表达式。
- **无标签页自动开页**：到点时若没有任何匹配标签页，自动在后台打开一个（不抢焦点）；可按规则指定启动 URL。
- **不打扰策略**：默认跳过前台聚焦的标签页与正在播放声音的标签页，也可按规则关闭。
- **弹窗快捷操作**：查看下次刷新倒计时、立即刷新、编辑或删除规则。
- **全局暂停**：一键停掉所有规则并清除定时器，恢复后重新随机排期。
- **配置导入 / 导出**：JSON 文件，支持合并或覆盖。
- **纯本地**：不收集、不上传任何数据，不请求任何页面内容。

## 为什么用随机间隔？

固定间隔的刷新会让所有触发集中在相同的节奏上，看起来更像机械轮询；随机间隔让每次刷新时间不可预测，也更接近真人浏览的自然节奏。PagePulse 的每一条规则都在上一轮结束后重新抽取延迟，而不是「固定周期 + 固定抖动」。

## 安装

### 从 Release 安装（推荐）

1. 打开 [Releases](https://github.com/breeze86/page-pulse/releases/latest)，下载最新 `page-pulse-extension-<version>.zip` 并解压。
2. Chrome 打开 `chrome://extensions`；Edge 打开 `edge://extensions`。
3. 打开「开发者模式」，选择「加载已解压的扩展程序」，选中解压后的目录。
4. 首次安装会自动打开设置页，点击「添加规则」即可开始。

> 商店版本（Chrome Web Store / Edge Add-ons）上架准备中，上架后会在 README 顶部和 Releases 中同步链接。

### 从源码加载（开发）

1. 克隆仓库。
2. 打开扩展管理页，开启「开发者模式」。
3. 「加载已解压的扩展程序」选中仓库根目录（含 `manifest.json` 的那一层）。
   也可以先执行 `npm run pack`，然后选中未压缩产物 `dist/`。

## 使用

### 添加规则

| 字段 | 说明 |
| --- | --- |
| 名称 | 仅用于展示，可留空 |
| 匹配方式 | **域名**：匹配该域名及所有子域，忽略端口<br>**URL 通配**：`*` 不跨 `/`，`**` 跨任意字符；省略路径表示任意路径<br>**正则**：对完整 URL 做不区分大小写匹配，最长 500 字符 |
| 启动 URL | 可选。无标签页时打开它；留空则按域名/通配推导，正则规则无法推导时不会自动打开 |
| 随机区间 | 秒为单位，30–86400；保存后按区间内的随机延迟排期 |
| 刷新策略 | 跳过前台 / 跳过有声 / 刷新全部匹配标签页（默认关闭）/ 绕过缓存 |

### 行为说明

- 计时使用 `chrome.alarms`，每个启用规则一个一次性定时器，触发后写入统计并随机安排下一轮。
- 到点时匹配标签页为 0 → 在最近使用的窗口后台打开启动 URL（不激活）。
- 到点时存在匹配标签页 → 按策略筛选后刷新；被跳过的标签页只记录原因，不影响下一轮。
- 同一规则匹配到多个标签页时，默认只刷新其中第一个；勾选「刷新所有匹配的标签页」才在同一轮全部刷新。
- 关闭浏览器、终止 Service Worker、重启浏览器后规则仍然生效（定时器持久化，启动时会自动对账修复）。
- 工具栏徽标显示启用中的规则数，全局暂停时显示暂停符号。

## 常见问题

**会把我正在看的页面刷掉吗？**
默认不会：规则会跳过前台聚焦的标签页和正在播放声音的标签页。需要更彻底地保活时，可以在规则里关闭这两项。

**多个同名标签页会全部刷新吗？**
默认只刷新第一个匹配标签页；在规则的「刷新策略」里勾选「刷新所有匹配的标签页」才会全部刷新。弹窗和设置页的「立即刷新」不受该选项限制，始终刷新全部符合条件的标签页。

**刷新会丢失登录状态吗？**
不会。刷新只是重新加载页面，Cookie 与登录态不受影响。但页面里**未提交的表单内容、滚动位置**会丢失，建议保持「跳过前台」开启。

**为什么最小间隔是 30 秒？**
Manifest V3 的 `chrome.alarms` 在 Chrome 120+ 的最小触发间隔是 30 秒，低于这个值的定时器不会被按时触发。浏览器或系统也可能在此基础上再延后。

**支持 Firefox 或 Safari 吗？**
目前只支持 Chromium 内核的 Chrome 与 Edge。代码没有绑定 Edge 专有 API，未来可以评估其他浏览器。

**会上传我的浏览记录或页面内容吗？**
不会。扩展只用 `tabs` 权限读取标签页 URL 做匹配，不读取页面内容、不发起网络请求，也不包含任何统计 SDK。详见 [PRIVACY.md](PRIVACY.md)。

**怎么让某个网页定时自动刷新？**
安装后打开设置页，添加规则：匹配方式选「域名」并填入站点域名，随机区间设为需要的范围（例如 300–600 秒），保存即可。到点没有打开该站点时，扩展会自动在后台打开一个标签页。

## 权限与隐私

| 权限 | 用途 |
| --- | --- |
| `alarms` | 按随机周期触发刷新 |
| `storage` | 仅在本机保存规则与统计 |
| `tabs` | 读取标签页 URL 以匹配规则，并刷新或打开标签页 |

不申请任何 host 权限，不注入内容脚本，不读取页面内容，不发送网络请求。详见 [PRIVACY.md](PRIVACY.md)。

安装时 Chrome/Edge 会提示「读取你的浏览历史」，因为 `tabs` 权限允许读取标签页地址；PagePulse 只用它做 URL 匹配，不上传、不记录。

## 开发

零依赖、无构建步骤：所有代码是原生 ES Module，直接加载即可调试。

```bash
npm test          # node --test，单元与集成测试
npm run validate  # manifest / 语言包 / 图标 / i18n key / 页面元素静态校验
npm run check     # validate + test
npm run pack      # 生成 dist/（未压缩，可直接加载）+ release/<name>.zip
npm run icons     # 重新生成图标（需要 Python + Pillow）
npm run preview   # 重新生成 README / 社交分享图（需要 Python + Pillow）
```

目录结构：

```
manifest.json
src/shared/      纯逻辑：随机、URL 匹配、状态校验、调度决策、格式化
src/background/  Service Worker：存储、定时器、刷新执行、消息路由
src/ui/          两个页面共用的样式、API 客户端与标签辅助
popup/           工具栏弹窗
options/         设置页
_locales/        zh_CN（默认）与 en
test/            单元测试与浏览器 API mock 集成测试
scripts/         校验、打包、图标与社交预览图生成
docs/assets/     README 与社交分享图
```

测试重点：

- 随机区间边界与 30 秒下限收敛
- 域名子域匹配、伪域名排除、通配与正则、非 http(s) 拒绝
- 状态校验、版本迁移、导入合并、规则上限
- 定时器对账决策表
- 标签页筛选（前台 / 有声 / loading / discarded）与无标签页开页
- 基于浏览器 API mock 的后台集成测试：保存规则 → 定时触发 → 刷新 → 统计 → 重新排期

手工验收清单：

1. 加载扩展，添加一条 30–40 秒的测试规则，观察后台标签页按随机间隔刷新。
2. 关闭该站点的全部标签页，等待到点，确认自动打开后台标签页且不抢焦点。
3. 打开 `chrome://serviceworker-internals` 终止 Service Worker，确认仍能按时刷新。
4. 重启浏览器，确认规则与倒计时仍在。
5. 切换全局暂停 / 恢复，确认刷新停止并重新排期。
6. 导出配置后覆盖导入，确认规则恢复。

## 发布

```bash
npm run check
npm run pack
```

产物：

| 路径 | 用途 |
| --- | --- |
| `dist/` | 当前版本的未压缩扩展目录（`manifest.json` 在根），可直接「加载已解压的扩展程序」 |
| `release/page-pulse-extension-<version>.zip` | 商店上传与 GitHub Release 资产 |

- **GitHub Release**：打 `v<version>` 标签，**标题只用标签名**（如 `v0.1.2`，与 GitHub 默认一致），上传 `release/page-pulse-extension-<version>.zip`；版本亮点写在正文，可直接用 [CHANGELOG.md](CHANGELOG.md) 对应版本段落。
- **Chrome Web Store**：上传 `release/page-pulse-extension-<version>.zip`，填写商店名 `PagePulse - 随机保活刷新`、简介、隐私问卷（选择「不收集用户数据」，说明 `tabs` 权限仅用于 URL 匹配）。
- **Edge Add-ons**：同一 zip 直接上传；Edge 与 Chrome 共用 MV3 API，无需额外字段。
- 版本号需同时修改 `manifest.json` 与 `package.json`（`npm run validate` 会检查一致性）。

## 已知限制

- `chrome.alarms` 最小间隔 30 秒，且浏览器/系统可能进一步延后；界面倒计时表示计划时间，不保证秒级精确。
- Chrome 119+ 不允许扩展绕过页面的 `beforeunload` 确认框，个别页面可能阻塞刷新。
- 刷新会丢失页面内的表单输入与滚动位置，这是重载的固有行为；「跳过前台」可降低影响。
- 若标签页在查询后立即关闭，刷新会失败，只影响该标签页，不影响其他标签页与下一轮排期。
- 规则配置保存在本机 `storage.local`，暂不跨设备同步。

## 路线图

- [ ] 上架 Chrome Web Store 与 Edge Add-ons
- [ ] 规则分组与快捷键手动刷新
- [ ] 按时间段/星期启用
- [ ] 刷新历史记录与统计图表
- [ ] `storage.sync` 跨设备同步（含冲突处理）

## 反馈与贡献

遇到问题或有功能建议，欢迎在 [Issues](https://github.com/breeze86/page-pulse/issues) 反馈；提交代码前请先跑 `npm run check`。

## License

[MIT](LICENSE) © 2026 breeze
