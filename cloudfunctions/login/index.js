/**
 * @fileoverview 登录云函数
 * - 自动创建或查询用户
 * - 生成邀请码
 * - @module login
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

/**
 * 生成唯一邀请码
 * @returns {string} 邀请码，格式：COUPLE + 时间戳(36) + 随机字符(4)
 */
function generateInviteCode() {
  return 'COUPLE' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substr(2, 4).toUpperCase();
}

/**
 * @typedef {Object} LoginEvent
 * @property {string} [nickname]    - 可选：设置昵称
 * @property {string} [avatar]      - 可选：设置头像
 */

/**
 * @typedef {Object} WXContext
 * @property {string} OPENID
 * @property {string} APPID
 * @property {string} [UNIONID]
 */

/**
 * @typedef {Object} ApiResponse
 * @property {boolean} success
 * @property {object} [user]  - IUserPublic
 * @property {string} [error]
 */

/**
 * 登录云函数入口
 * @param {LoginEvent & WXContext} event
 * @param {any} context
 * @returns {Promise<ApiResponse>}
 */
exports.main = async (event, context) => {
  /** @type {string} */
  const openid = cloud.getWXContext().OPENID;

  try {
    /** @type {{ data: any[] }} */
    const userResult = await db.collection('users').where({ _openid: openid }).get();

    if (userResult.data && userResult.data.length > 0) {
      /** @type {any} */
      const user = userResult.data[0];
      return {
        success: true,
        user: {
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
        },
      };
    }

    // 新用户
    /** @type {string} */
    const inviteCode = generateInviteCode();

    /** @type {{ _id: string }} */
    const addResult = await db.collection('users').add({
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
    });

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
  } catch (error) {
    /** @type {string} */
    const msg = error.message || '登录失败';
    return { success: false, error: msg };
  }
};
