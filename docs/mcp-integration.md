# simple-rag MCP 接入指南

让 Claude Code / Cursor / Codex 检索你的私人知识库。

## 1. 生成 token

登录 Web UI → Settings → MCP Tokens → 生成。明文 token **仅显示一次**，立即复制。

> 也可通过 API 生成（需 JWT）：
> ```bash
> curl -X POST https://kb.meimaobing.ai/api/mcp-tokens \
>   -H "Authorization: Bearer <JWT>" \
>   -H "Content-Type: application/json" \
>   -d '{"label":"Claude Code @ MBP"}'
> ```

## 2. 配置 harness

把 `<YOUR_TOKEN>` 替换为步骤 1 拿到的明文。

### Cursor（`.cursor/mcp.json`）

```jsonc
{
  "mcpServers": {
    "kb": {
      "url": "https://kb.meimaobing.ai/api/mcp",
      "headers": { "Authorization": "Bearer <YOUR_TOKEN>" }
    }
  }
}
```

### Codex（`.codex/config.toml`）

```toml
[mcp_servers.kb]
url = "https://kb.meimaobing.ai/api/mcp"
headers = { Authorization = "Bearer <YOUR_TOKEN>" }
```

### Claude Code（`.mcp.json`）

```jsonc
{
  "mcpServers": {
    "kb": {
      "url": "https://kb.meimaobing.ai/api/mcp",
      "headers": { "Authorization": "Bearer <YOUR_TOKEN>" }
    }
  }
}
```

## 3. 可用工具

| 工具 | 用途 |
|------|------|
| `search` | 混合检索（向量 + 关键词 RRF 融合），主力检索工具 |
| `keyword_search` | 纯关键词（trigram），快，适合精确术语/代码标识符 |
| `list_documents` | 列出知识库中的所有文档 |
| `read_chunk` | 读取指定片段的完整内容 |

## 4. 验证连接

配置后，在 harness 对话里问：

- 「我的知识库里有哪些文档？」→ 触发 `list_documents`
- 「关于 RAG 架构有什么记录？」→ 触发 `search`

## 安全

- 每个 token 绑定一个 user，**仅能检索该用户的数据**（多租户隔离）
- token 在 DB 中只存 SHA-256 哈希，明文仅创建时可见
- token 可随时吊销（Settings → MCP Tokens，或 `DELETE /api/mcp-tokens/:id`）
- 建议按设备/用途分 token，便于单独吊销
- 失效 token 统一返回 401，不区分「不存在」vs「已吊销」（防信息泄漏）
