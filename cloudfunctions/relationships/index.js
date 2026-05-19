/**
 * @fileoverview 关系管理云函数
 * - 绑定/解除关系（邀请码方式）
 * - 30天解绑冷却期
 * - 清除共同数据
 * @module relationships
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

// ============================================================
// 常量
// ============================================================

/** 关系类型映射 */
const RELATION_TYPES = /** @type {const} */ ({
  couple: '情侣',
  bestie: '闺蜜/兄弟',
  family: '家人',
  custom: '自定义',
});

/** 解绑等待天数 */
const UNBIND_WAIT_DAYS = 30;

// ============================================================
// 类型定义
// ============================================================

/**
 * @typedef {'bind'|'getList'|'requestUnbind'|'confirmUnbind'|'cancelUnbind'|'clearSharedData'} RelationshipsAction
 * @typedef {'couple'|'bestie'|'family'|'custom'} RelationType
 * @typedef {'active'|'pending_unbind'} RelationStatus
 */

/**
 * @typedef {Object} RelationshipsEvent
 * @property {RelationshipsAction} action
 * @property {string} [partnerCode]        - bind: 对方邀请码
 * @property {RelationType} [relationType] - bind: 关系类型
 * @property {string} [customRelationName] - bind: 自定义关系名称
 * @property {string} [partnerId]          - requestUnbind/confirmUnbind/cancelUnbind: 伴侣 openid
 */

/**
 * @typedef {Object} WXContext
 * @property {string} OPENID
 */

/**
 * @typedef {Object} RelationshipItem
 * @property {string} partnerId
 * @property {string} partnerName
 * @property {RelationType} type
 * @property {string} typeName
 * @property {RelationStatus} status
 * @property {any} createdAt
 * @property {any|null} unbindRequestAt
 * @property {string|null} unbindRequestBy
 */

// ============================================================
// 工具函数
// ============================================================

/**
 * 批量获取伴侣头像并转换为 HTTPS
 * @param {Record<string,string>} avatarMap  openid → avatar
 * @returns {Promise<Record<string,string>>} openid → HTTPS avatar
 */
async function convertPartnerAvatars(avatarMap) {
  /** @type {string[]} */
  const cloudAvatars = Object.entries(avatarMap)
    .filter(([_, avatar]) => avatar && avatar.startsWith('cloud://'))
    .map(([_, avatar]) => avatar);

  if (cloudAvatars.length === 0) return avatarMap;

  try {
    /** @type {{ fileList: Array<{fileID:string,tempFileURL?:string}> }} */
    const urlRes = await cloud.getTempFileURL({ fileList: cloudAvatars });
    if (urlRes.fileList) {
      let cloudIndex = 0;
      Object.keys(avatarMap).forEach(/** @param {string} oid */ (oid) => {
        const avatar = avatarMap[oid];
        if (avatar && avatar.startsWith('cloud://')) {
          const match = urlRes.fileList[cloudIndex];
          if (match && match.tempFileURL) avatarMap[oid] = match.tempFileURL;
          cloudIndex++;
        }
      });
    }
  } catch (e) {
    console.error('[relationships] 头像批量转换失败', e);
  }

  return avatarMap;
}

/**
 * 清除指定用户的共同数据
 * @param {string} userDocId  - users 集合文档 ID
 * @param {string} partnerId  - 伴侣 openid
 */
async function clearSharedDataForUser(userDocId, partnerId) {
  await Promise.all([
    db.collection('wishes').where({ userId: partnerId, isShared: true }).remove(),
    db.collection('anniversaries').where({ userId: partnerId }).remove(),
    db.collection('moments').where({ userId: partnerId }).remove(),
  ]);
}

// ============================================================
// 业务函数
// ============================================================

/**
 * 绑定关系
 * @param {string} openid
 * @param {RelationshipsEvent & WXContext} event
 */
async function bindRelationship(openid, event) {
  const { partnerCode, relationType, customRelationName } = event;

  if (!partnerCode) return { success: false, error: '请提供邀请码' };

  /** @type {RelationType} */
  const type = relationType || 'couple';
  if (!RELATION_TYPES[type]) return { success: false, error: '无效的关系类型' };

  if (type === 'custom' && !customRelationName) {
    return { success: false, error: '请输入自定义关系名称' };
  }

  const typeName = type === 'custom' ? /** @type {string} */ (customRelationName) : RELATION_TYPES[type];

  /** @type {{ data: any[] }} */
  const partnerResult = await db.collection('users').where({ inviteCode: partnerCode }).get();
  if (!partnerResult.data || partnerResult.data.length === 0) return { success: false, error: '邀请码无效' };

  /** @type {any} */
  const partner = partnerResult.data[0];
  if (partner._openid === openid) return { success: false, error: '不能绑定自己' };

  /** @type {{ data: any[] }} */
  const currentUserResult = await db.collection('users').where({ _openid: openid }).get();
  if (!currentUserResult.data || currentUserResult.data.length === 0) return { success: false, error: '用户不存在' };

  /** @type {any} */
  const currentUser = currentUserResult.data[0];
  /** @type {RelationshipItem[]} */
  const existingRelationships = currentUser.relationships || [];

  const existingRelation = existingRelationships.find(
    /** @param {RelationshipItem} r */ (r) => r.partnerId === partner._openid
  );
  if (existingRelation) return { success: false, error: '已经绑定过该关系' };

  /** @type {RelationshipItem} */
  const relationship = {
    partnerId: partner._openid,
    partnerName: partner.nickname || 'TA',
    type,
    typeName,
    status: 'active',
    createdAt: db.serverDate(),
    unbindRequestAt: null,
    unbindRequestBy: null,
  };

  existingRelationships.push(relationship);

  await db.collection('users').doc(currentUser._id).update({
    data: {
      relationships: existingRelationships,
      activeRelationship: partner._openid,
    },
  });

  // 更新对方
  /** @type {RelationshipItem[]} */
  const partnerRelationships = partner.relationships || [];
  const existingPartnerRelation = partnerRelationships.find(
    /** @param {RelationshipItem} r */ (r) => r.partnerId === openid
  );

  if (!existingPartnerRelation) {
    partnerRelationships.push({
      partnerId: openid,
      partnerName: currentUser.nickname || 'TA',
      type,
      typeName,
      status: 'active',
      createdAt: db.serverDate(),
      unbindRequestAt: null,
      unbindRequestBy: null,
    });

    await db.collection('users').doc(partner._id).update({
      data: {
        relationships: partnerRelationships,
        activeRelationship: openid,
      },
    });
  }

  return {
    success: true,
    relationship,
    partner: { _openid: partner._openid, nickname: partner.nickname },
  };
}

/**
 * 获取关系列表
 * @param {string} openid
 */
async function getRelationshipList(openid) {
  /** @type {{ data: any[] }} */
  const userResult = await db.collection('users').where({ _openid: openid }).get();
  if (!userResult.data || userResult.data.length === 0) return { success: false, error: '用户不存在' };

  /** @type {any} */
  const user = userResult.data[0];
  /** @type {RelationshipItem[]} */
  const relationships = user.relationships || [];
  /** @type {string|null} */
  const activeRelationship = user.activeRelationship;

  /** @type {string[]} */
  const partnerIds = relationships.map(/** @param {RelationshipItem} r */ (r) => r.partnerId);
  /** @type {Record<string,string>} */
  let partnerNameMap = {};
  /** @type {Record<string,string>} */
  let partnerAvatarMap = {};

  if (partnerIds.length > 0) {
    /** @type {{ data: any[] }} */
    const partnerUsers = await db.collection('users').where({ _openid: _.in(partnerIds) }).get();
    partnerUsers.data.forEach(/** @param {any} p */ (p) => {
      partnerNameMap[p._openid] = p.nickname || 'TA';
      partnerAvatarMap[p._openid] = p.avatar || '';
    });

    // 批量转换 cloud:// 头像为 HTTPS
    partnerAvatarMap = await convertPartnerAvatars(partnerAvatarMap);
  }

  // 补充关系详情
  /** @type {Promise<any>[]} */
  const enrichPromises = relationships.map(async (/** @param {RelationshipItem} rel */ (rel) => {
    rel.partnerName = partnerNameMap[rel.partnerId] || rel.partnerName || 'TA';
    rel.partnerAvatar = partnerAvatarMap[rel.partnerId] || '';
    if (rel.status === 'pending_unbind' && rel.unbindRequestAt) {
      const requestTime = new Date(rel.unbindRequestAt);
      const now = new Date();
      const daysPassed = Math.floor((now - requestTime) / (1000 * 60 * 60 * 24));
      rel.remainingDays = Math.max(0, UNBIND_WAIT_DAYS - daysPassed);
      rel.isExpiring = rel.remainingDays <= 7;
    }
    rel.isActive = rel.partnerId === activeRelationship;
    return rel;
  }));

  /** @type {RelationshipItem[]} */
  const enrichedRelationships = await Promise.all(enrichPromises);

  return { success: true, relationships: enrichedRelationships, activeRelationship };
}

/**
 * 发起解除关系
 * @param {string} openid
 * @param {RelationshipsEvent} event
 */
async function requestUnbind(openid, event) {
  const { partnerId } = event;
  if (!partnerId) return { success: false, error: '缺少关系对象ID' };

  /** @type {{ data: any[] }} */
  const currentUserResult = await db.collection('users').where({ _openid: openid }).get();
  if (!currentUserResult.data || currentUserResult.data.length === 0) return { success: false, error: '用户不存在' };

  /** @type {any} */
  const currentUser = currentUserResult.data[0];
  /** @type {RelationshipItem[]} */
  const relationships = currentUser.relationships || [];

  const relationIndex = relationships.findIndex(
    /** @param {RelationshipItem} r */ (r) => r.partnerId === partnerId
  );
  if (relationIndex === -1) return { success: false, error: '关系不存在' };

  /** @type {RelationshipItem} */
  const relation = relationships[relationIndex];
  if (relation.status === 'pending_unbind') return { success: false, error: '已有待确认的解绑请求' };

  relationships[relationIndex].status = 'pending_unbind';
  relationships[relationIndex].unbindRequestAt = new Date();
  relationships[relationIndex].unbindRequestBy = openid;

  await db.collection('users').doc(currentUser._id).update({ data: { relationships } });

  // 更新对方
  /** @type {{ data: any[] }} */
  const partnerResult = await db.collection('users').where({ _openid: partnerId }).get();
  if (partnerResult.data && partnerResult.data.length > 0) {
    /** @type {any} */
    const partner = partnerResult.data[0];
    /** @type {RelationshipItem[]} */
    const partnerRelationships = partner.relationships || [];
    const partnerRelationIndex = partnerRelationships.findIndex(
      /** @param {RelationshipItem} r */ (r) => r.partnerId === openid
    );
    if (partnerRelationIndex !== -1) {
      partnerRelationships[partnerRelationIndex].status = 'pending_unbind';
      partnerRelationships[partnerRelationIndex].unbindRequestAt = new Date();
      partnerRelationships[partnerRelationIndex].unbindRequestBy = openid;
      await db.collection('users').doc(partner._id).update({ data: { relationships: partnerRelationships } });
    }
  }

  return { success: true, message: '已发起解除关系请求', remainingDays: UNBIND_WAIT_DAYS };
}

/**
 * 确认解除关系
 * @param {string} openid
 * @param {RelationshipsEvent} event
 */
async function confirmUnbind(openid, event) {
  const { partnerId } = event;
  if (!partnerId) return { success: false, error: '缺少关系对象ID' };

  /** @type {{ data: any[] }} */
  const currentUserResult = await db.collection('users').where({ _openid: openid }).get();
  if (!currentUserResult.data || currentUserResult.data.length === 0) return { success: false, error: '用户不存在' };

  /** @type {any} */
  const currentUser = currentUserResult.data[0];
  /** @type {RelationshipItem[]} */
  const relationships = currentUser.relationships || [];

  const relationIndex = relationships.findIndex(
    /** @param {RelationshipItem} r */ (r) => r.partnerId === partnerId
  );
  if (relationIndex === -1) return { success: false, error: '关系不存在' };

  /** @type {RelationshipItem} */
  const relation = relationships[relationIndex];
  if (relation.status !== 'pending_unbind') return { success: false, error: '该关系无需确认解除' };
  if (relation.unbindRequestBy === openid) return { success: false, error: '不能确认自己发起的解绑请求' };

  relationships.splice(relationIndex, 1);

  const newActiveRelationship = currentUser.activeRelationship === partnerId ? '' : currentUser.activeRelationship;

  await db.collection('users').doc(currentUser._id).update({
    data: { relationships, activeRelationship: newActiveRelationship },
  });

  await clearSharedDataForUser(currentUser._id, partnerId);

  // 更新对方
  /** @type {{ data: any[] }} */
  const partnerResult = await db.collection('users').where({ _openid: partnerId }).get();
  if (partnerResult.data && partnerResult.data.length > 0) {
    /** @type {any} */
    const partner = partnerResult.data[0];
    /** @type {RelationshipItem[]} */
    const partnerRelationships = partner.relationships || [];
    const partnerRelationIndex = partnerRelationships.findIndex(
      /** @param {RelationshipItem} r */ (r) => r.partnerId === openid
    );
    if (partnerRelationIndex !== -1) {
      partnerRelationships.splice(partnerRelationIndex, 1);
      const partnerNewActive = partner.activeRelationship === openid ? '' : partner.activeRelationship;
      await db.collection('users').doc(partner._id).update({
        data: { relationships: partnerRelationships, activeRelationship: partnerNewActive },
      });
      await clearSharedDataForUser(partner._id, openid);
    }
  }

  return { success: true, message: '已确认解除关系' };
}

/**
 * 取消解除关系
 * @param {string} openid
 * @param {RelationshipsEvent} event
 */
async function cancelUnbind(openid, event) {
  const { partnerId } = event;
  if (!partnerId) return { success: false, error: '缺少关系对象ID' };

  /** @type {{ data: any[] }} */
  const currentUserResult = await db.collection('users').where({ _openid: openid }).get();
  if (!currentUserResult.data || currentUserResult.data.length === 0) return { success: false, error: '用户不存在' };

  /** @type {any} */
  const currentUser = currentUserResult.data[0];
  /** @type {RelationshipItem[]} */
  const relationships = currentUser.relationships || [];

  const relationIndex = relationships.findIndex(
    /** @param {RelationshipItem} r */ (r) => r.partnerId === partnerId
  );
  if (relationIndex === -1) return { success: false, error: '关系不存在' };

  /** @type {RelationshipItem} */
  const relation = relationships[relationIndex];
  if (relation.status !== 'pending_unbind') return { success: false, error: '该关系没有待确认的解绑请求' };
  if (relation.unbindRequestBy !== openid) return { success: false, error: '只有发起方才能取消解绑请求' };

  relationships[relationIndex].status = 'active';
  relationships[relationIndex].unbindRequestAt = null;
  relationships[relationIndex].unbindRequestBy = null;

  await db.collection('users').doc(currentUser._id).update({ data: { relationships } });

  // 更新对方
  /** @type {{ data: any[] }} */
  const partnerResult = await db.collection('users').where({ _openid: partnerId }).get();
  if (partnerResult.data && partnerResult.data.length > 0) {
    /** @type {any} */
    const partner = partnerResult.data[0];
    /** @type {RelationshipItem[]} */
    const partnerRelationships = partner.relationships || [];
    const partnerRelationIndex = partnerRelationships.findIndex(
      /** @param {RelationshipItem} r */ (r) => r.partnerId === openid
    );
    if (partnerRelationIndex !== -1) {
      partnerRelationships[partnerRelationIndex].status = 'active';
      partnerRelationships[partnerRelationIndex].unbindRequestAt = null;
      partnerRelationships[partnerRelationIndex].unbindRequestBy = null;
      await db.collection('users').doc(partner._id).update({ data: { relationships: partnerRelationships } });
    }
  }

  return { success: true, message: '已取消解绑请求' };
}

/**
 * 清除共同数据（对外入口）
 * @param {string} openid
 * @param {string} partnerId
 */
async function clearSharedData(openid, partnerId) {
  /** @type {{ data: any[] }} */
  const currentUserResult = await db.collection('users').where({ _openid: openid }).get();
  if (currentUserResult.data && currentUserResult.data.length > 0) {
    await clearSharedDataForUser(currentUserResult.data[0]._id, partnerId);
  }
  return { success: true };
}

// ============================================================
// 云函数入口
// ============================================================

/**
 * @param {RelationshipsEvent & WXContext} event
 * @param {any} context
 */
exports.main = async (event, context) => {
  /** @type {string} */
  const openid = cloud.getWXContext().OPENID;
  /** @type {RelationshipsAction} */
  const { action } = event;

  try {
    switch (action) {
      case 'bind':        return await bindRelationship(openid, event);
      case 'getList':     return await getRelationshipList(openid);
      case 'requestUnbind': return await requestUnbind(openid, event);
      case 'confirmUnbind': return await confirmUnbind(openid, event);
      case 'cancelUnbind':  return await cancelUnbind(openid, event);
      case 'clearSharedData': return await clearSharedData(openid, event.partnerId);
      default: return { success: false, error: '未知操作' };
    }
  } catch (error) {
    /** @type {string} */
    const msg = error.message;
    return { success: false, error: msg };
  }
};
