# AI 助手接入指南(cli.js / mcp.js)

面向 Codex / Claude Code / Kimi Code / Trae / Cursor 等 AI 编码助手：零配置识别本仓库的机读入口，把 剧本→主体→分镜→生成→审片→成片→发版 全链路作为工具调用。

## 三种接入方式(按推荐排序)

### 1. MCP server(mcp.js,支持 MCP 的客户端)

```json
{ "mcpServers": { "hujing": { "command": "node", "args": ["C:/Users/EDY/modelvideo-hujing/mcp.js"] } } }
```

- 31 个工具(`hujing_*`),stdio 传输,零依赖;工具调用 = 包装 cli.js,计费/幂等/退费语义与 CLI 完全一致。
- 工具结果:stdout 纯 JSON 原样透传;非零 exit 时 `isError:true` 并附 exit code 语义。
- resources:只读状态直读——`hujing://projects`、`hujing://project/{pid}/show`、`hujing://project/{pid}/workflow`、`hujing://project/{pid}/episode/{epid}/workflow`,不必记工具参数面。
- prompts:`hujing_new_drama`(新剧开工流程)/`hujing_failed_shots`(失败镜排查流程)两个模板,一次拿到正确的工具调用序列。

### 2. CLI 直接调用(任何能跑 shell 的助手)

```bash
node cli.js <命令> [位置参数] [--选项]
```

- **stdout 恒为 JSON**(`--pretty` 美化);进度/日志一律走 stderr——只解析 stdout 即可。
- **exit code**:0 成功 | 1 通用 | 2 参数 | 3 未登录 | 4 不存在 | 5 服务端/上游 | 6 积分不足 | 7 冲突。
- `node cli.js help` 输出完整命令表(stderr)。

### 3. 裸 HTTP(.cli.js 只是编排层)

全部能力都是 `server.js` 的 REST API(见 README 的 API 表);CLI 不绕过任何服务端纪律。

## 前置条件

```bash
node server.js                              # 启动后端(默认 127.0.0.1:8000)
node cli.js login --username u --password p # 登录,凭据存 ~/.hujing/config.json
```

环境变量 `HUJING_SERVER` / `HUJING_TOKEN` 优先于配置文件;`HUJING_CONFIG_DIR` 可整体换配置目录(多账号/测试隔离)。

## 典型工作流范式

### 范式 A:从剧本文件到成片(全链)

```bash
PID=$(node cli.js project-create --name 我的剧 --script-file script.txt | node -pe "JSON.parse(require('fs').readFileSync(0)).pid")
node cli.js workflow $PID                                  # 看下一步推荐(随时可查)
node cli.js project-script $PID --script-file script.txt   # 补写整部剧本原文(project-create 已带 --script-file 时可跳过)
node cli.js exec project.splitEpisodes --args "{\"pid\":\"$PID\"}"   # 整部剧本一键拆集(已有分集要加 overwrite,加 local 强制段落均分零计费)
node cli.js episode-script $PID <epid> --content-file ep1.txt   # 或逐集手写剧本(contentRev+1,下游自动判旧)
node cli.js subject-add $PID --name 女主 --gen-image       # 建主体+生成参考图(空主体库=每镜换脸)
node cli.js exec episode.generateStoryboard --args "{\"pid\":\"$PID\",\"epid\":\"<epid>\"}"  # 智能分镜(服务端工作流)
node cli.js shots $PID <epid>                              # 检查分镜表
node cli.js shot-set $PID <epid> 1 --patch '{"prompt":"..."}'  # 精修单镜
node cli.js shot-confirm $PID <epid> 1                     # 逐镜确认(批量只跑已确认镜)
node cli.js exec episode.generateVideos --args "{\"pid\":\"$PID\",\"epid\":\"<epid>\"}"   # 批量出片(未确认跳过)
node cli.js exec episode.smartReview --args "{\"pid\":\"$PID\",\"epid\":\"<epid>\"}"      # 整集审片
node cli.js compose $PID <epid>                            # 合成成片
node cli.js release-check $PID --with-billing              # 发布门 10 项检查
node cli.js release $PID --note "首版"                      # 打版本
node cli.js export $PID <epid> --out ./dist                # 下载 mp4+srt
```

### 范式 B:断点与异常恢复

- 生成中断/刷新 → `node cli.js jobs` 看在途任务 → `node cli.js wait <taskId>` 续查(已成功直接落片,**不重复扣费**)。
- 批量失败 → `node cli.js gen-episode $PID <epid> --failed-only` 只重跑失败镜。
- 命令返回 `blocked` → 读 `error.code`:`unconfirmed`(有镜未确认,`--confirm-all` 或逐镜 confirm)/`no-credits`(exit 6,先充值)/`no-script`(先写剧本)。

### 范式 C:统一领域命令(exec)

与前端 `Commands.execute` 同名同结构 `{ok,status,result,error,cost,next}`:
`episode.preflight`(就绪检查,免费)/ `episode.generateStoryboard` / `episode.understanding` / `episode.generateVideos` / `episode.smartReview` / `episode.compose` / `episode.produce`(一键编排)/ `shot.generateVideo`。
每个结果带 `next` 字段=下一步推荐,Agent 可据此自驱推进主线。

## 计费与安全约定

- 生成/审片/合成类均为**真实计费**调用,服务端按动作白名单定价(客户端标签不参与定价);失败自动退费,取消视频任务自动退款。
- 全部生成类调用携带 operationId 幂等键:断网重试/重复提交安全,不会双扣。
- 状态写走 rev 乐观锁:409 冲突 CLI 自动重取回放补丁重试(≤3 次),不会重做收费调用。
- 不要绕过 CLI 直接 PUT state 做生成类操作(会丢计费/幂等);`state-get/state-put` 是逃生舱,仅限调试。

## 排错速查

| 症状 | 处理 |
|---|---|
| exit 3 | `node cli.js login` 重新登录 |
| exit 6 | 积分不足:`node cli.js credits` 查余额,充值后原命令重跑(幂等) |
| exit 7 | 状态冲突或命令在执行中,稍后重试 |
| "无法连接服务端" | 先 `node server.js`;`--server` 或 `HUJING_SERVER` 指向正确地址 |
| unsupported-in-cli | 该命令已服务端化;旧版 CLI 请升级本仓库 |
