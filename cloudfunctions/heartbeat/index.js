// 云函数：心跳/戳一戳
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { action } = event;
  console.log('[heartbeat] 收到请求, action:', action, 'openid:', openid);

  try {
    switch (action) {
      case 'send': {
        console.log('[heartbeat] send: 开始查询用户', openid);
        // 发送心跳/戳一戳，必须先有绑定伴侣
        const userRes = await db.collection('users').where({ _openid: openid }).get();
        console.log('[heartbeat] send: 用户查询结果', userRes.data?.length);
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
        console.log('[heartbeat] send: partnerId:', partnerId);
        if (!partnerId) {
          return { success: false, error: '请先绑定伴侣' };
        }

        // 记录心跳 + 双方各+2亲密度（并行执行，减少总耗时）
        const heartbeat = {
          userId: openid,
          partnerId: partnerId,
          type: event.type || 'heartbeat',
          createTime: db.serverDate(),
          isRead: false
        };

        console.log('[heartbeat] send: 开始并行写入');
        await Promise.all([
          db.collection('heartbeats').add({ data: heartbeat }),
          db.collection('users').where({ _openid: openid }).update({
            data: { intimacy: _.inc(2), lastIntimacyUpdate: db.serverDate() }
          }),
          db.collection('users').where({ _openid: partnerId }).update({
            data: { intimacy: _.inc(2), lastIntimacyUpdate: db.serverDate() }
          })
        ]);
        console.log('[heartbeat] send: 完成');

        return { success: true };
      }

      case 'getList': {
        // 获取心跳列表 - 包含自己发送的 + 伴侣发送给我的
        let partnerId = null;

        const userListRes = await db.collection('users').where({ _openid: openid }).get();
        if (userListRes.data && userListRes.data.length > 0) {
          const u = userListRes.data[0];
          if (u.relationships && u.relationships.length > 0) {
            const active = u.relationships.find(r => r.status === 'active');
            if (active) partnerId = active.partnerId;
          }
          if (!partnerId) partnerId = u.activeRelationship || null;
        }

        // 查询自己发送的 + 伴侣发送给我的
        const listResult = await db.collection('heartbeats')
          .where(_.or(
            { userId: openid },      // 我发送的
            { partnerId: openid }    // 伴侣发送给我的
          ))
          .orderBy('createTime', 'desc')
          .limit(50)
          .get();

        // 获取用户信息（批量查询）
        const uniqueUserIds = [...new Set(listResult.data.map(h => h.userId))];
        const userInfosRes = await db.collection('users')
          .where({ _openid: _.in(uniqueUserIds) })
          .get();
        const userInfos = {};
        userInfosRes.data.forEach(u => { userInfos[u._openid] = u; });

        // 附加方向标记，用于前端区分"我发出的"和"我收到的"
        const heartbeats = listResult.data.map(h => ({
          ...h,
          isSentByMe: h.userId === openid
        }));

        return { success: true, heartbeats, userInfos };
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
