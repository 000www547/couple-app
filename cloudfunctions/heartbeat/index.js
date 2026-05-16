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
      case 'send':
        // 发送心跳/戳一戳
        const heartbeat = {
          userId: openid,
          type: event.type || 'heartbeat', // 'heartbeat' | 'poke'
          createTime: db.serverDate(),
          isRead: false
        };

        const addResult = await db.collection('heartbeats').add({
          data: heartbeat
        });

        return {
          success: true,
          id: addResult._id
        };

      case 'getList':
        // 获取心跳列表（仅显示自己和伴侣的）
        let userIds = [openid];

        // 获取用户信息，查找伴侣ID
        const currentUser = await db.collection('users').where({
          _openid: openid
        }).get();

        if (currentUser.data && currentUser.data.length > 0) {
          const user = currentUser.data[0];

          // 从 relationships 中获取所有关系
          if (user.relationships && user.relationships.length > 0) {
            const activeRelations = user.relationships.filter(r => r.status === 'active');
            userIds = [...userIds, ...activeRelations.map(r => r.partnerId)];
          }

          // 也添加 activeRelationship（兼容旧数据）
          if (user.activeRelationship && !userIds.includes(user.activeRelationship)) {
            userIds.push(user.activeRelationship);
          }
        }

        // 查询心跳列表
        const listResult = await db.collection('heartbeats')
          .where({
            userId: _.in(userIds)
          })
          .orderBy('createTime', 'desc')
          .limit(50)
          .get();

        // 获取用户信息
        const uniqueUserIds = [...new Set(listResult.data.map(h => h.userId))];
        const userInfos = {};

        if (uniqueUserIds.length > 0) {
          for (const userId of uniqueUserIds) {
            const user = await db.collection('users').where({
              _openid: userId
            }).get();
            if (user.data && user.data.length > 0) {
              userInfos[userId] = user.data[0];
            }
          }
        }

        return {
          success: true,
          heartbeats: listResult.data,
          userInfos
        };

      case 'markRead':
        // 标记已读
        await db.collection('heartbeats').doc(event.id).update({
          data: {
            isRead: true
          }
        });
        return {
          success: true
        };

      case 'getUnreadCount':
        // 获取未读心跳数量
        let unreadUserIds = [openid];

        const unreadUser = await db.collection('users').where({
          _openid: openid
        }).get();

        if (unreadUser.data && unreadUser.data.length > 0) {
          const user = unreadUser.data[0];

          if (user.relationships && user.relationships.length > 0) {
            const activeRelations = user.relationships.filter(r => r.status === 'active');
            unreadUserIds = [...unreadUserIds, ...activeRelations.map(r => r.partnerId)];
          }

          if (user.activeRelationship && !unreadUserIds.includes(user.activeRelationship)) {
            unreadUserIds.push(user.activeRelationship);
          }
        }

        const unreadResult = await db.collection('heartbeats')
          .where({
            userId: _.in(unreadUserIds),
            isRead: false,
            _openid: _.neq(openid) // 不是自己发送的
          })
          .count();

        return {
          success: true,
          count: unreadResult.total
        };

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
