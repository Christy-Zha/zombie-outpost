# 尸潮据点 - 项目说明

手机网页游戏（PWA）：3D 俯视角丧尸割草射击 + 基地经营。纯静态文件，无构建步骤，Three.js r160 放在 vendor/ 里（离线可用）。

## 需求定位（2026-11 与用户确认）
- 射击类、经营成长、3D；俯视角割草 + 自动瞄准；丧尸末日题材；基地建设经营
- 主要在 iPhone Safari 上"添加到主屏幕"玩，竖屏优先

## 后续需求（2026-11-12 用户确认）
- 操作：默认自动瞄准；手机右半屏拖动 = 手动瞄准；电脑 WASD 移动 + 按住鼠标瞄准
- 尸王：不打也能通关（普通奖励），打掉掉装备（头盔/护甲/配件，4 档品质）
- 画面：用户要**写实模型**（像《生化危机》），选了 Mixamo；由用户自己登录下载 FBX（我们没有账号）
- 玩法：新增主线剧情《启明之殇》（原创，制药公司阴谋，5 章），保留割草自由出征
- 不照搬任何现成游戏的人物/剧情

## 第三轮需求（2026-11-12）
- 剧情扩到 15 关（5 章×3 关，4 种关卡：collect/defend/rescue/boss），关卡内无线电字幕
- 队友：最多 2 人，电脑操控，可升级/训练；被打倒可扶起；营救关被救的人临时跟随
- 成长：指挥官等级+7 项天赋、武器强化（≤军械库+2）、队友等级
- 据点和战斗场景改为写实（Poly Haven CC0 贴图+道具，assets/ 进仓库）
- 难度提高（剧情关摸黑走得慢、搜索/解救要读条、丧尸从前方冒出）
- **GitHub：公开仓库，但不带 Mixamo 模型**（models/*.glb 在 .gitignore；手机上是方块人物）

## 第四轮（2026-11-12）：真实人物上手机 + 更多剧情玩法
- 用户要求手机上也是真实人物；选了“模型放私有仓库、自动发布”，并说“自己选推荐的，做好就发布”
- 发布：私有仓库 Christy-Zha/zombie-outpost-models 放 models/*.glb；公开仓库 .github/workflows/pages.yml 用只读部署钥匙（secret MODELS_DEPLOY_KEY）取模型，组装 _site 发布 Pages（build_type=workflow）
  - **更新模型流程**：convert_models.mjs → 把 models/*.glb 复制到 D:\MYGithub\zombie-outpost-models 提交推送 → 再推一次本仓库（或手动运行 workflow）触发发布
- 新角色（只下 1 个动作，其余借 player/zombie 的，见 models.js SHARE_FROM / rotOnly）：c_chen/c_jie/c_min/c_zhou/c_xiao、z_walker2/z_runner/z_exploder/z_spitter/z_screamer/z_armored；启动只加载核心 3 个，其余 ensureModels 按需加载
- 转换注意：骨骼名统一成 mixamorig 前缀；大贴图异步加载要等；Mixamo 导出 product_name 只能用英文
- 新玩法：4 种新敌人（data.js ZOMBIES）、3 把新武器（kind: flame/grenade、ammoCost）、炮塔建筑、夜袭（battle.js raid / base.js buildCompound）、剧情选择（对白里的 ['?',提示,选项] 和 {if} 条件台词）+ ENDINGS、支线与好感（js/side.js）、专属技能 PERKS
- 存档 v5：story.flags/ending/endings、bond、chat、sideDone、perks、raid
- 测试：tools/extra_test.mjs（夜袭/闲聊/支线）；story_test 会自动选剧情选项

## 第五轮（2026-11-12）：主线扩到 15 章
- 用户嫌剧情短（以为是 15 章，其实原来是 5 章 × 3 关）→ 扩成 15 章 × 3 关 = 45 关
- 原有 5 章变成新第 1、4、7、10、15 章；新写 10 章（赵师傅、苏青、何院长、唐处长、江雨等新角色）；新选择 keepManifest/blowLine、suStays/suWithUs、witnessHe/judgeHe、saveTang/leftTang、purgeTanks/keepBody；新结局「黎明」= handToArmy + saveTang
- 存档 v6：旧进度用 save.js `oldStageToNew()` 换算（从最后打完的旧章节之后接着玩，不跳过新章节）
- 关卡数值按原难度曲线拉伸到 45 关（后期 +10%），章节奖励见各章 reward
- 主线列表：已通关章节折叠（点标题展开重玩），未解锁只显示下一章
- sim_story 关卡：1-1、3-3、4-3、7-3、9-3、10-3、13-3、15-3

## 写实场景素材
- `node tools/env_assets.mjs`：从 Poly Haven 下载 → 减面+清理顶点 → 贴图 512px JPEG，输出 assets/env/*.glb、assets/tex/*.jpg（共约 4MB）
- js/env.js：`pbr(贴图名)` 写实材质、`prop()` 单个道具、`propInstances()` 批量道具（InstancedMesh）
- 据点建筑用 base.js 的 `bake()` 把同材质零件合并（几百次绘制 → 几十次）；阴影只在建筑变化时重算（shadowMap.autoUpdate=false）

## 真实模型流程
0. 自动下载：用 `--remote-debugging-port=9334` 开一个独立 Chrome 窗口进 mixamo.com，**用户本人登录**后运行 `node tools/mixamo_download.mjs`（角色/动作 id 写在脚本 JOBS 里；当前：主角 Swat、丧尸 Copzombie、变异体 Mutant）
1. 或者用户手动把 Mixamo FBX 放进 models_src/{player,zombie,mutant}/（文件名 = 动作名：player 用 idle/run/shoot/death，丧尸用 walk/run/attack/death）
2. `node tools/convert_models.mjs` → 输出 models/*.glb（自动合并动作、去根位移、减面、只留颜色贴图并存 JPEG；三个角色共约 5MB）
3. 游戏启动时 js/models.js 自动加载 models/*.glb；没有就退回方块人
- models_src/ 不进 git（Mixamo 条款不允许单独分发原始素材）；models/*.glb 是游戏运行需要的
- 公开仓库**不带** Mixamo 模型（models/*.glb 已从 git 历史清除），模型在私有仓库，发布时合并
- 用真实模型时割草模式同屏上限 45 只（battle.js maxZ），剧情模式按章节 maxAlive

## 关键约定
- 存档 key `zombie-outpost-save`，版本 `SAVE_V`（data.js）。改存档结构时 SAVE_V +1，并在 save.js `migrate()` 里兼容旧档，不能让老玩家丢档
- 发布新版本时把 sw.js 里的 `CACHE` 版本号 +1，否则手机上可能一直用旧缓存
- 数值平衡都在 data.js；battle.js 里还有几个公式：刷怪速率 `updateSpawns`、血量成长 `spawnZombie`、升级经验 `need()`
- 性能：同类物体用 InstancedMesh，丧尸上限 MAXZ=360（方块人）
- 剧情数据在 js/story.js（对白、目标、难度、奖励）；存档 v3 新增 story.done

## 测试
- `node tools/test_save.mjs`：存档/经济逻辑
- 起服务器 `python -m http.server 8765` + 无界面 Chrome（`--remote-debugging-port=9333 --enable-unsafe-swiftshader`）后：
  - `node tools/cdp_test.mjs <截图目录>`：冒烟测试 + 截图（网址带 `#debug` 会暴露 `window.__dbg`）
  - `node tools/sim.mjs`：加速模拟多局，看平衡（机器人绕圈走）
  - `node tools/story_test.mjs <截图目录> [章节号]`：剧情模式整章流程
- 注意：测试前要清掉 Service Worker 缓存，否则跑的是旧代码（脚本里已处理）

## 平衡基准（2026-11-12 第三轮）
- `node tools/sim_story.mjs [局数]`：新手/初期/中期/后期 × 1-1、1-3、2-3、3-3、4-3、5-3
  - 新手只能过 1-1；初期能过第一、二章，卡零号病人；中期能过零号病人，秦锋五五开；后期才能过韩振
- 割草（sim.mjs）：新手 2~3.5 分钟；军械3 霰弹枪偶尔通关区域 1；军械5 冲锋枪打区域 2 约三胜二

## 平衡基准（sim.mjs，2026-11-12 第一轮，已过时）
- 新手全 0 级手枪：区域 1 撑 2.5~4.5 分钟
- 军械3/训练3/医疗2 + 霰弹枪：区域 1 有机会通关
- 军械5/训练5/医疗4 + 冲锋枪：区域 2 稳定通关
