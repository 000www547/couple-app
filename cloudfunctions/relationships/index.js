// 云函数：关系管理
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

// 关系类型映射
const RELATION_TYPES = {
  couple: '情侣',
  bestie: '闺蜜/兄弟',
  family: '家人',
  custom: '自定义'
};

// 解绑等待天数
const UNBIND_WAIT_DAYS = 30;

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { action } = event;

  try {
    switch (action) {
      case 'bind':
        // 绑定关系
        return await bindRelationship(openid, event);

      case 'getList':
        // 获取关系列表
        return await getRelationshipList(openid);

      case 'requestUnbind':
        // 发起解除关系
        return await requestUnbind(openid, event);

      case 'confirmUnbind':
        // 确认解除关系
        return await confirmUnbind(openid, event);

      case 'cancelUnbind':
        // 取消解除关系
        return await cancelUnbind(openid, event);

      case 'clearSharedData':
        // 清除共同数据
        return await clearSharedData(openid, event.partnerId);

      default:
        return {
          success: false,
          error: '未知操作'
        };
    }
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * 绑定关系
 */
async function bindRelationship(openid, event) {
  const { partnerCode, relationType, customRelationName } = event;

  if (!partnerCode) {
    return { success: false, error: '请提供邀请码' };
  }

  // 验证关系类型
  const type = relationType || 'couple';
  if (!RELATION_TYPES[type]) {
    return { success: false, error: '无效的关系类型' };
  }

  // 如果是自定义类型，需要提供自定义名称
  if (type === 'custom' && !customRelationName) {
    return { success: false, error: '请输入自定义关系名称' };
  }

  // 获取类型显示名称
  const typeName = type === 'custom' ? customRelationName : RELATION_TYPES[type];

  // 通过邀请码查找对方
  const partnerResult = await db.collection('users').where({
    inviteCode: partnerCode
  }).get();

  if (!partnerResult.data || partnerResult.data.length === 0) {
    return { success: false, error: '邀请码无效' };
  }

  const partner = partnerResult.data[0];

  if (partner._openid === openid) {
    return { success: false, error: '不能绑定自己' };
  }

  // 创建关系记录
  const relationship = {
    partnerId: partner._openid,
    partnerName: partner.nickname || 'TA',
    type: type,
    typeName: typeName,
    status: 'active',
    createdAt: db.serverDate(),
    unbindRequestAt: null,
    unbindRequestBy: null
  };

  // 更新当前用户
  const currentUserResult = await db.collection('users').where({
    _openid: openid
  }).get();

  if (!currentUserResult.data || currentUserResult.data.length === 0) {
    return { success: false, error: '用户不存在' };
  }

  const currentUser = currentUserResult.data[0];

  // 获取现有关系列表
  const existingRelationships = currentUser.relationships || [];

  // 检查是否已经存在该关系
  const existingRelation = existingRelationships.find(r => r.partnerId === partner._openid);
  if (existingRelation) {
    return { success: false, error: '已经绑定过该关系' };
  }

  // 添加新关系
  existingRelationships.push(relationship);

  // 更新当前用户
  await db.collection('users').doc(currentUser._id).update({
    data: {
      relationships: existingRelationships,
      activeRelationship: partner._openid // 激活与该用户的关系
    }
  });

  // 更新对方用户 - 添加反向关系
  const partnerRelationships = partner.relationships || [];

  // 检查对方是否已有我的关系
  const existingPartnerRelation = partnerRelationships.find(r => r.partnerId === openid);
  if (!existingPartnerRelation) {
    partnerRelationships.push({
      partnerId: openid,
      partnerName: currentUser.nickname || 'TA',
      type: type,
      typeName: typeName,
      status: 'active',
      createdAt: db.serverDate(),
      unbindRequestAt: null,
      unbindRequestBy: null
    });

    await db.collection('users').doc(partner._id).update({
      data: {
        relationships: partnerRelationships,
        activeRelationship: openid
      }
    });
  }

  return {
    success: true,
    relationship: relationship,
    partner: {
      _openid: partner._openid,
      nickname: partner.nickname
    }
  };
}

/**
 * 获取关系列表
 */
async function getRelationshipList(openid) {
  const userResult = await db.collection('users').where({
    _openid: openid
  }).get();

  if (!userResult.data || userResult.data.length === 0) {
    return { success: false, error: '用户不存在' };
  }

  const user = userResult.data[0];
  const relationships = user.relationships || [];
  const activeRelationship = user.activeRelationship;

  // 获取所有伴侣的最新信息（昵称 + 头像）
  const partnerIds = relationships.map(r => r.partnerId);
  let partnerNameMap = {};
  let partnerAvatarMap = {};
  if (partnerIds.length > 0) {
    const partnerUsers = await db.collection('users')
      .where({ _openid: _.in(partnerIds) })
      .get();
    partnerUsers.data.forEach(p => {
      partnerNameMap[p._openid] = p.nickname || 'TA';
      partnerAvatarMap[p._openid] = p.avatar || '';
    });

    // 批量转换 cloud:// 头像为 HTTPS
    const cloudAvatars = Object.entries(partnerAvatarMap)
      .filter(([_, avatar]) => avatar && avatar.startsWith('cloud://'))
      .map(([_, avatar]) => avatar);

    if (cloudAvatars.length > 0) {
      try {
        const urlRes = await cloud.getTempFileURL({ fileList: cloudAvatars });
        if (urlRes.fileList) {
          let cloudIndex = 0;
          Object.keys(partnerAvatarMap).forEach(openid => {
            const avatar = partnerAvatarMap[openid];
            if (avatar && avatar.startsWith('cloud://')) {
              const match = urlRes.fileList[cloudIndex];
              if (match && match.tempFileURL) {
                partnerAvatarMap[openid] = match.tempFileURL;
              }
              cloudIndex++;
            }
          });
        }
      } catch (e) {
        console.error('[relationships] 头像批量转换失败', e);
      }
    }
  }

  // 获取每个关系的状态信息
  const enrichedRelationships = await Promise.all(relationships.map(async (rel) => {
    // 更新为最新的伴侣昵称和头像
    rel.partnerName = partnerNameMap[rel.partnerId] || rel.partnerName || 'TA';
    rel.partnerAvatar = partnerAvatarMap[rel.partnerId] || '';
    // 如果有待确认的解绑请求，计算剩余天数
    if (rel.status === 'pending_unbind' && rel.unbindRequestAt) {
      const requestTime = new Date(rel.unbindRequestAt);
      const now = new Date();
      const daysPassed = Math.floor((now - requestTime) / (1000 * 60 * 60 * 24));
      rel.remainingDays = Math.max(0, UNBIND_WAIT_DAYS - daysPassed);
      rel.isExpiring = rel.remainingDays <= 7; // 即将过期
    }
    rel.isActive = rel.partnerId === activeRelationship;
    return rel;
  }));

  return {
    success: true,
    relationships: enrichedRelationships,
    activeRelationship: activeRelationship
  };
}

/**
 * 发起解除关系
 */
async function requestUnbind(openid, event) {
  const { partnerId } = event;

  if (!partnerId) {
    return { success: false, error: '缺少关系对象ID' };
  }

  // 获取当前用户
  const currentUserResult = await db.collection('users').where({
    _openid: openid
  }).get();

  if (!currentUserResult.data || currentUserResult.data.length === 0) {
    return { success: false, error: '用户不存在' };
  }

  const currentUser = currentUserResult.data[0];
  const relationships = currentUser.relationships || [];

  // 找到要解除的关系
  const relationIndex = relationships.findIndex(r => r.partnerId === partnerId);
  if (relationIndex === -1) {
    return { success: false, error: '关系不存在' };
  }

  const relation = relationships[relationIndex];

  if (relation.status === 'pending_unbind') {
    return { success: false, error: '已有待确认的解绑请求' };
  }

  // 更新关系状态
  relationships[relationIndex].status = 'pending_unbind';
  relationships[relationIndex].unbindRequestAt = new Date();
  relationships[relationIndex].unbindRequestBy = openid;

  await db.collection('users').doc(currentUser._id).update({
    data: {
      relationships: relationships
    }
  });

  // 更新对方的关系状态
  const partnerResult = await db.collection('users').where({
    _openid: partnerId
  }).get();

  if (partnerResult.data && partnerResult.data.length > 0) {
    const partner = partnerResult.data[0];
    const partnerRelationships = partner.relationships || [];
    const partnerRelationIndex = partnerRelationships.findIndex(r => r.partnerId === openid);

    if (partnerRelationIndex !== -1) {
      partnerRelationships[partnerRelationIndex].status = 'pending_unbind';
      partnerRelationships[partnerRelationIndex].unbindRequestAt = new Date();
      partnerRelationships[partnerRelationIndex].unbindRequestBy = openid;

      await db.collection('users').doc(partner._id).update({
        data: {
          relationships: partnerRelationships
        }
      });
    }
  }

  return {
    success: true,
    message: '已发起解除关系请求',
    remainingDays: UNBIND_WAIT_DAYS
  };
}

/**
 * 确认解除关系
 */
async function confirmUnbind(openid, event) {
  const { partnerId } = event;

  if (!partnerId) {
    return { success: false, error: '缺少关系对象ID' };
  }

  // 获取当前用户
  const currentUserResult = await db.collection('users').where({
    _openid: openid
  }).get();

  if (!currentUserResult.data || currentUserResult.data.length === 0) {
    return { success: false, error: '用户不存在' };
  }

  const currentUser = currentUserResult.data[0];
  const relationships = currentUser.relationships || [];

  // 找到要确认解除的关系
  const relationIndex = relationships.findIndex(r => r.partnerId === partnerId);
  if (relationIndex === -1) {
    return { success: false, error: '关系不存在' };
  }

  const relation = relationships[relationIndex];

  if (relation.status !== 'pending_unbind') {
    return { success: false, error: '该关系无需确认解除' };
  }

  if (relation.unbindRequestBy === openid) {
    return { success: false, error: '不能确认自己发起的解绑请求' };
  }

  // 移除该关系
  relationships.splice(relationIndex, 1);

  // 如果解除的是激活关系，清除激活关系
  const newActiveRelationship = currentUser.activeRelationship === partnerId ? '' : currentUser.activeRelationship;

  await db.collection('users').doc(currentUser._id).update({
    data: {
      relationships: relationships,
      activeRelationship: newActiveRelationship
    }
  });

  // 清除共同数据
  await clearSharedDataForUser(currentUser._id, partnerId);

  // 更新对方用户 - 移除反向关系
  const partnerResult = await db.collection('users').where({
    _openid: partnerId
  }).get();

  if (partnerResult.data && partnerResult.data.length > 0) {
    const partner = partnerResult.data[0];
    const partnerRelationships = partner.relationships || [];
    const partnerRelationIndex = partnerRelationships.findIndex(r => r.partnerId === openid);

    if (partnerRelationIndex !== -1) {
      partnerRelationships.splice(partnerRelationIndex, 1);

      const partnerNewActive = partner.activeRelationship === openid ? '' : partner.activeRelationship;

      await db.collection('users').doc(partner._id).update({
        data: {
          relationships: partnerRelationships,
          activeRelationship: partnerNewActive
        }
      });

      // 清除对方的共同数据
      await clearSharedDataForUser(partner._id, openid);
    }
  }

  return {
    success: true,
    message: '已确认解除关系'
  };
}

/**
 * 取消解除关系
 */
async function cancelUnbind(openid, event) {
  const { partnerId } = event;

  if (!partnerId) {
    return { success: false, error: '缺少关系对象ID' };
  }

  // 获取当前用户
  const currentUserResult = await db.collection('users').where({
    _openid: openid
  }).get();

  if (!currentUserResult.data || currentUserResult.data.length === 0) {
    return { success: false, error: '用户不存在' };
  }

  const currentUser = currentUserResult.data[0];
  const relationships = currentUser.relationships || [];

  // 找到要取消的关系
  const relationIndex = relationships.findIndex(r => r.partnerId === partnerId);
  if (relationIndex === -1) {
    return { success: false, error: '关系不存在' };
  }

  const relation = relationships[relationIndex];

  if (relation.status !== 'pending_unbind') {
    return { success: false, error: '该关系没有待确认的解绑请求' };
  }

  if (relation.unbindRequestBy !== openid) {
    return { success: false, error: '只有发起方才能取消解绑请求' };
  }

  // 恢复关系状态
  relationships[relationIndex].status = 'active';
  relationships[relationIndex].unbindRequestAt = null;
  relationships[relationIndex].unbindRequestBy = null;

  await db.collection('users').doc(currentUser._id).update({
    data: {
      relationships: relationships
    }
  });

  // 更新对方的关系状态
  const partnerResult = await db.collection('users').where({
    _openid: partnerId
  }).get();

  if (partnerResult.data && partnerResult.data.length > 0) {
    const partner = partnerResult.data[0];
    const partnerRelationships = partner.relationships || [];
    const partnerRelationIndex = partnerRelationships.findIndex(r => r.partnerId === openid);

    if (partnerRelationIndex !== -1) {
      partnerRelationships[partnerRelationIndex].status = 'active';
      partnerRelationships[partnerRelationIndex].unbindRequestAt = null;
      partnerRelationships[partnerRelationIndex].unbindRequestBy = null;

      await db.collection('users').doc(partner._id).update({
        data: {
          relationships: partnerRelationships
        }
      });
    }
  }

  return {
    success: true,
    message: '已取消解绑请求'
  };
}

/**
 * 清除共同数据
 */
async function clearSharedData(openid, partnerId) {
  // 清除我方共同数据
  const currentUserResult = await db.collection('users').where({
    _openid: openid
  }).get();

  if (currentUserResult.data && currentUserResult.data.length > 0) {
    await clearSharedDataForUser(currentUserResult.data[0]._id, partnerId);
  }

  return { success: true };
}

/**
 * 清除指定用户的共同数据
 */
async function clearSharedDataForUser(userDocId, partnerId) {
  // 清除共同的心愿清单
  await db.collection('wishes').where({
    userId: partnerId,
    isShared: true
  }).remove();

  // 清除共同的纪念日
  await db.collection('anniversaries').where({
    userId: partnerId
  }).remove();

  // 清除共同的甜蜜时刻
  await db.collection('moments').where({
    userId: partnerId
  }).remove();

  return { success: true };
}
