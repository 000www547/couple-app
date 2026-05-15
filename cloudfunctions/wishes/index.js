// 云函数：心愿清单
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
      case 'add':
        // 添加心愿
        const newWish = {
          userId: openid,
          title: event.title,
          description: event.description || '',
          isCompleted: false,
          completedBy: '',
          completedTime: null,
          isShared: event.isShared || false, // 是否为共同心愿
          createTime: db.serverDate()
        };

        const addResult = await db.collection('wishes').add({
          data: newWish
        });

        return {
          success: true,
          id: addResult._id
        };

      case 'getList':
        // 获取心愿列表 - 根据关系系统查询
        let userIds = [openid];
        let partnerIds = [];

        // 获取用户信息，查找关系
        const user = await db.collection('users').where({
          _openid: openid
        }).get();

        if (user.data && user.data.length > 0) {
          const userData = user.data[0];

          // 从 relationships 中获取所有关系
          if (userData.relationships && userData.relationships.length > 0) {
            const activeRelations = userData.relationships.filter(r => r.status === 'active');
            partnerIds = activeRelations.map(r => r.partnerId);
            userIds = [...userIds, ...partnerIds];
          }

          // 也添加 activeRelationship（兼容旧数据）
          if (userData.activeRelationship && !partnerIds.includes(userData.activeRelationship)) {
            partnerIds.push(userData.activeRelationship);
            userIds.push(userData.activeRelationship);
          }
        }

        if (event.type === 'my') {
          // 我的心愿 - 仅自己的
          const myResult = await db.collection('wishes').where({
            userId: openid
          }).orderBy('createTime', 'desc').get();

          return {
            success: true,
            wishes: myResult.data
          };
        } else if (event.type === 'shared') {
          // 共同心愿 - 自己设为共同的 + 伴侣设为共同的
          if (partnerIds.length === 0) {
            // 没有关系，返回自己的共同心愿
            const myShared = await db.collection('wishes').where({
              userId: openid,
              isShared: true
            }).orderBy('createTime', 'desc').get();

            return {
              success: true,
              wishes: myShared.data
            };
          }

          const listResult = await db.collection('wishes').where(
            _.or([
              { userId: openid, isShared: true },
              ...partnerIds.map(pid => ({ userId: pid, isShared: true }))
            ])
          ).orderBy('createTime', 'desc').get();

          return {
            success: true,
            wishes: listResult.data
          };
        } else {
          // 所有 - 自己和伴侣的所有心愿
          if (userIds.length === 1) {
            const myResult = await db.collection('wishes').where({
              userId: openid
            }).orderBy('createTime', 'desc').get();

            return {
              success: true,
              wishes: myResult.data
            };
          }

          const listResult = await db.collection('wishes').where({
            userId: _.in(userIds)
          }).orderBy('createTime', 'desc').get();

          return {
            success: true,
            wishes: listResult.data
          };
        }

      case 'complete':
        // 完成心愿
        await db.collection('wishes').doc(event.wishId).update({
          data: {
            isCompleted: true,
            completedBy: openid,
            completedTime: db.serverDate()
          }
        });

        return {
          success: true
        };

      case 'uncomplete':
        // 取消完成
        await db.collection('wishes').doc(event.wishId).update({
          data: {
            isCompleted: false,
            completedBy: '',
            completedTime: null
          }
        });

        return {
          success: true
        };

      case 'delete':
        // 删除心愿
        await db.collection('wishes').doc(event.wishId).remove();
        return {
          success: true
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