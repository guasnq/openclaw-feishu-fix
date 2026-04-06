# Agent Integration

这个工具的目标不是直接替用户乱改 OpenClaw，而是给用户自己的 agent 一份稳定可消费的诊断结果。

## 推荐调用链路

1. 运行：

```bash
openclaw-feishu-fix report --json
```

2. 让 agent 读取输出中的：
- `support.status`
- `support.reasons`
- `issues[]`
- `issues[].guidance.targetFiles`
- `issues[].guidance.instructions`

3. agent 根据这些信息决定：
- 是否修改
- 改哪些文件
- 先改配置还是先改 runtime

4. 修改完后运行：

```bash
openclaw-feishu-fix verify
```

## agent 应遵守的策略

- 当 `support.status === "unsupported"` 时，不要尝试自动修改。
- 当 `support.status === "partial"` 时，只修改 `guidance.strategy === "config_update"` 这类低风险项；runtime patch 要更谨慎。
- 当 `issues` 为空时，不要重复改配置或重复打补丁。
- 当 `openclaw config validate` 未通过时，优先修配置，不要继续改 runtime。

## 适合 agent 消费的关键字段

- `summary.ok`
- `support.status`
- `support.patchFamily`
- `issues[].id`
- `issues[].severity`
- `issues[].guidance.strategy`
- `issues[].guidance.targetFiles`
- `issues[].guidance.instructions`
