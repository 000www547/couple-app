/**
 * @fileoverview 泡芙空间 - 共享类型定义（JSDoc 格式，兼容纯 JS 环境）
 * 所有云函数共用此类型定义，确保数据结构一致
 * @module shared/types
 */

// ============================================================
// 亲密度等级
// ============================================================

/**
 * @typedef {Object} IntimacyLevel
 * @property {number} level
 * @property {number} threshold
 * @property {string} title
 */

/**
 * 亲密度等级表
 * @type {IntimacyLevel[]}
 */
const INTIMACY_LEVELS = [
  { level: 1,  threshold: 0,   title: '初识' },
  { level: 2,  threshold: 10,  title: '初识' },
  { level: 3,  threshold: 20,  title: '熟悉' },
  { level: 4,  threshold: 40,  title: '熟悉' },
  { level: 5,  threshold: 70,  title: '默契' },
  { level: 6,  threshold: 100, title: '默契' },
  { level: 7,  threshold: 150, title: '亲密' },
  { level: 8,  threshold: 200, title: '亲密' },
  { level: 9,  threshold: 300, title: '灵魂伴侣' },
  { level: 10, threshold: 500, title: '灵魂伴侣' },
];

/**
 * 根据亲密度获取等级
 * @param {number} intimacy
 * @returns {IntimacyLevel}
 */
function getIntimacyLevel(intimacy) {
  for (let i = INTIMACY_LEVELS.length - 1; i >= 0; i--) {
    if (intimacy >= INTIMACY_LEVELS[i].threshold) return INTIMACY_LEVELS[i];
  }
  return INTIMACY_LEVELS[0];
}

/**
 * 关系类型映射
 * @type {Record<string, string>}
 */
const RELATION_TYPE_NAMES = {
  couple: '情侣',
  bestie: '闺蜜/兄弟',
  family: '家人',
  custom: '自定义',
};

/**
 * 解绑等待天数
 * @type {number}
 */
const UNBIND_WAIT_DAYS = 30;

/**
 * 宠物类型名称
 * @type {Record<string, string>}
 */
const PET_TYPE_NAMES = {
  dog: '小狗',
  rabbit: '小兔',
};

/**
 * 抚摸冷却时间（小时）
 * @type {number}
 */
const PET_COOLDOWN_HOURS = 1;

/**
 * 饱食度每小时下降值
 * @type {number}
 */
const HUNGER_DECAY_PER_HOUR = 10;

/**
 * 解锁第二只宠物所需好感度阈值
 * @type {number}
 */
const PET2_UNLOCK_THRESHOLD = 80;

module.exports = {
  INTIMACY_LEVELS,
  getIntimacyLevel,
  RELATION_TYPE_NAMES,
  UNBIND_WAIT_DAYS,
  PET_TYPE_NAMES,
  PET_COOLDOWN_HOURS,
  HUNGER_DECAY_PER_HOUR,
  PET2_UNLOCK_THRESHOLD,
};
