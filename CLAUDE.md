# 尸潮据点 - 项目说明

手机网页游戏（PWA）：3D 俯视角丧尸割草射击 + 基地经营。纯静态文件，无构建步骤，Three.js r160 放在 vendor/ 里（离线可用）。

## 需求定位（2026-11 与用户确认）
- 射击类、经营成长、3D；俯视角割草 + 自动瞄准；丧尸末日题材；基地建设经营
- 主要在 iPhone Safari 上"添加到主屏幕"玩，竖屏优先

## 关键约定
- 存档 key `zombie-outpost-save`，版本 `SAVE_V`（data.js）。改存档结构时 SAVE_V +1，并在 save.js `migrate()` 里兼容旧档，不能让老玩家丢档
- 发布新版本时把 sw.js 里的 `CACHE` 版本号 +1，否则手机上可能一直用旧缓存
- 数值平衡都在 data.js；battle.js 里还有几个公式：刷怪速率 `updateSpawns`、血量成长 `spawnZombie`、升级经验 `need()`
- 性能：同类物体用 InstancedMesh，丧尸上限 MAXZ=360

## 测试
- `node tools/test_save.mjs`：存档/经济逻辑
- 起服务器 `python -m http.server 8765` + 无界面 Chrome（`--remote-debugging-port=9333 --enable-unsafe-swiftshader`）后：
  - `node tools/cdp_test.mjs <截图目录>`：冒烟测试 + 截图（网址带 `#debug` 会暴露 `window.__dbg`）
  - `node tools/sim.mjs`：加速模拟多局，看平衡（机器人绕圈走）
- 注意：测试前要清掉 Service Worker 缓存，否则跑的是旧代码（脚本里已处理）

## 平衡基准（sim.mjs，2026-11-12）
- 新手全 0 级手枪：区域 1 撑 2.5~4.5 分钟
- 军械3/训练3/医疗2 + 霰弹枪：区域 1 有机会通关
- 军械5/训练5/医疗4 + 冲锋枪：区域 2 稳定通关
