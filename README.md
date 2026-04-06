# openclaw-feishu-fix

给 OpenClaw 做一层可重复使用的 Feishu 诊断与修复指引工具，不维护 fork，也不要求每次升级后手工重新排查。

当前第一版聚焦两类问题：

- Feishu 聊天里 agent 无法直接发送 workspace 内的本地文件/图片
- Feishu 高频 API 调用带来的限流/噪音问题

## 设计思路

这个工具现在的主定位是“诊断器”，不是“默认直接改文件的修复器”。

它会：

1. 检测环境
- OpenClaw 版本
- 安装位置
- 平台和架构
- Feishu 相关 dist 结构是否可识别
- `getAgentScopedMediaLocalRoots` 和 `loadWebMedia` 分别落在哪个 bundle

2. 诊断问题
- `mediaLocalRoots` 是否覆盖各 agent workspace
- Feishu reply 链路是否缺少 workspace 本地媒体透传
- Feishu 高频 API 调用风险是否存在
- 当前样本 workspace 文件能否通过 OpenClaw 媒体加载验证

3. 输出指引
- 给人看的摘要
- 给 agent 读取的 JSON 结构化报告
- 针对每个问题的修复方向、目标文件和执行建议

## 命令

```bash
openclaw-feishu-fix doctor
openclaw-feishu-fix report --json
openclaw-feishu-fix guide
openclaw-feishu-fix schema
openclaw-feishu-fix apply
openclaw-feishu-fix verify
```

也可以不安装，直接在仓库里运行：

```bash
node ./bin/openclaw-feishu-fix.js doctor
node ./bin/openclaw-feishu-fix.js report --json
node ./bin/openclaw-feishu-fix.js guide
node ./bin/openclaw-feishu-fix.js schema
node ./bin/openclaw-feishu-fix.js apply
node ./bin/openclaw-feishu-fix.js verify
```

## 行为

`doctor`
- 输出人类可读的诊断摘要

`report --json`
- 输出结构化诊断结果
- 适合给用户自己的 agent 读取并据此执行修改

`guide`
- 输出人类可读的修复指引
- 明确问题、目标文件和修改方向

`schema`
- 打印 `report --json` 的 JSON schema
- 方便别人的 agent 或自动化流程做结构校验

`apply`
- 可选专家模式
- 会直接修改当前机器上的配置和运行时 bundle
- 不建议作为对外默认使用路径

`verify`
- 再次检查 patch 状态
- 跑 `openclaw config validate`
- 用 OpenClaw 自己的 `loadWebMedia` 对一个 workspace 样本文件做媒体加载验证

## 推荐使用方式

推荐流程不是让这个工具直接替用户改，而是：

1. 用户运行：

```bash
openclaw-feishu-fix report --json
```

2. 把输出交给用户自己的 agent

3. 让该 agent 根据：
- `issues[].id`
- `issues[].guidance.targetFiles`
- `issues[].guidance.instructions`

去修改用户自己的 OpenClaw

4. 修改后再运行：

```bash
openclaw-feishu-fix verify
```

这样可以把这个工具稳定地做成：
- 跨平台诊断器
- 跨版本问题探测器
- agent 可消费的修复指引源

## 兼容策略

这个工具不再按 `local-roots-*.js`、`web-media-*.js` 这种固定文件名做硬匹配。

它会优先按能力识别：

- 哪个 bundle 导出了 `getAgentScopedMediaLocalRoots`
- 哪个 bundle 导出了 `loadWebMedia`
- Feishu monitor bundle 是否已经把 `mediaLocalRoots` 透传进 `sendMediaFeishu(...)`

这意味着即便 OpenClaw 后续把 helper 从 `web-media-*` 拆到 `local-roots-*`、`local-file-access-*`，或者继续调整 bundle 命名，只要语义能力还在，`doctor`/`report` 就能继续工作。

## 输出协议

- JSON schema: [schemas/report.schema.json](/Users/mac/AI_develop/openclaw-feishu-fix/schemas/report.schema.json)
- agent 接入说明: [AGENT_INTEGRATION.md](/Users/mac/AI_develop/openclaw-feishu-fix/docs/AGENT_INTEGRATION.md)

## 支持度模型

诊断结果会给出：

- `support.status`
  - `supported`: 当前结构可稳定诊断
  - `partial`: 可诊断，但某些能力需要谨慎
  - `unsupported`: 不建议 agent 自动修改

- `support.reasons`
  - 明确说明为什么是 `partial` 或 `unsupported`

- `support.patchFamily`
  - 当前识别到的 runtime 结构族

这样用户自己的 agent 可以先判断“该不该改”，再决定“怎么改”。

## 备份

每次 `apply` 都会把原文件备份到：

```text
./.backups/<timestamp>/
```

## 当前兼容性

第一版优先面向 Homebrew / npm 全局安装的 OpenClaw，并按 runtime 能力结构检测 Feishu monitor bundle。

如果某次 OpenClaw 大版本重构导致 bundle 结构变化，`doctor`/`verify` 会先报不支持，而不是盲改。
