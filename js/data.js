// 游戏的所有数值配置都在这里，调平衡只改这个文件

// 存档版本号：以后改存档结构时 +1，并在 save.js 的 migrate() 里做兼容
export const SAVE_V = 2; // v2：新增装备（bag / gear）

// 一局时长（秒）：坚持到这个时间就算胜利撤离
export const BATTLE_TIME = 300;
// 尸王出现时间（秒）
export const BOSS_TIME = 240;

// 仓库最多存几个小时的离线产出
export const STORE_HOURS = 8;

// 武器：armory = 需要的军械库等级
export const WEAPONS = {
  pistol:  { name: '手枪',     icon: '🔫', dmg: 12, rate: 3.2, speed: 26, count: 1, spread: 0,   jitter: 0.06, life: 0.65, range: 15, pierce: 0, armory: 0, color: 0xffe27a, sound: 'shot',    desc: '均衡可靠的老伙计' },
  shotgun: { name: '霰弹枪',   icon: '💥', dmg: 9,  rate: 1.15, speed: 24, count: 5, spread: 0.6, jitter: 0.1,  life: 0.4,  range: 9,  pierce: 0, armory: 2, color: 0xffa94d, sound: 'shotgun', desc: '近距离一喷一片' },
  smg:     { name: '冲锋枪',   icon: '🔥', dmg: 6,  rate: 8.0, speed: 28, count: 1, spread: 0,   jitter: 0.22, life: 0.55, range: 14, pierce: 0, armory: 4, color: 0x8fd3ff, sound: 'smg',     desc: '弹雨压制' },
  rifle:   { name: '狙击步枪', icon: '🎯', dmg: 45, rate: 1.25, speed: 42, count: 1, spread: 0,  jitter: 0,    life: 0.6,  range: 22, pierce: 3, armory: 6, color: 0xff7a6b, sound: 'rifle',   desc: '一枪穿一串' },
};

// 丧尸种类：from = 开局多少秒后开始出现；scrapP = 掉物资概率；scrapN = 掉落数量
export const ZOMBIES = {
  walker: { name: '丧尸',     hp: 20,   spd: 2.3, dmg: 8,  xp: 1,  scale: 1.0, tint: 0xffffff, from: 0,   scrapP: 0.2,  scrapN: 2 },
  runner: { name: '疾行者',   hp: 14,   spd: 4.0, dmg: 6,  xp: 1,  scale: 0.85, tint: 0xd8ff9a, from: 45, scrapP: 0.2,  scrapN: 2 },
  brute:  { name: '巨尸',     hp: 150,  spd: 1.5, dmg: 18, xp: 6,  scale: 1.7, tint: 0xb08a8a, from: 100, scrapP: 1,   scrapN: 6 },
  boss:   { name: '尸王',     hp: 2600, spd: 2.0, dmg: 35, xp: 40, scale: 3.2, tint: 0xff8a80, from: 9999, scrapP: 1,  scrapN: 60 },
};

// 区域：hp = 丧尸血量倍率，reward = 物资倍率
export const ZONES = [
  { name: '郊外小镇',   desc: '尸潮刚爆发的地方，适合练手',     hp: 1,   reward: 1,   ground: '#5d6b45', fog: 0x2a3024 },
  { name: '废弃商场',   desc: '商场里挤满了逛不完街的丧尸',     hp: 1.8, reward: 1.6, ground: '#6e6a62', fog: 0x2c2a2a },
  { name: '市立医院',   desc: '病人、医生……全都变了',           hp: 3,   reward: 2.4, ground: '#61707a', fog: 0x22292e },
  { name: '军事基地',   desc: '穿着防弹衣的丧尸格外难缠',       hp: 5,   reward: 3.5, ground: '#6b6046', fog: 0x2e2a1f },
  { name: '病毒研究所', desc: '一切的源头，最强的尸王在此',     hp: 8,   reward: 5,   ground: '#4f4a63', fog: 0x221f2b },
];

// 基地建筑：费用 = base × growth^当前等级
export const BUILDINGS = [
  { key: 'hq',        name: '指挥部', icon: '🏛️', max: 10, base: 80, growth: 1.75, intro: '据点核心，决定其他建筑最高能升到几级', effect: lv => `其他建筑上限 Lv${lv}` },
  { key: 'armory',    name: '军械库', icon: '🔫', max: 10, base: 60, growth: 1.6,  intro: '提升火力；Lv2 霰弹枪 / Lv4 冲锋枪 / Lv6 狙击步枪', effect: lv => `攻击 +${lv * 10}%` },
  { key: 'gym',       name: '训练场', icon: '🏋️', max: 10, base: 50, growth: 1.55, intro: '锻炼体魄，提高生命上限', effect: lv => `生命上限 ${100 + lv * 20}` },
  { key: 'clinic',    name: '医疗站', icon: '🏥', max: 10, base: 70, growth: 1.6,  intro: '战斗中持续回血', effect: lv => `每秒回血 ${(lv * 0.4).toFixed(1)}` },
  { key: 'farm',      name: '农场',   icon: '🌽', max: 10, base: 40, growth: 1.5,  intro: '离线也产出食物，用来招募幸存者', effect: lv => `食物 +${lv * 20}/小时` },
  { key: 'scrapyard', name: '回收站', icon: '♻️', max: 10, base: 60, growth: 1.55, intro: '离线也产出物资', effect: lv => `物资 +${lv * 30}/小时` },
  { key: 'dorm',      name: '宿舍',   icon: '🏠', max: 10, base: 50, growth: 1.5,  intro: '能住下更多幸存者', effect: lv => `幸存者上限 ${2 + lv * 2}` },
  { key: 'radio',     name: '电台',   icon: '📡', max: 10, base: 90, growth: 1.65, intro: '收集情报，战斗中获得更多经验', effect: lv => `经验 +${lv * 8}%` },
];

// 战斗中升级时三选一的技能
export const SKILLS = [
  { key: 'dmg',     icon: '💥', name: '火力强化', max: 5, desc: '子弹伤害 +25%' },
  { key: 'rate',    icon: '⚡', name: '快速装填', max: 5, desc: '射速 +18%' },
  { key: 'multi',   icon: '🔱', name: '多重弹',   max: 4, desc: '每次多射 1 发' },
  { key: 'pierce',  icon: '🏹', name: '穿甲弹',   max: 4, desc: '子弹多穿透 1 个敌人' },
  { key: 'speed',   icon: '👟', name: '跑鞋',     max: 5, desc: '移动速度 +10%' },
  { key: 'hp',      icon: '🦺', name: '防弹衣',   max: 5, desc: '生命上限 +25 并回复 25' },
  { key: 'magnet',  icon: '🧲', name: '磁铁',     max: 4, desc: '拾取范围 +40%' },
  { key: 'saw',     icon: '🪚', name: '环绕电锯', max: 5, desc: '多一把绕着你转的电锯' },
  { key: 'molotov', icon: '🍾', name: '燃烧瓶',   max: 5, desc: '自动扔燃烧瓶，烧一片' },
  { key: 'regen',   icon: '💊', name: '急救包',   max: 5, desc: '每秒回复 1 点生命' },
];

export const SURVIVOR_NAMES = [
  '老王', '阿强', '小李', '陈医生', '刘师傅', '小雨', '大刘', '阿梅', '老周', '小飞',
  '张姐', '阿杰', '林叔', '小敏', '赵哥', '孙婆婆', '豆豆', '黑子', '阿光', '小北',
  '何老师', '阿珍', '马大厨', '小胖',
];

// ---------- 装备（击败尸王掉落） ----------
export const GEAR_SLOTS = [
  { key: 'head', name: '头盔', icon: '⛑️', main: 'hp',  names: ['破旧头盔', '防暴头盔', '战术头盔', '军用钢盔'] },
  { key: 'body', name: '护甲', icon: '🦺', main: 'hp',  names: ['皮夹克', '防刺背心', '防弹衣', '重型护甲'] },
  { key: 'acc',  name: '配件', icon: '🎖️', main: 'dmg', names: ['军牌', '战术背包', '红点瞄具', '夜视仪'] },
];
// 品质：mult = 属性倍率，extra = 额外随机属性条数，weight = 基础掉率权重
export const RARITIES = [
  { name: '普通', color: '#c9c6b8', mult: 1,   extra: 0, weight: 55 },
  { name: '精良', color: '#4da3ff', mult: 1.4, extra: 1, weight: 30 },
  { name: '史诗', color: '#b57bff', mult: 1.9, extra: 1, weight: 12 },
  { name: '传说', color: '#ff9f2e', mult: 2.6, extra: 2, weight: 3 },
];
// 装备属性：base = 普通品质、区域 1 时的数值；zone = 是否随区域变强
export const GEAR_STATS = {
  dmg:    { name: '攻击',   base: 0.05, zone: true,  pct: true },
  hp:     { name: '生命',   base: 15,   zone: true,  pct: false },
  regen:  { name: '回血/秒', base: 0.3, zone: true,  pct: false },
  rate:   { name: '射速',   base: 0.04, zone: true,  pct: true },
  speed:  { name: '移速',   base: 0.03, zone: false, pct: true },
  pickup: { name: '拾取范围', base: 0.12, zone: false, pct: true },
};
export const BAG_SIZE = 20;
