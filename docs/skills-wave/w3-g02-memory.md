# W3 · G-02 长期记忆双端贯通 —— 复核结论与证据

> 缺口编号沿用 `docs/skills-wave/w1-architecture-spec.md`(W3 第 3 项)与 `w1-inventory.md`。
> 复核基线:`master @ 9adcf0f`(二十三轮收尾)。复核对象:`origin/cursor/agent-flow-sota-analysis-736a @ 86577d1`。
> 本文是**复核证据**,不是实现说明:G-02 已由上述分支覆盖,本槽零代码改动(不重做、不搬第二份)。

## 一、结论

| 项 | 结论 |
|---|---|
| G-02 是否仍是缺口 | **不是**。`master` 上确实只有浏览器 state 一侧;但 `origin/cursor/agent-flow-sota-analysis-736a` 的 G4 两个提交(`10566c3` 注入侧 + `93846e3` 消费侧)已把 `agentMemory` 打通到 `server.js` / `cli.js` / `mcp.js` |
| 本槽动作 | 只留复核证据。**不改代码**——再实现一遍会与该分支在 `js/wf-core.js`、`server.js`、`cli.js`、`mcp.js` 上产生纯冲突,且会出现"两端各一份召回算法",正是 W1 禁止项 |
| 该分支是否满足 W1 的 G-02 条款 | 逐条满足,见第二节;实测证据见第三节;边界与残留见第四节 |

## 二、W1 条款逐条对照

W1 规格原文(W3 第 3 项):*"`agentMemory` 的读写下沉到服务端 state 的既有同步通道(不新建存储桶),CLI 增只读/追加两个命令,MCP 增对应资源;召回策略抽为纯函数进 `skills.js` 或 `wf-core.js`,两端共用。"*

| 条款 | 落点(分支 `86577d1`) | 核对结果 |
|---|---|---|
| 召回策略抽为纯函数,两端共用 | `js/wf-core.js:73` `W.memRecall(mem, input, scope)`、`js/wf-core.js:88` `W.memBlock(...)` | 记忆数组经**参数注入**,函数体不碰 `window`/`Store`;算法字面搬移(同板块末 4 条 + 全局最近 3 条 + 关键词命中 top3,按 `text` 去重) |
| 浏览器不留第二份 | `js/agent.js:137-138` 改为 `WfCore.memRecall(memAll(), …)` / `WfCore.memBlock(memAll(), …)` 委托 | 原 20 行实现已删除,召回算法全仓只有 `wf-core.js` 一处实现,`agent.js` 只剩两行同名薄委托 |
| 读写走既有 state 同步通道,不新建存储桶 | 写:`cli.js:1397-1410` 经 `PUT /api/state` 的 `changes.meta` 桶整组替换(`rev` 乐观锁,409 重取重试 ≤3 次);读:`cli.js:1390` `stateGet` | 落点仍是 `state.agentMemory`,无新文件、无新表、无新接口 |
| CLI 增只读 + 追加两个命令 | `cli.js:1387` `CMD.memory`(`list` / `add`),用法进 help(`cli.js:1495-1496`) | `memory list [--scope 板块] [--recall 输入]`(`--recall` 预览按召回算法**实际会注入**的条目)、`memory add --text 内容 [--scope 板块]` |
| 与浏览器写入同口径 | `cli.js:1400` 条目 `{text(截 120 字), time, scope}`、`slice(-50)` | 与 `js/agent.js:128 memRemember` 同口径(截 120 字、上限 50 条、先进先出) |
| MCP 增对应资源 | `mcp.js:79` 只读资源 `hujing://memory`;`mcp.js:90` 映射到 CLI `memory list` | 助手按 URI 直读,不必记工具参数面 |
| 服务端工作流消费(贯通的实际意义) | `server.js:3296`(理解→`导演`)、`3333`(分镜→`分镜`)、`3344`(分镜内部 und 步→`导演`)、`3446`(审片逐镜→`成片`,召回输入取该镜 `plot`)、`3568`(`/api/wf/agent`→请求 `scope`) | 五处注入均走 `WfCore.memBlock(tree.agentMemory, …)`,记忆从 state 树显式取出后传参 |

计费面未被触碰:`memory list/add` 是纯 state 读写,零计费;记忆注入寄生在既有 `llm.understanding` / `llm.smartSB` / `llm.review` / `llm.agent` 动作里(浏览器侧一律 `Tasks.run` 五件套,服务端一律 `wfLLM` 计费内核 + 失败退费),未新增计费动作、未新增计费标签。

## 三、实测证据

复核在该分支的独立 worktree 上进行(`git worktree add /tmp/g02 origin/cursor/agent-flow-sota-analysis-736a`),不改动 `master`。

### 3.1 既有测试

```
node --check server.js / cli.js / mcp.js / js/wf-core.js / js/agent.js   → 全部通过
node tests/unit.js          → 201/201 PASS, 0 FAIL
node tests/integration.js   → 79/79 PASS, 0 FAIL
node tests/cli.smoke.js     → 51/53(2 项失败与本缺口无关:同一台机器上 master 同样是 51/53,
                               失败项为 whoami 退出码与 llm --json 罐头链路,属环境态,非该分支引入)
```

### 3.2 端到端记忆链路探针(仓库外脚本,不入库)

`MOCK_LLM` 看不到提示词字面,因此用**假上游截获法**取硬证据:起一个本地 HTTP 服务冒充 LLM 上游(`config.baseUrl` 指向它,`apiKey` 填假值),截获 `/chat/completions` 请求体里的 `messages`,再断言其中包含由 CLI 写入的记忆条目。数据目录与 CLI 配置目录全部指向临时路径(`MV_DATA_DIR` / `MV_CONFIG` / `HUJING_CONFIG_DIR`),不碰真实用户数据与密钥。

复现步骤:

1. 临时 `config.json`:`{"registerOpen":true,"host":"127.0.0.1","apiKey":"假值","baseUrl":"http://127.0.0.1:<假上游端口>/v1"}`;
2. 起假上游:对任意 POST 记录 `JSON.parse(body).messages`,回 `{"choices":[{"message":{"content":"<能过校验的 JSON>"}}]}`;
3. 起 `server.js`(不设 `MOCK_LLM`,让它真的去调假上游),注册用户并充值;
4. CLI `login` → `project-create` → `episode-add`;
5. CLI `memory add --text "打斗镜头一律 2 秒内切" --scope 导演`、`memory add --text "女主台词不超过 12 字" --scope 分镜`;
6. CLI `memory list`、`memory list --scope 分镜 --recall 打斗`;
7. `POST /api/wf/understanding {pid,epid}`、`POST /api/wf/agent {pid,epid,text,scope:'分镜'}`,断言截获的 `messages`。

实测输出(16/16 通过):

```
PASS | memory add(导演板块)                 {"rev":3,"total":1,"added":{"text":"打斗镜头一律 2 秒内切","scope":"导演"}}
PASS | memory add(分镜板块)                 total=2
PASS | memory list 读回两条                  total=2
PASS | memory list --recall 走召回算法        ["分镜:女主台词不超过 12 字","导演:打斗镜头一律 2 秒内切"]
PASS | 落在既有 state.agentMemory 桶          state 顶层键未新增(…,settings,tasks,team,…,agentMemory)
PASS | /api/wf/understanding 200
PASS | 理解提示词含「历史协作记忆」段
PASS | 理解提示词含 导演板块记忆条目
PASS | /api/wf/agent 200
PASS | agent 提示词含 分镜板块记忆条目
PASS | agent system 段进 messages(不再被丢弃)
PASS | WfCore.memBlock 纯函数可服务端直调
PASS | wf-core 模块内不碰 window/Store
PASS | 浏览器 agent.js 改为委托(无第二份召回实现)
```

MCP 侧单独核(服务在跑时,`resources/read`):

```
$ printf '…initialize…\n…resources/read hujing://memory…\n' | HUJING_CONFIG_DIR=<临时> node mcp.js
{"contents":[{"uri":"hujing://memory","mimeType":"application/json",
  "text":"{\"total\":2,\"list\":[{\"text\":\"打斗镜头一律 2 秒内切\",\"scope\":\"导演\"},
                                {\"text\":\"女主台词不超过 12 字\",\"scope\":\"分镜\"}]}"}]}
```

即:**CLI 写入 → 服务端既有 state 桶 → 服务端工作流提示词 → MCP 只读资源**四段全通,且浏览器侧召回算法与服务端为同一份函数。

## 四、边界与残留(如实记录,本槽不实现)

1. **记忆的"补种与迁移"仍只在浏览器发生**。`js/agent.js memAll()` 承担旧板块名迁移(`构思`→`导演`)、两条标准沉淀与知识库种子补种;CLI/服务端读写直接落 `state.agentMemory`,不跑这段。后果:纯 headless 用户的记忆里没有知识库沉淀条目,旧数据的板块名迁移要等浏览器打开一次才发生。要收口,应把补种/迁移也做成 `wf-core` 纯函数并在 `PUT /api/state` 之外的读取侧统一调用——这会改到 W2 KB 接线分支正在改的同一块手抄种子表,故本槽不动。
2. **写入面比读取面窄**。写入入口只有浏览器「记住…」与 CLI `memory add`;MCP 只有只读资源(与 W1 条款一致),`/api/wf/agent` 也不会把本轮结论自动沉淀成记忆。是否需要"服务端自动沉淀"属产品决策,不在 G-02 范围。
3. **召回输入的选取偏弱**。理解与分镜两处传的召回输入是 `ep.title`(`server.js:3296` / `3333`),关键词加权几乎无从命中,实际生效的主要是"同板块末 4 条 + 全局最近 3 条";审片逐镜传的是该镜 `plot`(`server.js:3446`),关键词分支才真正起作用。若要让正文关键词参与召回,把输入换成正文摘要即可,属一行改动,但会改变提示词字面,需要单独提交并配 fixture 断言。
4. **召回条数与 W1 措辞的差异**。W1 写的是"同板块 4 + 全局最近 4",实现是"同板块 4 + 全局最近 3 + 关键词 top3"。实现口径与浏览器原行为逐字节一致(单源搬移的前提),差异在规格措辞侧,以代码为准。
5. **两端口径缺 fixture 断言**。CLI 的 120 字截断与 50 条上限是与 `memRemember` **各写一份同口径**(注释已标注),不是共享常量;`WfCore.memRecall/memBlock` 目前也没有直接的单测断言(`tests/unit.js` 里只有经 `evolveExpert` 的间接使用)。建议在该分支合入后补一个 `wf-core` 记忆套件,断言:①同板块优先且末 4 条;②去重按 `text`;③空数组/非数组入参返回空串;④`memBlock` 段头字面;⑤CLI 追加口径与 `memRemember` 对同一输入产出同结构条目。这些断言只新增、不改现有测试。

## 五、合并次序提示(给整合这几条分支的人)

- `origin/cursor/agent-flow-sota-analysis-736a` × `origin/cursor/w2-kb-sections-wiring-4df6`:`js/agent.js` **可自动合并**(前者改 `memRecall/memBlock` 委托,后者改 `memAll()` 里的知识库种子表,不同 hunk);`js/wf-core.js` 有一处两行冲突,在 `W.sbSystem` 那一行——取 KB 接线分支的 `Prompts.get('sb.system', ov) + KB.pick('景别运镜', '轴线匹配')`,同时保留记忆分支给 `buildSBUser` 的 ctx 注释(`…conceptNote, personaNote, memText, langText…`)。合并后 `node tests/unit.js` 应仍为全绿。
- 本槽不碰 G-01(`/api/wf` 人设注入)与 G-03(`Domain.workflow` 审片升步)的任何 hunk;本文档为新增文件,与任何分支无冲突。
- `docs/skills-wave/README.md` 的索引表在 W1 分支上,合入后可补本文一行,本槽不改该文件以免与 W1 分支冲突。
