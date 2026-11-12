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

## 真实模型流程
0. 自动下载：用 `--remote-debugging-port=9334` 开一个独立 Chrome 窗口进 mixamo.com，**用户本人登录**后运行 `node tools/mixamo_download.mjs`（角色/动作 id 写在脚本 JOBS 里；当前：主角 Swat、丧尸 Copzombie、变异体 Mutant）
1. 或者用户手动把 Mixamo FBX 放进 models_src/{player,zombie,mutant}/（文件名 = 动作名：player 用 idle/run/shoot/death，丧尸用 walk/run/attack/death）
2. `node tools/convert_models.mjs` → 输出 models/*.glb（自动合并动作、去根位移、减面、只留颜色贴图并存 JPEG；三个角色共约 5MB）
3. 游戏启动时 js/models.js 自动加载 models/*.glb；没有就退回方块人
- models_src/ 不进 git（Mixamo 条款不允许单独分发原始素材）；models/*.glb 是游戏运行需要的
- ⚠️ 推送到公开 GitHub 前要和用户确认：公开仓库里放 Mixamo 转换后的模型属于灰色地带（游戏里使用没问题）
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

## 平衡基准（sim.mjs，2026-11-12）
- 新手全 0 级手枪：区域 1 撑 2.5~4.5 分钟
- 军械3/训练3/医疗2 + 霰弹枪：区域 1 有机会通关
- 军械5/训练5/医疗4 + 冲锋枪：区域 2 稳定通关
