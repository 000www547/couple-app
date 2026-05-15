// 云函数：甜蜜时刻
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
        // 发布新动态
        const newMoment = {
          userId: openid,
          content: event.content || '',
          images: event.images || [],
          likes: 0,
          likedBy: [],
          createTime: db.serverDate()
        };

        const addResult = await db.collection('moments').add({
          data: newMoment
        });

        return {
          success: true,
          id: addResult._id
        };

      case 'getList':
        // 获取动态列表 - 仅显示自己和伴侣的动态
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

        // 查询动态列表
        const listResult = await db.collection('moments')
          .where({
            userId: _.in(userIds)
          })
          .orderBy('createTime', 'desc')
          .limit(50)
          .get();

        // 获取用户信息
        const uniqueUserIds = [...new Set(listResult.data.map(m => m.userId))];
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
          moments: listResult.data,
          userInfos
        };

      case 'like':
        // 点赞/取消点赞
        const moment = await db.collection('moments').doc(event.momentId).get();
        const likedBy = moment.data.likedBy || [];
        const isLiked = likedBy.includes(openid);

        if (isLiked) {
          // 取消点赞
          await db.collection('moments').doc(event.momentId).update({
            data: {
              likes: _.inc(-1),
              likedBy: _.pull(openid)
            }
          });
        } else {
          // 点赞
          await db.collection('moments').doc(event.momentId).update({
            data: {
              likes: _.inc(1),
              likedBy: _.push(openid)
            }
          });
        }

        return {
          success: true,
          liked: !isLiked
        };

      case 'delete':
        // 删除动态（仅发布者可以删除）
        const delMoment = await db.collection('moments').doc(event.momentId).get();
        if (delMoment.data.userId !== openid) {
          return {
            success: false,
            error: '无权限删除'
          };
        }

        await db.collection('moments').doc(event.momentId).remove();
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
