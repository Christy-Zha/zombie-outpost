// 游戏的所有数值配置都在这里，调平衡只改这个文件

// 存档版本号：以后改存档结构时 +1，并在 save.js 的 migrate() 里做兼容
export const SAVE_V = 6; // v6：主线从 5 章扩到 15 章（45 关），旧进度按章节换算
export const _SAVE_V5 = 5; // v5：剧情选择/结局、好感度、支线、专属技能、夜袭、炮塔、新武器
export const _SAVE_V4 = 4; // v2 装备；v3 剧情进度；v4 指挥官/天赋/武器强化/队友/剧情改为 15 关

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
  crossbow: { name: '弩',      icon: '🏹', dmg: 58, rate: 1.0, speed: 34, count: 1, spread: 0,   jitter: 0,    life: 0.62, range: 20, pierce: 6, armory: 3, color: 0xd9c27a, sound: 'bow',    desc: '安静的重箭，能穿透一整排' },
  flamer:   { name: '喷火器',  icon: '🔥', dmg: 4,  rate: 14,  speed: 13, count: 2, spread: 0.45, jitter: 0.15, life: 0.55, range: 7,  pierce: 99, armory: 5, color: 0xff7a1a, sound: 'fire', kind: 'flame', ammoCost: 0.35, desc: '近距离烧穿一大片' },
  launcher: { name: '榴弹发射器', icon: '💣', dmg: 70, rate: 0.9, speed: 18, count: 1, spread: 0,  jitter: 0.04, life: 0.95, range: 16, pierce: 0, armory: 8, color: 0x9fd36a, sound: 'launch', kind: 'grenade', ammoCost: 3, blast: 3.2, desc: '落地爆炸，范围杀伤' },
};

// 丧尸种类：from = 开局多少秒后开始出现；scrapP = 掉物资概率；scrapN = 掉落数量
export const ZOMBIES = {
  walker: { name: '丧尸',     hp: 20,   spd: 2.3, dmg: 8,  xp: 1,  scale: 1.0, tint: 0xffffff, from: 0,   scrapP: 0.2,  scrapN: 2 },
  runner: { name: '疾行者',   hp: 14,   spd: 4.0, dmg: 6,  xp: 1,  scale: 0.85, tint: 0xd8ff9a, from: 45, scrapP: 0.2,  scrapN: 2 },
  brute:  { name: '巨尸',     hp: 150,  spd: 1.5, dmg: 18, xp: 6,  scale: 1.7, tint: 0xb08a8a, from: 100, scrapP: 1,   scrapN: 6 },
  exploder: { name: '自爆者', hp: 30,  spd: 3.4, dmg: 0,  xp: 2, scale: 1.1, tint: 0xffb080, from: 70,  scrapP: 0.3, scrapN: 2, blast: 3.2, blastDmg: 34 },
  spitter:  { name: '喷吐者', hp: 26,  spd: 2.0, dmg: 6,  xp: 3, scale: 1.0, tint: 0xb0ff90, from: 90,  scrapP: 0.3, scrapN: 2, spit: 14, keep: 9 },
  screamer: { name: '尖叫者', hp: 45,  spd: 1.9, dmg: 6,  xp: 4, scale: 1.0, tint: 0xffa0c0, from: 120, scrapP: 0.4, scrapN: 3, keep: 7 },
  armored:  { name: '护甲丧尸', hp: 170, spd: 1.8, dmg: 16, xp: 6, scale: 1.15, tint: 0xa8b0b8, from: 150, scrapP: 0.8, scrapN: 4, armor: 0.4 },
  boss:   { name: '尸王',     hp: 2600, spd: 2.0, dmg: 35, xp: 40, scale: 3.2, tint: 0xff8a80, from: 9999, scrapP: 1,  scrapN: 60 },
};

// 区域：hp = 丧尸血量倍率，reward = 物资倍率
export const ZONES = [
  { name: '郊外小镇',   desc: '尸潮刚爆发的地方，适合练手',     hp: 1,   reward: 1,   ground: '#5d6b45', fog: 0x2a3024 },
  { name: '废弃商场',   desc: '商场里挤满了逛不完街的丧尸',     hp: 2.4, reward: 1.6, ground: '#6e6a62', fog: 0x2c2a2a },
  { name: '市立医院',   desc: '病人、医生……全都变了',           hp: 4,   reward: 2.4, ground: '#61707a', fog: 0x22292e },
  { name: '军事基地',   desc: '穿着防弹衣的丧尸格外难缠',       hp: 6.8, reward: 3.5, ground: '#6b6046', fog: 0x2e2a1f },
  { name: '病毒研究所', desc: '一切的源头，最强的尸王在此',     hp: 10.5, reward: 5,   ground: '#4f4a63', fog: 0x221f2b },
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
  { key: 'turret',    name: '炮塔',   icon: '🗼', max: 10, base: 120, growth: 1.6, intro: '夜袭守城时，四座瞭望塔上的炮塔会自动开火', effect: lv => `炮塔伤害 ${Math.round(12 * (1 + 0.35 * lv))}，射速 ${(2 + 0.15 * lv).toFixed(1)}/秒` },
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

// ---------- 队友（剧情同伴，出征最多带 2 人，电脑操控） ----------
// weapon：dmg 伤害 / rate 每秒发数 / range 射程 / count 每次发数 / spread 散布 / pierce 穿透
// skill：heal 治疗 / grenade 手雷 / slow 减速力场 / tank 吸引火力（血厚）/ snipe 远程穿透
export const SQUAD_MAX = 2;
export const COMPANIONS = {
  '陈医生': { model: 'c_chen', role: '医疗兵', icon: '🩺', color: 0x7fd38a, hp: 120, weapon: { dmg: 7, rate: 1.6, range: 12, count: 1 }, skill: 'heal', desc: '每 10 秒为全队回复 12% 生命' },
  '阿杰': { model: 'c_jie', role: '霰弹手', icon: '💥', color: 0xffc04a, hp: 220, weapon: { dmg: 7, rate: 1.0, range: 8, count: 4, spread: 0.5 }, skill: 'tank', desc: '血厚，丧尸更爱追着他咬' },
  '小敏': { model: 'c_min', role: '狙击手', icon: '🎯', color: 0xff8fb0, hp: 100, weapon: { dmg: 34, rate: 0.8, range: 20, count: 1, pierce: 2 }, skill: 'snipe', desc: '远距离穿透射击，专打大块头' },
  '周队长': { model: 'c_zhou', role: '机枪手', icon: '🔥', color: 0xc9b38a, hp: 180, weapon: { dmg: 5, rate: 7, range: 14, count: 1, jitter: 0.2 }, skill: 'grenade', desc: '火力压制，每 12 秒扔一颗手雷' },
  '林晓': { model: 'c_xiao', role: '科学家', icon: '🧪', color: 0xb9a0ff, hp: 110, weapon: { dmg: 9, rate: 2, range: 13, count: 1 }, skill: 'slow', desc: '身边 5 米内的丧尸减速 40%' },
};
export const COMP_MAX_LV = 20;
export const compNeed = lv => 60 + lv * 45;          // 队友升级所需经验
export const compMul = lv => 1 + 0.12 * (lv - 1);    // 队友等级对伤害/生命的加成

// ---------- 指挥官等级与天赋（每升 1 级得 1 点） ----------
export const CMD_MAX_LV = 50;
export const cmdNeed = lv => 120 + lv * 70;
export const TALENTS = [
  { key: 'hp',    icon: '❤️', name: '体魄', max: 10, desc: lv => `生命 +${lv * 6}%` },
  { key: 'gun',   icon: '🎯', name: '枪法', max: 10, desc: lv => `伤害 +${lv * 5}%` },
  { key: 'aid',   icon: '💊', name: '急救', max: 10, desc: lv => `每秒回血 +${(lv * 0.25).toFixed(2)}` },
  { key: 'move',  icon: '👟', name: '迅捷', max: 10, desc: lv => `移速 +${lv * 2}%` },
  { key: 'ammo',  icon: '📦', name: '补给', max: 10, desc: lv => `剧情关弹药 +${lv * 8}%` },
  { key: 'loot',  icon: '🔩', name: '拾荒', max: 10, desc: lv => `物资 +${lv * 6}%` },
  { key: 'lead',  icon: '🎖️', name: '统帅', max: 10, desc: lv => `队友伤害和生命 +${lv * 8}%` },
];

// ---------- 武器强化 ----------
export const WEAPON_MAX_LV = 10;
export const WEAPON_TIER = { pistol: 1, shotgun: 1.6, smg: 2.2, rifle: 3, crossbow: 1.8, flamer: 2.4, launcher: 3.4 };
export const weaponUpCost = (key, lv) => Math.round(60 * WEAPON_TIER[key] * Math.pow(1.45, lv) / 5) * 5;
export const weaponMul = lv => ({ dmg: 1 + 0.1 * lv, rate: 1 + 0.025 * lv });

// ---------- 队友专属技能（支线剧情奖励） ----------
export const PERKS = {
  doc_heal:     { who: '陈医生', name: '战地急救', desc: '治疗量 12% → 20%' },
  doc_revive:   { who: '陈医生', name: '不放弃任何人', desc: '倒地的队友 6 秒后被他自动扶起' },
  jie_pellets:  { who: '阿杰', name: '霰弹改装', desc: '每次多打 2 颗弹丸' },
  jie_armor:    { who: '阿杰', name: '防暴盾', desc: '受到的伤害降低 30%' },
  min_pierce:   { who: '小敏', name: '穿甲弹', desc: '子弹多穿透 2 个敌人' },
  min_crit:     { who: '小敏', name: '要害', desc: '25% 概率造成 2.5 倍伤害' },
  zhou_grenade: { who: '周队长', name: '重型手雷', desc: '手雷范围更大，冷却 12 → 8 秒' },
  zhou_rate:    { who: '周队长', name: '火力全开', desc: '射速 +30%' },
  xiao_slow:    { who: '林晓', name: '强效抑制剂', desc: '减速 40% → 60%' },
  xiao_vaccine: { who: '林晓', name: '试验血清', desc: '全队每秒回复 2 点生命' },
};

// ---------- 好感度 / 夜袭 ----------
export const BOND_PER_CHAT = 15;   // 每次聊天 +15
export const BOND_PER_RUN = 3;     // 带着出征一次 +3
export const RAID_EVERY = 3;       // 每出征 3 次，据点会遭遇一次夜袭
// 各模型对应的角色（没有对应模型就用替代模型）
export const ZOMBIE_MODEL = { walker: ['zombie', 'z_walker2'], runner: ['z_runner'], brute: ['mutant'], boss: ['mutant'], exploder: ['z_exploder'], spitter: ['z_spitter'], screamer: ['z_screamer'], armored: ['z_armored'] };
