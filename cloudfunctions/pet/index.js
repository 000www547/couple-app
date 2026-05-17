// 云函数：宠物管理
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

// 宠物类型
const PET_TYPES = {
  dog: '小狗',
  rabbit: '小兔'
};

// 好感度等级
function getAffectionLevel(affection) {
  if (affection >= 80) return '灵魂伙伴';
  if (affection >= 60) return '亲密';
  if (affection >= 40) return '亲近';
  if (affection >= 20) return '熟悉';
  return '陌生';
}

// 计算当前饱食度（每小时-10）
function calculateHunger(pet) {
  if (!pet || !pet.lastFedAt) return pet ? pet.hunger : 100;

  const now = new Date();
  const lastFed = new Date(pet.lastFedAt);
  const hoursPassed = Math.floor((now - lastFed) / (1000 * 60 * 60));

  const newHunger = Math.max(0, pet.hunger - hoursPassed * 10);
  return newHunger;
}

// 获取宠物心情emoji
function getPetMood(pet, petType) {
  const hunger = calculateHunger(pet);
  const emoji = petType === 'dog' ? '🐕' : '🐰';

  if (hunger < 30) return emoji + '😢';
  if (pet.affection >= 80) return emoji + '💕';
  if (hunger > 50) return emoji + '😊';
  return emoji + '😐';
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { action } = event;

  try {
    switch (action) {
      case 'init':
        return await initPet(openid, event);
      case 'feed':
        return await feedPet(openid, event);
      case 'pet':
        return await petAnimal(openid, event);
      case 'get':
        return await getPet(openid);
      case 'unlockPet2':
        return await unlockPet2(openid, event);
      case 'setName':
        return await setPetName(openid, event);
      default:
        return { success: false, error: '未知操作' };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// 初始化宠物
async function initPet(openid, event) {
  const { petType, petName, slot } = event;

  if (!petType || !['dog', 'rabbit'].includes(petType)) {
    return { success: false, error: '请选择宠物类型' };
  }

  // 检查用户是否绑定了情侣关系
  const userResult = await db.collection('users').where({
    _openid: openid
  }).get();

  if (!userResult.data || userResult.data.length === 0) {
    return { success: false, error: '用户不存在' };
  }

  const user = userResult.data[0];

  // 优先从 relationships 中获取伴侣 ID（兼容新绑定方式）
  let partnerId = null;
  if (user.relationships && user.relationships.length > 0) {
    const active = user.relationships.find(r => r.status === 'active');
    if (active) partnerId = active.partnerId;
  }
  // 兼容旧数据：activeRelationship
  if (!partnerId && user.activeRelationship) {
    partnerId = user.activeRelationship;
  }

  if (!partnerId) {
    return { success: false, error: '请先绑定情侣关系' };
  }

  const coupleId = [openid, partnerId].sort().join('_');

  // 检查是否已有宠物数据
  const existingPet = await db.collection('pets').where({
    coupleId: coupleId
  }).get();

  const now = db.serverDate();
  const newPet = {
    type: petType,
    name: petName || PET_TYPES[petType],
    affection: 0,
    totalAffection: 0,
    hunger: 100,
    lastFedAt: now,
    lastPetAt: null,
    createdAt: now
  };

  if (existingPet.data && existingPet.data.length > 0) {
    // 已有宠物数据，更新
    const petData = existingPet.data[0];
    const targetSlot = slot || 'pet1';

    if (targetSlot === 'pet1' && petData.pet1) {
      return { success: false, error: '已存在第一只宠物' };
    }
    if (targetSlot === 'pet2' && petData.pet2) {
      return { success: false, error: '已存在第二只宠物' };
    }

    const updateData = {};
    updateData[targetSlot] = newPet;

    await db.collection('pets').doc(petData._id).update({
      data: updateData
    });

    return {
      success: true,
      message: '宠物创建成功',
      pet: newPet,
      slot: targetSlot
    };
  } else {
    // 创建新宠物数据
    await db.collection('pets').add({
      data: {
        coupleId: coupleId,
        userId: openid,
        partnerId: partnerId,
        pet1: newPet,
        pet2: null,
        createdAt: now,
        updatedAt: now
      }
    });

    return {
      success: true,
      message: '宠物创建成功',
      pet: newPet,
      slot: 'pet1'
    };
  }
}

// 获取宠物状态
async function getPet(openid) {
  const userResult = await db.collection('users').where({
    _openid: openid
  }).get();

  if (!userResult.data || userResult.data.length === 0) {
    return { success: false, error: '用户不存在' };
  }

  const user = userResult.data[0];

  // 优先从 relationships 中获取伴侣 ID（兼容新绑定方式）
  let partnerId = null;
  if (user.relationships && user.relationships.length > 0) {
    const active = user.relationships.find(r => r.status === 'active');
    if (active) partnerId = active.partnerId;
  }
  // 兼容旧数据：activeRelationship
  if (!partnerId && user.activeRelationship) {
    partnerId = user.activeRelationship;
  }

  if (!partnerId) {
    return { success: false, error: '请先绑定情侣关系', needBind: true };
  }

  const coupleId = [openid, partnerId].sort().join('_');

  const petResult = await db.collection('pets').where({
    coupleId: coupleId
  }).get();

  if (!petResult.data || petResult.data.length === 0) {
    return { success: true, hasPet: false };
  }

  const petData = petResult.data[0];

  // 计算当前饱食度
  const pet1 = petData.pet1 ? {
    ...petData.pet1,
    hunger: calculateHunger(petData.pet1),
    mood: getPetMood(petData.pet1, petData.pet1.type),
    affectionLevel: getAffectionLevel(petData.pet1.affection)
  } : null;

  const pet2 = petData.pet2 ? {
    ...petData.pet2,
    hunger: calculateHunger(petData.pet2),
    mood: getPetMood(petData.pet2, petData.pet2.type),
    affectionLevel: getAffectionLevel(petData.pet2.affection)
  } : null;

  // 检查是否可以解锁第二只
  const canUnlockPet2 = pet1 && pet1.affection >= 80 && !pet2;

  return {
    success: true,
    hasPet: true,
    pet1,
    pet2,
    canUnlockPet2,
    partnerId
  };
}

// 投喂食物
async function feedPet(openid, event) {
  const { slot } = event;
  const targetSlot = slot || 'pet1';

  const petData = await getPetData(openid);
  if (!petData) {
    return { success: false, error: '还没有宠物' };
  }

  const pet = petData[targetSlot];
  if (!pet) {
    return { success: false, error: '该宠物槽位为空' };
  }

  // 更新饱食度和好感度
  const newHunger = Math.min(100, calculateHunger(pet) + 20);
  const newAffection = Math.min(100, pet.affection + 2);
  const newTotalAffection = pet.totalAffection + 2;

  await db.collection('pets').doc(petData._id).update({
    data: {
      [`${targetSlot}.hunger`]: newHunger,
      [`${targetSlot}.affection`]: newAffection,
      [`${targetSlot}.totalAffection`]: newTotalAffection,
      [`${targetSlot}.lastFedAt`]: db.serverDate()
    }
  });

  return {
    success: true,
    message: '投喂成功',
    hunger: newHunger,
    affection: newAffection,
    mood: getPetMood({ ...pet, hunger: newHunger, affection: newAffection }, pet.type)
  };
}

// 摸摸头
async function petAnimal(openid, event) {
  const { slot } = event;
  const targetSlot = slot || 'pet1';

  const petData = await getPetData(openid);
  if (!petData) {
    return { success: false, error: '还没有宠物' };
  }

  const pet = petData[targetSlot];
  if (!pet) {
    return { success: false, error: '该宠物槽位为空' };
  }

  // 检查CD（1小时）
  if (pet.lastPetAt) {
    const lastPet = new Date(pet.lastPetAt);
    const now = new Date();
    const hoursPassed = (now - lastPet) / (1000 * 60 * 60);

    if (hoursPassed < 1) {
      const remainingMinutes = Math.ceil((1 - hoursPassed) * 60);
      return { success: false, error: `抚摸CD中，请${remainingMinutes}分钟后再试` };
    }
  }

  // 增加好感度
  const newAffection = Math.min(100, pet.affection + 3);
  const newTotalAffection = pet.totalAffection + 3;

  await db.collection('pets').doc(petData._id).update({
    data: {
      [`${targetSlot}.affection`]: newAffection,
      [`${targetSlot}.totalAffection`]: newTotalAffection,
      [`${targetSlot}.lastPetAt`]: db.serverDate()
    }
  });

  return {
    success: true,
    message: '抚摸成功',
    affection: newAffection,
    mood: getPetMood({ ...pet, affection: newAffection }, pet.type)
  };
}

// 解锁第二只宠物
async function unlockPet2(openid, event) {
  const { petType, petName } = event;

  if (!petType || !['dog', 'rabbit'].includes(petType)) {
    return { success: false, error: '请选择宠物类型' };
  }

  const petData = await getPetData(openid);
  if (!petData) {
    return { success: false, error: '还没有宠物' };
  }

  if (petData.pet2) {
    return { success: false, error: '已有第二只宠物' };
  }

  if (!petData.pet1 || petData.pet1.affection < 80) {
    return { success: false, error: '第一只好感度需达到80%才能解锁第二只' };
  }

  const now = db.serverDate();
  const newPet2 = {
    type: petType,
    name: petName || PET_TYPES[petType],
    affection: 0,
    totalAffection: 0,
    hunger: 100,
    lastFedAt: now,
    lastPetAt: null,
    createdAt: now
  };

  await db.collection('pets').doc(petData._id).update({
    data: {
      pet2: newPet2,
      updatedAt: now
    }
  });

  return {
    success: true,
    message: '第二只宠物解锁成功',
    pet: newPet2
  };
}

// 设置宠物名字
async function setPetName(openid, event) {
  const { slot, name } = event;

  if (!name || name.trim().length === 0) {
    return { success: false, error: '请输入宠物名字' };
  }

  if (name.length > 10) {
    return { success: false, error: '名字不能超过10个字符' };
  }

  const targetSlot = slot || 'pet1';
  const petData = await getPetData(openid);

  if (!petData) {
    return { success: false, error: '还没有宠物' };
  }

  if (!petData[targetSlot]) {
    return { success: false, error: '该宠物槽位为空' };
  }

  await db.collection('pets').doc(petData._id).update({
    data: {
      [`${targetSlot}.name`]: name.trim()
    }
  });

  return {
    success: true,
    message: '名字修改成功',
    name: name.trim()
  };
}

// 获取宠物数据（内部方法）
async function getPetData(openid) {
  const userResult = await db.collection('users').where({
    _openid: openid
  }).get();

  if (!userResult.data || userResult.data.length === 0) {
    return null;
  }

  const user = userResult.data[0];

  // 优先从 relationships 中获取伴侣 ID（兼容新绑定方式）
  let partnerId = null;
  if (user.relationships && user.relationships.length > 0) {
    const active = user.relationships.find(r => r.status === 'active');
    if (active) partnerId = active.partnerId;
  }
  // 兼容旧数据：activeRelationship
  if (!partnerId && user.activeRelationship) {
    partnerId = user.activeRelationship;
  }

  if (!partnerId) {
    return null;
  }

  const coupleId = [openid, partnerId].sort().join('_');

  const petResult = await db.collection('pets').where({
    coupleId: coupleId
  }).get();

  if (!petResult.data || petResult.data.length === 0) {
    return null;
  }

  return petResult.data[0];
}