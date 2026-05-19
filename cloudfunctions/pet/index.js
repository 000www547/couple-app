/**
 * @fileoverview 宠物合养云函数
 * - 领养/喂养/抚摸虚拟宠物
 * - 饱食度每小时自然下降
 * - 好感度等级：陌生→熟悉→亲近→亲密→灵魂伙伴
 * - pet1 好感度达 80% 解锁 pet2
 * @module pet
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

// ============================================================
// 常量
// ============================================================

/** 宠物类型映射 */
const PET_TYPES = /** @type {const} */ ({
  dog: '小狗',
  rabbit: '小兔',
});

/** 抚摸冷却时间（小时） */
const PET_COOLDOWN_HOURS = 1;

/** 饱食度每小时下降值 */
const HUNGER_DECAY_PER_HOUR = 10;

/** 解锁第二只宠物所需好感度阈值 */
const PET2_UNLOCK_THRESHOLD = 80;

// ============================================================
// 类型定义
// ============================================================

/**
 * @typedef {'init'|'feed'|'pet'|'get'|'unlockPet2'|'setName'} PetAction
 * @typedef {'dog'|'rabbit'} PetType
 * @typedef {'pet1'|'pet2'} PetSlot
 * @typedef {'陌生'|'熟悉'|'亲近'|'亲密'|'灵魂伙伴'} AffectionLevel
 */

/**
 * @typedef {Object} PetEvent
 * @property {PetAction} action
 * @property {PetType} [petType]  - init/unlockPet2: 宠物类型
 * @property {string} [petName]  - init/unlockPet2/setName: 宠物名称
 * @property {PetSlot} [slot]     - feed/pet/setName: 宠物槽位
 */

/**
 * @typedef {Object} WXContext
 * @property {string} OPENID
 */

// ============================================================
// 工具函数
// ============================================================

/**
 * 从用户记录中获取当前激活的伴侣 openid
 * @param {any} userRecord
 * @returns {string|null}
 */
function getPartnerId(userRecord) {
  /** @type {string|null} */
  let pid = null;
  if (userRecord.relationships && userRecord.relationships.length > 0) {
    const active = userRecord.relationships.find(/** @param {any} r */ (r) => r.status === 'active');
    if (active) pid = active.partnerId;
  }
  if (!pid) pid = userRecord.activeRelationship || null;
  return pid;
}

/**
 * 计算当前饱食度（考虑时间流逝）
 * @param {any} pet
 * @returns {number}
 */
function calculateHunger(pet) {
  if (!pet || !pet.lastFedAt) return pet ? pet.hunger : 100;

  const now = new Date();
  const lastFed = new Date(pet.lastFedAt);
  const hoursPassed = Math.floor((now - lastFed) / (1000 * 60 * 60));

  return Math.max(0, pet.hunger - hoursPassed * HUNGER_DECAY_PER_HOUR);
}

/**
 * 根据好感度获取等级名称
 * @param {number} affection
 * @returns {AffectionLevel}
 */
function getAffectionLevel(affection) {
  if (affection >= 80) return '灵魂伙伴';
  if (affection >= 60) return '亲密';
  if (affection >= 40) return '亲近';
  if (affection >= 20) return '熟悉';
  return '陌生';
}

/**
 * 获取宠物心情 emoji
 * @param {any} pet
 * @param {PetType} petType
 * @returns {string}
 */
function getPetMood(pet, petType) {
  const hunger = calculateHunger(pet);
  const emoji = petType === 'dog' ? '🐕' : '🐰';

  if (hunger < 30) return emoji + '😢';
  if (pet.affection >= 80) return emoji + '💕';
  if (hunger > 50) return emoji + '😊';
  return emoji + '😐';
}

/**
 * 获取宠物数据（内部方法）
 * @param {string} openid
 * @returns {Promise<any|null>}
 */
async function getPetData(openid) {
  /** @type {{ data: any[] }} */
  const userResult = await db.collection('users').where({ _openid: openid }).get();
  if (!userResult.data || userResult.data.length === 0) return null;

  const partnerId = getPartnerId(userResult.data[0]);
  if (!partnerId) return null;

  const coupleId = [openid, partnerId].sort().join('_');

  /** @type {{ data: any[] }} */
  const petResult = await db.collection('pets').where({ coupleId }).get();
  if (!petResult.data || petResult.data.length === 0) return null;

  return petResult.data[0];
}

// ============================================================
// 业务函数
// ============================================================

/**
 * 初始化宠物
 * @param {string} openid
 * @param {PetEvent & WXContext} event
 */
async function initPet(openid, event) {
  const { petType, petName, slot } = event;

  if (!petType || !['dog', 'rabbit'].includes(petType)) {
    return { success: false, error: '请选择宠物类型' };
  }

  /** @type {{ data: any[] }} */
  const userResult = await db.collection('users').where({ _openid: openid }).get();
  if (!userResult.data || userResult.data.length === 0) return { success: false, error: '用户不存在' };

  const partnerId = getPartnerId(userResult.data[0]);
  if (!partnerId) return { success: false, error: '请先绑定情侣关系' };

  const coupleId = [openid, partnerId].sort().join('_');

  /** @type {{ data: any[] }} */
  const existingPet = await db.collection('pets').where({ coupleId }).get();

  const now = db.serverDate();
  /** @type {any} */
  const newPet = {
    type: petType,
    name: petName || PET_TYPES[petType],
    affection: 0,
    totalAffection: 0,
    hunger: 100,
    lastFedAt: now,
    lastPetAt: null,
    createdAt: now,
  };

  if (existingPet.data && existingPet.data.length > 0) {
    /** @type {any} */
    const petData = existingPet.data[0];
    /** @type {PetSlot} */
    const targetSlot = slot || 'pet1';

    if (targetSlot === 'pet1' && petData.pet1) return { success: false, error: '已存在第一只宠物' };
    if (targetSlot === 'pet2' && petData.pet2) return { success: false, error: '已存在第二只宠物' };

    const updateData = {};
    updateData[targetSlot] = newPet;

    await db.collection('pets').doc(petData._id).update({ data: updateData });

    return { success: true, message: '宠物创建成功', pet: newPet, slot: targetSlot };
  }

  await db.collection('pets').add({
    data: {
      coupleId,
      userId: openid,
      partnerId,
      pet1: newPet,
      pet2: null,
      createdAt: now,
      updatedAt: now,
    },
  });

  return { success: true, message: '宠物创建成功', pet: newPet, slot: 'pet1' };
}

/**
 * 获取宠物状态
 * @param {string} openid
 */
async function getPet(openid) {
  const petData = await getPetData(openid);
  if (!petData) return { success: false, error: '请先绑定情侣关系', needBind: true };

  // 计算当前饱食度和心情
  /** @type {any|null} */
  const pet1 = petData.pet1
    ? {
        ...petData.pet1,
        currentHunger: calculateHunger(petData.pet1),
        mood: getPetMood(petData.pet1, petData.pet1.type),
        affectionLevel: getAffectionLevel(petData.pet1.affection),
      }
    : null;

  /** @type {any|null} */
  const pet2 = petData.pet2
    ? {
        ...petData.pet2,
        currentHunger: calculateHunger(petData.pet2),
        mood: getPetMood(petData.pet2, petData.pet2.type),
        affectionLevel: getAffectionLevel(petData.pet2.affection),
      }
    : null;

  const canUnlockPet2 = !!(pet1 && pet1.affection >= PET2_UNLOCK_THRESHOLD && !pet2);

  return { success: true, hasPet: true, pet1, pet2, canUnlockPet2 };
}

/**
 * 投喂食物
 * @param {string} openid
 * @param {PetEvent & WXContext} event
 */
async function feedPet(openid, event) {
  /** @type {PetSlot} */
  const targetSlot = event.slot || 'pet1';

  const petData = await getPetData(openid);
  if (!petData) return { success: false, error: '还没有宠物' };

  /** @type {any|null} */
  const pet = petData[targetSlot];
  if (!pet) return { success: false, error: '该宠物槽位为空' };

  const currentHunger = calculateHunger(pet);
  const newHunger = Math.min(100, currentHunger + 20);
  const newAffection = Math.min(100, pet.affection + 2);
  const newTotalAffection = pet.totalAffection + 2;

  await db.collection('pets').doc(petData._id).update({
    data: {
      [`${targetSlot}.hunger`]: newHunger,
      [`${targetSlot}.affection`]: newAffection,
      [`${targetSlot}.totalAffection`]: newTotalAffection,
      [`${targetSlot}.lastFedAt`]: db.serverDate(),
    },
  });

  return {
    success: true,
    message: '投喂成功',
    hunger: newHunger,
    affection: newAffection,
    mood: getPetMood({ ...pet, hunger: newHunger, affection: newAffection }, pet.type),
  };
}

/**
 * 抚摸宠物
 * @param {string} openid
 * @param {PetEvent & WXContext} event
 */
async function petAnimal(openid, event) {
  /** @type {PetSlot} */
  const targetSlot = event.slot || 'pet1';

  const petData = await getPetData(openid);
  if (!petData) return { success: false, error: '还没有宠物' };

  /** @type {any|null} */
  const pet = petData[targetSlot];
  if (!pet) return { success: false, error: '该宠物槽位为空' };

  // 检查 CD（1小时）
  if (pet.lastPetAt) {
    const lastPet = new Date(pet.lastPetAt);
    const now = new Date();
    const hoursPassed = (now - lastPet) / (1000 * 60 * 60);

    if (hoursPassed < PET_COOLDOWN_HOURS) {
      const remainingMinutes = Math.ceil((PET_COOLDOWN_HOURS - hoursPassed) * 60);
      return { success: false, error: `抚摸CD中，请${remainingMinutes}分钟后再试` };
    }
  }

  const newAffection = Math.min(100, pet.affection + 3);
  const newTotalAffection = pet.totalAffection + 3;

  await db.collection('pets').doc(petData._id).update({
    data: {
      [`${targetSlot}.affection`]: newAffection,
      [`${targetSlot}.totalAffection`]: newTotalAffection,
      [`${targetSlot}.lastPetAt`]: db.serverDate(),
    },
  });

  return {
    success: true,
    message: '抚摸成功',
    affection: newAffection,
    mood: getPetMood({ ...pet, affection: newAffection }, pet.type),
  };
}

/**
 * 解锁第二只宠物
 * @param {string} openid
 * @param {PetEvent & WXContext} event
 */
async function unlockPet2(openid, event) {
  const { petType, petName } = event;

  if (!petType || !['dog', 'rabbit'].includes(petType)) {
    return { success: false, error: '请选择宠物类型' };
  }

  const petData = await getPetData(openid);
  if (!petData) return { success: false, error: '还没有宠物' };

  if (petData.pet2) return { success: false, error: '已有第二只宠物' };
  if (!petData.pet1 || petData.pet1.affection < PET2_UNLOCK_THRESHOLD) {
    return { success: false, error: `第一只好感度需达到${PET2_UNLOCK_THRESHOLD}%才能解锁第二只` };
  }

  const now = db.serverDate();
  /** @type {any} */
  const newPet2 = {
    type: petType,
    name: petName || PET_TYPES[petType],
    affection: 0,
    totalAffection: 0,
    hunger: 100,
    lastFedAt: now,
    lastPetAt: null,
    createdAt: now,
  };

  await db.collection('pets').doc(petData._id).update({
    data: { pet2: newPet2, updatedAt: now },
  });

  return { success: true, message: '第二只宠物解锁成功', pet: newPet2 };
}

/**
 * 设置宠物名字
 * @param {string} openid
 * @param {PetEvent & WXContext} event
 */
async function setPetName(openid, event) {
  const { slot, name } = event;

  if (!name || name.trim().length === 0) return { success: false, error: '请输入宠物名字' };
  if (name.length > 10) return { success: false, error: '名字不能超过10个字符' };

  /** @type {PetSlot} */
  const targetSlot = slot || 'pet1';

  const petData = await getPetData(openid);
  if (!petData) return { success: false, error: '还没有宠物' };
  if (!petData[targetSlot]) return { success: false, error: '该宠物槽位为空' };

  await db.collection('pets').doc(petData._id).update({
    data: { [`${targetSlot}.name`]: name.trim() },
  });

  return { success: true, message: '名字修改成功', name: name.trim() };
}

// ============================================================
// 云函数入口
// ============================================================

/**
 * @param {PetEvent & WXContext} event
 * @param {any} context
 */
exports.main = async (event, context) => {
  /** @type {string} */
  const openid = cloud.getWXContext().OPENID;
  /** @type {PetAction} */
  const { action } = event;

  try {
    switch (action) {
      case 'init':         return await initPet(openid, event);
      case 'feed':         return await feedPet(openid, event);
      case 'pet':          return await petAnimal(openid, event);
      case 'get':          return await getPet(openid);
      case 'unlockPet2':   return await unlockPet2(openid, event);
      case 'setName':      return await setPetName(openid, event);
      default:             return { success: false, error: '未知操作' };
    }
  } catch (error) {
    /** @type {string} */
    const msg = error.message;
    return { success: false, error: msg };
  }
};
