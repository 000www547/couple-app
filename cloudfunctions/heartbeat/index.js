// 云函数：心跳/戳一戳
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { action } = event;

  try {
    switch (action) {
      case 'send': {
        // 发送心跳/戳一戳，必须先有绑定伴侣
        // 只做一次用户查询，内联获取伴侣ID并校验双向关系
        const userRes = await db.collection('users').where({ _openid: openid }).get();
        if (!userRes.data || userRes.data.length === 0) {
          return { success: false, error: '用户不存在' };
        }

        const user = userRes.data[0];
        let partnerId = null;
        if (user.relationships && user.relationships.length > 0) {
          const active = user.relationships.find(r => r.status === 'active');
          if (active) partnerId = active.partnerId;
        }
        if (!partnerId) partnerId = user.activeRelationship || null;
        if (!partnerId) {
          return { success: false, error: '请先绑定伴侣' };
        }

        // 记录心跳（第2次DB调用）
        const heartbeat = {
          userId: openid,
          partnerId: partnerId,
          type: event.type || 'heartbeat',
          createTime: db.serverDate(),
          isRead: false
        };
        const addResult = await db.collection('heartbeats').add({ data: heartbeat });

        // 校验双向绑定关系（第3次DB调用：查伴侣的relationships）
        const partnerRes = await db.collection('users').where({ _openid: partnerId }).get();
        if (partnerRes.data && partnerRes.data.length > 0) {
          const partner = partnerRes.data[0];
          let partnerPartnerId = null;
          if (partner.relationships && partner.relationships.length > 0) {
            const active = partner.relationships.find(r => r.status === 'active');
            if (active) partnerPartnerId = active.partnerId;
          }
          if (!partnerPartnerId) partnerPartnerId = partner.activeRelationship || null;

          if (partnerPartnerId === openid) {
            // 双方互为伴侣，各+2（第4、5次DB调用，并行执行）
            await Promise.all([
              db.collection('users').where({ _openid: openid }).update({
                data: { intimacy: _.inc(2), lastIntimacyUpdate: db.serverDate() }
              }),
              db.collection('users').where({ _openid: partnerId }).update({
                data: { intimacy: _.inc(2), lastIntimacyUpdate: db.serverDate() }
              })
            ]);
          }
        }

        return { success: true, id: addResult._id };
      }

      case 'getList': {
        // 获取心跳列表（仅显示自己和伴侣的）
        let userIds = [openid];

        // 内联获取伴侣ID，避免单独函数调用
        const userListRes = await db.collection('users').where({ _openid: openid }).get();
        if (userListRes.data && userListRes.data.length > 0) {
          const u = userListRes.data[0];
          let pid = null;
          if (u.relationships && u.relationships.length > 0) {
            const active = u.relationships.find(r => r.status === 'active');
            if (active) pid = active.partnerId;
          }
          if (!pid) pid = u.activeRelationship || null;
          if (pid) userIds.push(pid);
        }

        const listResult = await db.collection('heartbeats')
          .where({ userId: _.in(userIds) })
          .orderBy('createTime', 'desc')
          .limit(50)
          .get();

        // 获取用户信息
        const uniqueUserIds = [...new Set(listResult.data.map(h => h.userId))];
        const userInfos = {};
        for (const uid of uniqueUserIds) {
          const u = await db.collection('users').where({ _openid: uid }).get();
          if (u.data && u.data.length > 0) userInfos[uid] = u.data[0];
        }
        return { success: true, heartbeats: listResult.data, userInfos };
      }

      case 'markRead': {
        await db.collection('heartbeats').doc(event.id).update({
          data: { isRead: true }
        });
        return { success: true };
      }

      case 'getUnreadCount': {
        let unreadUserIds = [openid];
        const unreadUserRes = await db.collection('users').where({ _openid: openid }).get();
        if (unreadUserRes.data && unreadUserRes.data.length > 0) {
          const u = unreadUserRes.data[0];
          let pid = null;
          if (u.relationships && u.relationships.length > 0) {
            const active = u.relationships.find(r => r.status === 'active');
            if (active) pid = active.partnerId;
          }
          if (!pid) pid = u.activeRelationship || null;
          if (pid) unreadUserIds.push(pid);
        }

        const unreadResult = await db.collection('heartbeats')
          .where({
            userId: _.in(unreadUserIds),
            isRead: false,
            _openid: _.neq(openid)
          })
          .count();
        return { success: true, count: unreadResult.total };
      }

      default:
        return { success: false, error: '未知操作' };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
};
