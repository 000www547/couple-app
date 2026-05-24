/**
 * @fileoverview 登录云函数 - Promise版(兼容Node.js 8.9)
 * - 自动创建或查询用户
 * - 旧数据迁移：partnerId -> relationships
 * - 生成邀请码
 * @module login
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

/**
 * 生成唯一邀请码
 * @returns {string} 邀请码
 */
function generateInviteCode() {
  return 'COUPLE' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substr(2, 4).toUpperCase();
}

/**
 * 迁移旧数据：partnerId -> relationships
 * @param {Object} user
 * @returns {Promise<Object>} 迁移后的用户数据
 */
function migrateOldData(user) {
  // 如果已经有 relationships 数组，无需迁移
  if (user.relationships && user.relationships.length > 0) {
    return Promise.resolve(user);
  }

  // 如果存在旧版 partnerId，迁移到新格式
  var partnerId = user.partnerId || user.activeRelationship;
  if (!partnerId) return Promise.resolve(user);

  var relationships = [{
    partnerId: partnerId,
    partnerName: user.partnerNickname || 'TA',
    type: 'couple',
    typeName: '情侣',
    status: 'active',
    createdAt: db.serverDate(),
    unbindRequestAt: null,
    unbindRequestBy: null,
  }];

  return db.collection('users').doc(user._id).update({
    data: {
      relationships: relationships,
      activeRelationship: partnerId,
      // 可选：清理旧字段
      // partnerId: db.command.remove(),
    },
  }).then(function () {
    user.relationships = relationships;
    user.activeRelationship = partnerId;
    console.log('[login] 数据迁移完成:', user._openid);
    return user;
  }).catch(function (err) {
    console.error('[login] 数据迁移失败:', err);
    return user;
  });
}

/**
 * 构建返回的用户对象
 * @param {Object} user
 */
function buildUserResponse(user) {
  return {
    _id: user._id,
    _openid: user._openid,
    nickname: user.nickname || '',
    avatar: user.avatar || '',
    inviteCode: user.inviteCode || '',
    birthday: user.birthday || '',
    anniversaryDate: user.anniversaryDate || '',
    activeRelationship: user.activeRelationship || null,
    relationships: user.relationships || [],
    partnerBirthday: user.partnerBirthday || '',
    intimacy: user.intimacy || 0,
    lastIntimacyUpdate: user.lastIntimacyUpdate || null,
  };
}

/**
 * 登录云函数入口
 * @param {Object} event
 * @param {Object} context
 */
exports.main = function (event, context) {
  var openid = cloud.getWXContext().OPENID;

  return db.collection('users').where({ _openid: openid }).get().then(function (userResult) {
    if (userResult.data && userResult.data.length > 0) {
      var user = userResult.data[0];
      // 迁移旧数据
      return migrateOldData(user).then(function (migratedUser) {
        return { success: true, user: buildUserResponse(migratedUser) };
      });
    }

    // 新用户
    var inviteCode = generateInviteCode();

    return db.collection('users').add({
      data: {
        _openid: openid,
        nickname: '',
        avatar: '',
        inviteCode: inviteCode,
        birthday: '',
        anniversaryDate: '',
        activeRelationship: null,
        relationships: [],
        partnerBirthday: '',
        intimacy: 0,
        lastIntimacyUpdate: null,
        createTime: db.serverDate(),
      },
    }).then(function (addResult) {
      return {
        success: true,
        user: {
          _id: addResult._id,
          _openid: openid,
          nickname: '',
          avatar: '',
          inviteCode: inviteCode,
          birthday: '',
          anniversaryDate: '',
          activeRelationship: null,
          relationships: [],
          partnerBirthday: '',
          intimacy: 0,
          lastIntimacyUpdate: null,
        },
      };
    });
  }).catch(function (error) {
    return { success: false, error: error.message || '登录失败' };
  });
};
