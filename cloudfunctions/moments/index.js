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

        // 内联获取伴侣ID，不依赖外部函数
        const partnerRes = await db.collection('users').where({ _openid: openid }).get();
        if (partnerRes.data && partnerRes.data.length > 0) {
          const u = partnerRes.data[0];
          let pid = null;
          if (u.relationships && u.relationships.length > 0) {
            const active = u.relationships.find(r => r.status === 'active');
            if (active) pid = active.partnerId;
          }
          if (!pid) pid = u.activeRelationship || null;
          if (pid) userIds.push(pid);
        }

        const listResult = await db.collection('moments')
          .where({ userId: _.in(userIds) })
          .orderBy('createTime', 'desc')
          .limit(50)
          .get();

        // 批量获取用户信息，避免循环DB调用
        const uniqueUserIds = [...new Set(listResult.data.map(m => m.userId))];
        const userInfosRes = await db.collection('users')
          .where({ _openid: _.in(uniqueUserIds) })
          .get();
        // 转换头像 cloud:// → HTTPS
        const userInfos = {};
        const cloudAvatars = [];
        const avatarMap = {}; // cloudUrl -> openid

        userInfosRes.data.forEach(u => {
          if (u.avatar && u.avatar.startsWith('cloud://')) {
            cloudAvatars.push(u.avatar);
            avatarMap[u.avatar] = u._openid;
          }
          userInfos[u._openid] = { _openid: u._openid, nickname: u.nickname, avatar: u.avatar };
        });

        if (cloudAvatars.length > 0) {
          try {
            const urlRes = await cloud.getTempFileURL({ fileList: cloudAvatars });
            if (urlRes.fileList) {
              urlRes.fileList.forEach(file => {
                if (file.tempFileURL && avatarMap[file.fileID]) {
                  const oid = avatarMap[file.fileID];
                  userInfos[oid].avatar = file.tempFileURL;
                }
              });
            }
          } catch (e) {
            console.error('[moments] 头像转换失败', e);
          }
        }

        // 转换动态图片 cloud:// → HTTPS
        const cloudImages = [];
        const imageMap = {}; // cloudUrl -> tempFileURL
        listResult.data.forEach(m => {
          if (m.images && m.images.length > 0) {
            m.images.forEach(img => {
              if (img && img.startsWith('cloud://') && !imageMap[img]) {
                cloudImages.push(img);
                imageMap[img] = null; // 占位，后续填充真实 URL
              }
            });
          }
        });

        if (cloudImages.length > 0) {
          try {
            const imgUrlRes = await cloud.getTempFileURL({ fileList: cloudImages });
            if (imgUrlRes.fileList) {
              imgUrlRes.fileList.forEach(file => {
                if (file.tempFileURL) {
                  imageMap[file.fileID] = file.tempFileURL;
                }
              });
            }
            // 替换 moment.images 中的 cloud:// 为 HTTPS
            listResult.data.forEach(m => {
              if (m.images && m.images.length > 0) {
                m.images = m.images.map(img => imageMap[img] || img);
              }
            });
          } catch (e) {
            console.error('[moments] 动态图片转换失败', e);
          }
        }

        return { success: true, moments: listResult.data, userInfos };
      }

      case 'like': {
        // 点赞/取消点赞
        const momentRes = await db.collection('moments').doc(event.momentId).get();
        if (!momentRes.data) return { success: false, error: '动态不存在' };

        const momentOwner = momentRes.data.userId;
        const likedBy = momentRes.data.likedBy || [];
        const isLiked = likedBy.includes(openid);

        if (isLiked) {
          await db.collection('moments').doc(event.momentId).update({
            data: { likes: _.inc(-1), likedBy: _.pull(openid) }
          });
        } else {
          await db.collection('moments').doc(event.momentId).update({
            data: { likes: _.inc(1), likedBy: _.push(openid) }
          });
          // 非本人点赞 且 互为伴侣 时才增加亲密度（双方各+1，并行更新）
          if (openid !== momentOwner) {
            const userRes = await db.collection('users').where({ _openid: openid }).get();
            if (userRes.data && userRes.data.length > 0) {
              const u = userRes.data[0];
              let partnerOfA = null;
              if (u.relationships && u.relationships.length > 0) {
                const active = u.relationships.find(r => r.status === 'active');
                if (active) partnerOfA = active.partnerId;
              }
              if (!partnerOfA) partnerOfA = u.activeRelationship || null;

              if (partnerOfA === momentOwner) {
                await Promise.all([
                  db.collection('users').where({ _openid: openid }).update({
                    data: { intimacy: _.inc(1), lastIntimacyUpdate: db.serverDate() }
                  }),
                  db.collection('users').where({ _openid: momentOwner }).update({
                    data: { intimacy: _.inc(1), lastIntimacyUpdate: db.serverDate() }
                  })
                ]);
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
        const targetMomentRes = await db.collection('moments').doc(event.momentId).get();
        if (!targetMomentRes.data) return { success: false, error: '动态不存在' };

        const momentOwner = targetMomentRes.data.userId;
        const newComment = {
          momentId: event.momentId,
          userId: openid,
          content: event.content || '',
          replyTo: event.replyTo || null,
          replyToUserId: event.replyToUserId || null,
          createTime: db.serverDate()
        };
        await db.collection('comments').add({ data: newComment });

        // 非本人评论 且 互为伴侣 时才增加亲密度（双方各+1，并行更新）
        if (openid !== momentOwner) {
          const userRes = await db.collection('users').where({ _openid: openid }).get();
          if (userRes.data && userRes.data.length > 0) {
            const u = userRes.data[0];
            let partnerOfA = null;
            if (u.relationships && u.relationships.length > 0) {
              const active = u.relationships.find(r => r.status === 'active');
              if (active) partnerOfA = active.partnerId;
            }
            if (!partnerOfA) partnerOfA = u.activeRelationship || null;

            if (partnerOfA === momentOwner) {
              await Promise.all([
                db.collection('users').where({ _openid: openid }).update({
                  data: { intimacy: _.inc(1), lastIntimacyUpdate: db.serverDate() }
                }),
                db.collection('users').where({ _openid: momentOwner }).update({
                  data: { intimacy: _.inc(1), lastIntimacyUpdate: db.serverDate() }
                })
              ]);
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

        // 批量获取用户信息，避免循环DB调用
        const commentUniqueUserIds = [...new Set(commentsResult.data.map(c => c.userId))];
        const commentUserInfosRes = await db.collection('users')
          .where({ _openid: _.in(commentUniqueUserIds) })
          .get();
        // 转换头像 cloud:// → HTTPS
        const commentUserInfos = {};
        const cloudAvatars = [];
        const avatarMap = {};

        commentUserInfosRes.data.forEach(u => {
          if (u.avatar && u.avatar.startsWith('cloud://')) {
            cloudAvatars.push(u.avatar);
            avatarMap[u.avatar] = u._openid;
          }
          commentUserInfos[u._openid] = { _openid: u._openid, nickname: u.nickname, avatar: u.avatar };
        });

        if (cloudAvatars.length > 0) {
          try {
            const urlRes = await cloud.getTempFileURL({ fileList: cloudAvatars });
            if (urlRes.fileList) {
              urlRes.fileList.forEach(file => {
                if (file.tempFileURL && avatarMap[file.fileID]) {
                  const oid = avatarMap[file.fileID];
                  commentUserInfos[oid].avatar = file.tempFileURL;
                }
              });
            }
          } catch (e) {
            console.error('[moments] 评论头像转换失败', e);
          }
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
