/**
 * @fileoverview 心愿清单云函数
 * - 添加/完成/删除心愿
 * - 获取心愿列表（全部/我的/共同的）
 * - 隐私过滤：全部 tab 只显示自己的 + 伴侣的共同心愿
 * @module wishes
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

// ============================================================
// 类型定义
// ============================================================

/**
 * @typedef {'add'|'getList'|'complete'|'uncomplete'|'delete'} WishesAction
 */

/**
 * @typedef {Object} WishesEvent
 * @property {WishesAction} action
 * @property {string} [type]           - getList: 'all'|'my'|'shared'
 * @property {string} [title]          - add: 心愿标题
 * @property {string} [description]    - add: 心愿描述
 * @property {boolean} [isShared]      - add: 是否为共同心愿
 * @property {string} [wishId]         - complete/uncomplete/delete: 心愿ID
 */

/**
 * @typedef {Object} WXContext
 * @property {string} OPENID
 */

// ============================================================
// 工具函数
// ============================================================

/**
 * 获取用户的所有伴侣 ID（从 relationships + activeRelationship）
 * @param {any} userRecord
 * @returns {{ userIds: string[], partnerIds: string[] }}
 */
function extractPartnerIds(userRecord) {
  /** @type {string[]} */
  const userIds = [];
  /** @type {string[]} */
  const partnerIds = [];

  if (userRecord.relationships && userRecord.relationships.length > 0) {
    const activeRelations = userRecord.relationships.filter(/** @param {any} r */ (r) => r.status === 'active');
    activeRelations.forEach(/** @param {any} r */ (r) => {
      if (!partnerIds.includes(r.partnerId)) {
        partnerIds.push(r.partnerId);
        userIds.push(r.partnerId);
      }
    });
  }

  if (userRecord.activeRelationship && !partnerIds.includes(userRecord.activeRelationship)) {
    partnerIds.push(userRecord.activeRelationship);
    userIds.push(userRecord.activeRelationship);
  }

  return { userIds, partnerIds };
}

/**
 * 补充心愿创建者昵称
 * @param {any[]} wishes
 * @returns {Promise<any[]>}
 */
async function enrichWithCreatorNicknames(wishes) {
  if (wishes.length === 0) return wishes;

  /** @type {string[]} */
  const creatorIds = [...new Set(wishes.map(/** @param {any} w */ (w) => w.userId))];

  /** @type {{ data: any[] }} */
  const creatorRes = await db.collection('users').where({ _openid: _.in(creatorIds) }).get();

  /** @type {Record<string,string>} */
  const creatorMap = {};
  creatorRes.data.forEach(/** @param {any} u */ (u) => {
    creatorMap[u._openid] = u.nickname || '匿名用户';
  });

  return wishes.map(/** @param {any} w */ (w) => ({
    ...w,
    creatorNickname: creatorMap[w.userId] || '匿名用户',
  }));
}

// ============================================================
// 云函数入口
// ============================================================

/**
 * @param {WishesEvent & WXContext} event
 * @param {any} context
 */
exports.main = async (event, context) => {
  /** @type {string} */
  const openid = cloud.getWXContext().OPENID;
  /** @type {WishesAction} */
  const { action } = event;

  try {
    switch (action) {
      // ---- 添加心愿 ----
      case 'add': {
        /** @type {{ _id: string }} */
        const addResult = await db.collection('wishes').add({
          data: {
            userId: openid,
            title: /** @type {string} */ (event.title),
            description: event.description || '',
            isCompleted: false,
            completedBy: '',
            completedTime: null,
            isShared: event.isShared || false,
            createTime: db.serverDate(),
          },
        });
        return { success: true, id: addResult._id };
      }

      // ---- 获取心愿列表 ----
      case 'getList': {
        /** @type {{ data: any[] }} */
        const user = await db.collection('users').where({ _openid: openid }).get();
        /** @type {{ userIds: string[], partnerIds: string[] }} */
        const { userIds: _userIds, partnerIds } = user.data && user.data.length > 0
          ? extractPartnerIds(user.data[0])
          : { userIds: [], partnerIds: [] };

        /** @type {any[]} */
        let wishes = [];

        if (event.type === 'my') {
          // 我的心愿 - 仅自己的
          /** @type {{ data: any[] }} */
          const myResult = await db.collection('wishes')
            .where({ userId: openid })
            .orderBy('createTime', 'desc')
            .get();
          wishes = myResult.data;

        } else if (event.type === 'shared') {
          // 共同心愿 - 自己设为共同的 + 伴侣设为共同的
          if (partnerIds.length === 0) {
            /** @type {{ data: any[] }} */
            const myShared = await db.collection('wishes')
              .where({ userId: openid, isShared: true })
              .orderBy('createTime', 'desc')
              .get();
            wishes = myShared.data;
          } else {
            /** @type {{ data: any[] }} */
            const listResult = await db.collection('wishes')
              .where(
                _.or([
                  { userId: openid, isShared: true },
                  ...partnerIds.map(/** @param {string} pid */ (pid) => ({ userId: pid, isShared: true })),
                ])
              )
              .orderBy('createTime', 'desc')
              .get();
            wishes = listResult.data;
          }

        } else {
          // 全部 - 我的所有心愿（私人+共同）+ 伴侣的共同心愿
          if (partnerIds.length === 0) {
            /** @type {{ data: any[] }} */
            const myResult = await db.collection('wishes')
              .where({ userId: openid })
              .orderBy('createTime', 'desc')
              .get();
            wishes = myResult.data;
          } else {
            /** @type {{ data: any[] }} */
            const listResult = await db.collection('wishes')
              .where(
                _.or([
                  { userId: openid },
                  ...partnerIds.map(/** @param {string} pid */ (pid) => ({ userId: pid, isShared: true })),
                ])
              )
              .orderBy('createTime', 'desc')
              .get();
            wishes = listResult.data;
          }
        }

        wishes = await enrichWithCreatorNicknames(wishes);
        return { success: true, wishes };
      }

      // ---- 完成心愿 ----
      case 'complete': {
        await db.collection('wishes').doc(event.wishId).update({
          data: {
            isCompleted: true,
            completedBy: openid,
            completedTime: db.serverDate(),
          },
        });
        return { success: true };
      }

      // ---- 取消完成 ----
      case 'uncomplete': {
        await db.collection('wishes').doc(event.wishId).update({
          data: {
            isCompleted: false,
            completedBy: '',
            completedTime: null,
          },
        });
        return { success: true };
      }

      // ---- 删除心愿 ----
      case 'delete': {
        await db.collection('wishes').doc(event.wishId).remove();
        return { success: true };
      }

      default:
        return { success: false, error: '未知操作' };
    }
  } catch (error) {
    /** @type {string} */
    const msg = error.message;
    return { success: false, error: msg };
  }
};
