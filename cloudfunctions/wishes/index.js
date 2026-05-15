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
        // 获取心愿列表
        if (event.type === 'my') {
          // 我的心愿
          const myResult = await db.collection('wishes').where({
            userId: openid
          }).orderBy('createTime', 'desc').get();
          
          return {
            success: true,
            wishes: myResult.data
          };
        } else if (event.type === 'shared') {
          // 共同心愿（需要先获取伴侣ID）
          const user = await db.collection('users').where({
            _openid: openid
          }).get();
          
          if (user.data && user.data[0] && user.data[0].partnerId) {
            // 获取双方的心愿
            const partnerId = user.data[0].partnerId;
            const listResult = await db.collection('wishes').where(
              _.or([
                { userId: openid, isShared: true },
                { userId: partnerId, isShared: true }
              ])
            ).orderBy('createTime', 'desc').get();
            
            return {
              success: true,
              wishes: listResult.data
            };
          }
          
          return {
            success: true,
            wishes: []
          };
        } else {
          // 所有（我的 + 共同的）
          const user = await db.collection('users').where({
            _openid: openid
          }).get();
          
          let listResult;
          if (user.data && user.data[0] && user.data[0].partnerId) {
            const partnerId = user.data[0].partnerId;
            listResult = await db.collection('wishes').where(
              _.or([
                { userId: openid },
                { userId: partnerId }
              ])
            ).orderBy('createTime', 'desc').get();
          } else {
            listResult = await db.collection('wishes').where({
              userId: openid
            }).orderBy('createTime', 'desc').get();
          }
          
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