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
      case 'add': {
        // 发布新动态
        const newMoment = {
          userId: openid,
          content: event.content || '',
          images: event.images || [],
          likes: 0,
          likedBy: [],
          createTime: db.serverDate()
        };
        const addResult = await db.collection('moments').add({ data: newMoment });
        return { success: true, id: addResult._id };
      }

      case 'getList': {
        // 获取动态列表 - 仅显示自己和伴侣的动态
        let userIds = [openid];
        const partnerId = await getPartnerId(openid);
        if (partnerId) userIds.push(partnerId);

        const listResult = await db.collection('moments')
          .where({ userId: _.in(userIds) })
          .orderBy('createTime', 'desc')
          .limit(50)
          .get();

        // 获取用户信息
        const uniqueUserIds = [...new Set(listResult.data.map(m => m.userId))];
        const userInfos = {};
        for (const uid of uniqueUserIds) {
          const u = await db.collection('users').where({ _openid: uid }).get();
          if (u.data && u.data.length > 0) userInfos[uid] = u.data[0];
        }
        return { success: true, moments: listResult.data, userInfos };
      }

      case 'like': {
        // 点赞/取消点赞
        const moment = await db.collection('moments').doc(event.momentId).get();
        if (!moment.data) return { success: false, error: '动态不存在' };

        const momentOwner = moment.data.userId;
        const likedBy = moment.data.likedBy || [];
        const isLiked = likedBy.includes(openid);

        if (isLiked) {
          // 取消点赞
          await db.collection('moments').doc(event.momentId).update({
            data: { likes: _.inc(-1), likedBy: _.pull(openid) }
          });
        } else {
          // 点赞
          await db.collection('moments').doc(event.momentId).update({
            data: { likes: _.inc(1), likedBy: _.push(openid) }
          });
          // 非本人点赞 且 互为伴侣 时才增加亲密度（双方各+1）
          if (openid !== momentOwner) {
            const userA = await db.collection('users').where({ _openid: openid }).get();
            if (userA.data && userA.data.length > 0) {
              const u = userA.data[0];
              let partnerOfA = null;
              if (u.relationships && u.relationships.length > 0) {
                const active = u.relationships.find(r => r.status === 'active');
                if (active) partnerOfA = active.partnerId;
              }
              if (!partnerOfA) partnerOfA = u.activeRelationship || null;

              if (partnerOfA === momentOwner) {
                await db.collection('users').where({ _openid: openid }).update({
                  data: { intimacy: _.inc(1), lastIntimacyUpdate: db.serverDate() }
                });
                await db.collection('users').where({ _openid: momentOwner }).update({
                  data: { intimacy: _.inc(1), lastIntimacyUpdate: db.serverDate() }
                });
              }
            }
          }
        }
        return { success: true, liked: !isLiked };
      }

      case 'delete': {
        const delMoment = await db.collection('moments').doc(event.momentId).get();
        if (delMoment.data.userId !== openid) {
          return { success: false, error: '无权限删除' };
        }
        await db.collection('moments').doc(event.momentId).remove();
        return { success: true };
      }

      case 'addComment': {
        // 添加评论
        const targetMoment = await db.collection('moments').doc(event.momentId).get();
        if (!targetMoment.data) return { success: false, error: '动态不存在' };

        const momentOwner = targetMoment.data.userId;
        const newComment = {
          momentId: event.momentId,
          userId: openid,
          content: event.content || '',
          replyTo: event.replyTo || null,
          replyToUserId: event.replyToUserId || null,
          createTime: db.serverDate()
        };
        await db.collection('comments').add({ data: newComment });

        // 非本人评论 且 互为伴侣 时才增加亲密度（双方各+1）
        // 优化：只查一次 A 的数据
        if (openid !== momentOwner) {
          const userA = await db.collection('users').where({ _openid: openid }).get();
          if (userA.data && userA.data.length > 0) {
            const u = userA.data[0];
            let partnerOfA = null;
            if (u.relationships && u.relationships.length > 0) {
              const active = u.relationships.find(r => r.status === 'active');
              if (active) partnerOfA = active.partnerId;
            }
            if (!partnerOfA) partnerOfA = u.activeRelationship || null;

            if (partnerOfA === momentOwner) {
              await db.collection('users').where({ _openid: openid }).update({
                data: { intimacy: _.inc(1), lastIntimacyUpdate: db.serverDate() }
              });
              await db.collection('users').where({ _openid: momentOwner }).update({
                data: { intimacy: _.inc(1), lastIntimacyUpdate: db.serverDate() }
              });
            }
          }
        }
        return { success: true };
      }

      case 'getComments': {
        const commentsResult = await db.collection('comments')
          .where({ momentId: event.momentId })
          .orderBy('createTime', 'asc')
          .get();

        const commentUniqueUserIds = [...new Set(commentsResult.data.map(c => c.userId))];
        const commentUserInfos = {};
        for (const uid of commentUniqueUserIds) {
          const u = await db.collection('users').where({ _openid: uid }).get();
          if (u.data && u.data.length > 0) commentUserInfos[uid] = u.data[0];
        }
        return { success: true, comments: commentsResult.data, commentUserInfos };
      }

      case 'deleteComment': {
        const commentToDelete = await db.collection('comments').doc(event.commentId).get();
        if (!commentToDelete.data || commentToDelete.data.userId !== openid) {
          return { success: false, error: '无权限删除' };
        }
        await db.collection('comments').doc(event.commentId).remove();
        return { success: true };
      }

      default:
        return { success: false, error: '未知操作' };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
};
