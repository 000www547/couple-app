/**
 * @fileoverview 心跳/戳一戳云函数
 * - 发送心跳 +2 亲密度（双方）
 * - 获取心跳历史（含方向标记）
 * - 未读数统计
 * @module heartbeat
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

/**
 * @typedef {Object} HeartbeatEvent
 * @property {'send'|'getList'|'markRead'|'getUnreadCount'} action
 * @property {string} [id]       - markRead 用：心跳记录 ID
 */

/**
 * @typedef {Object} WXContext
 * @property {string} OPENID
 */

/**
 * @typedef {Object} ApiSuccess
 * @property {true} success
 */

/**
 * @typedef {Object} ApiFail
 * @property {false} success
 * @property {string} error
 */

/**
 * @typedef {Object} SendSuccess
 * @property {true} success
 */

/**
 * @typedef {Object} GetListSuccess
 * @property {true} success
 * @property {Array<{_id:string,userId:string,partnerId:string,type:string,createTime:any,isRead:boolean,isSentByMe:boolean}>} heartbeats
 * @property {Record<string,any>} userInfos
 */

/**
 * @typedef {Object} MarkReadSuccess
 * @property {true} success
 */

/**
 * @typedef {Object} UnreadCountSuccess
 * @property {true} success
 * @property {number} count
 */

/**
 * 心跳云函数入口
 * @param {HeartbeatEvent & WXContext} event
 * @param {any} context
 * @returns {Promise<SendSuccess|GetListSuccess|MarkReadSuccess|UnreadCountSuccess|ApiFail>}
 */
exports.main = async (event, context) => {
  /** @type {string} */
  const openid = cloud.getWXContext().OPENID;
  /** @type {string} */
  const { action } = event;
  console.log('[heartbeat] 收到请求, action:', action, 'openid:', openid);

  try {
    switch (action) {
      case 'send': {
        console.log('[heartbeat] send: 开始查询用户', openid);

        /** @type {{ data: any[] }} */
        const userRes = await db.collection('users').where({ _openid: openid }).get();
        console.log('[heartbeat] send: 用户查询结果', userRes.data?.length);

        if (!userRes.data || userRes.data.length === 0) {
          return { success: false, error: '用户不存在' };
        }

        /** @type {any} */
        const user = userRes.data[0];

        /** @type {string|null} */
        let partnerId = null;
        if (user.relationships && user.relationships.length > 0) {
          const active = user.relationships.find(/** @param {any} r */ (r) => r.status === 'active');
          if (active) partnerId = active.partnerId;
        }
        if (!partnerId) partnerId = user.activeRelationship || null;
        console.log('[heartbeat] send: partnerId:', partnerId);

        if (!partnerId) {
          return { success: false, error: '请先绑定伴侣' };
        }

        // 记录心跳 + 双方各+2亲密度（并行执行）
        await Promise.all([
          db.collection('heartbeats').add({
            data: {
              userId: openid,
              partnerId: partnerId,
              type: event.type || 'heartbeat',
              createTime: db.serverDate(),
              isRead: false,
            },
          }),
          db.collection('users').where({ _openid: openid }).update({
            data: { intimacy: _.inc(2), lastIntimacyUpdate: db.serverDate() },
          }),
          db.collection('users').where({ _openid: partnerId }).update({
            data: { intimacy: _.inc(2), lastIntimacyUpdate: db.serverDate() },
          }),
        ]);
        console.log('[heartbeat] send: 完成');

        return { success: true };
      }

      case 'getList': {
        /** @type {string|null} */
        let partnerId = null;

        /** @type {{ data: any[] }} */
        const userListRes = await db.collection('users').where({ _openid: openid }).get();
        if (userListRes.data && userListRes.data.length > 0) {
          /** @type {any} */
          const u = userListRes.data[0];
          if (u.relationships && u.relationships.length > 0) {
            const active = u.relationships.find(/** @param {any} r */ (r) => r.status === 'active');
            if (active) partnerId = active.partnerId;
          }
          if (!partnerId) partnerId = u.activeRelationship || null;
        }

        /** @type {{ data: any[] }} */
        const listResult = await db.collection('heartbeats')
          .where(
            _.or(
              { userId: openid },
              { partnerId: openid }
            )
          )
          .orderBy('createTime', 'desc')
          .limit(50)
          .get();

        // 批量获取用户信息
        /** @type {string[]} */
        const uniqueUserIds = [...new Set(listResult.data.map(/** @param {any} h */ (h) => h.userId))];

        /** @type {{ data: any[] }} */
        const userInfosRes = await db.collection('users')
          .where({ _openid: _.in(uniqueUserIds) })
          .get();

        /** @type {Record<string,any>} */
        const userInfos = {};
        userInfosRes.data.forEach(/** @param {any} u */ (u) => { userInfos[u._openid] = u; });

        // 附加方向标记
        /** @type {Array<any>} */
        const heartbeats = listResult.data.map(/** @param {any} h */ (h) => ({
          ...h,
          isSentByMe: h.userId === openid,
        }));

        return { success: true, heartbeats, userInfos };
      }

      case 'markRead': {
        await db.collection('heartbeats').doc(event.id).update({
          data: { isRead: true },
        });
        return { success: true };
      }

      case 'getUnreadCount': {
        /** @type {string[]} */
        let unreadUserIds = [openid];

        /** @type {{ data: any[] }} */
        const unreadUserRes = await db.collection('users').where({ _openid: openid }).get();
        if (unreadUserRes.data && unreadUserRes.data.length > 0) {
          /** @type {any} */
          const u = unreadUserRes.data[0];
          let pid = null;
          if (u.relationships && u.relationships.length > 0) {
            const active = u.relationships.find(/** @param {any} r */ (r) => r.status === 'active');
            if (active) pid = active.partnerId;
          }
          if (!pid) pid = u.activeRelationship || null;
          if (pid) unreadUserIds.push(pid);
        }

        /** @type {{ total: number }} */
        const unreadResult = await db.collection('heartbeats')
          .where({
            userId: _.in(unreadUserIds),
            isRead: false,
            _openid: _.neq(openid),
          })
          .count();

        return { success: true, count: unreadResult.total };
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
