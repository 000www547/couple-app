/**
 * @fileoverview 甜蜜时刻云函数
 * - 发布/删除图文动态
 * - 点赞/取消点赞（伴侣点赞+1亲密度）
 * - 评论（伴侣评论+1亲密度）
 * - 批量获取动态+用户信息+头像HTTPS转换
 * @module moments
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

// ============================================================
// 类型定义
// ============================================================

/**
 * @typedef {'add'|'getList'|'like'|'delete'|'addComment'|'getComments'|'deleteComment'} MomentsAction
 */

/**
 * @typedef {Object} MomentsEvent
 * @property {MomentsAction} action
 * @property {string} [content]     - add: 动态内容
 * @property {string[]} [images]    - add: 图片列表
 * @property {string} [momentId]   - like/delete/addComment/getComments: 动态ID
 * @property {string} [commentId]  - deleteComment: 评论ID
 * @property {string} [replyTo]           - addComment: 回复评论ID
 * @property {string} [replyToUserId]     - addComment: 回复用户ID
 */

/**
 * @typedef {Object} WXContext
 * @property {string} OPENID
 */

// ============================================================
// 工具函数
// ============================================================

/**
 * 从用户记录中获取当前激活的伴侣 openid
 * @param {any} userRecord
 * @returns {string|null}
 */
function getPartnerId(userRecord) {
  /** @type {string|null} */
  let pid = null;
  if (userRecord.relationships && userRecord.relationships.length > 0) {
    const active = userRecord.relationships.find(/** @param {any} r */ (r) => r.status === 'active');
    if (active) pid = active.partnerId;
  }
  if (!pid) pid = userRecord.activeRelationship || null;
  return pid;
}

/**
 * 批量获取用户信息并转换头像为 HTTPS
 * @param {string[]} openids
 * @returns {Promise<Record<string, {_openid:string,nickname:string,avatar:string}>>}
 */
async function fetchUserInfos(openids) {
  /** @type {Record<string, {_openid:string,nickname:string,avatar:string}>} */
  const userInfos = {};
  /** @type {string[]} */
  const cloudAvatars = [];
  /** @type {Record<string,string>} */
  const avatarMap = {};

  /** @type {{ data: any[] }} */
  const userInfosRes = await db.collection('users').where({ _openid: _.in(openids) }).get();

  userInfosRes.data.forEach(/** @param {any} u */ (u) => {
    if (u.avatar && u.avatar.startsWith('cloud://')) {
      cloudAvatars.push(u.avatar);
      avatarMap[u.avatar] = u._openid;
    }
    userInfos[u._openid] = { _openid: u._openid, nickname: u.nickname, avatar: u.avatar };
  });

  if (cloudAvatars.length > 0) {
    try {
      /** @type {{ fileList: Array<{fileID:string,tempFileURL?:string}> }} */
      const urlRes = await cloud.getTempFileURL({ fileList: cloudAvatars });
      if (urlRes.fileList) {
        urlRes.fileList.forEach(/** @param {any} file */ (file) => {
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

  return userInfos;
}

/**
 * 批量转换动态图片 cloud:// → HTTPS
 * @param {any[]} moments
 * @returns {Promise<void>}
 */
async function convertMomentImages(moments) {
  /** @type {string[]} */
  const cloudImages = [];
  /** @type {Record<string,string>} */
  const imageMap = {};

  moments.forEach(/** @param {any} m */ (m) => {
    if (m.images && m.images.length > 0) {
      m.images.forEach(/** @param {string} img */ (img) => {
        if (img && img.startsWith('cloud://') && !imageMap[img]) {
          cloudImages.push(img);
          imageMap[img] = '';
        }
      });
    }
  });

  if (cloudImages.length === 0) return;

  try {
    /** @type {{ fileList: Array<{fileID:string,tempFileURL?:string}> }} */
    const imgUrlRes = await cloud.getTempFileURL({ fileList: cloudImages });
    if (imgUrlRes.fileList) {
      imgUrlRes.fileList.forEach(/** @param {any} file */ (file) => {
        if (file.tempFileURL) imageMap[file.fileID] = file.tempFileURL;
      });
    }

    moments.forEach(/** @param {any} m */ (m) => {
      if (m.images && m.images.length > 0) {
        m.images = m.images.map(/** @param {string} img */ (img) => imageMap[img] || img);
      }
    });
  } catch (e) {
    console.error('[moments] 动态图片转换失败', e);
  }
}

/**
 * 检查双方是否互为伴侣，若是则增加双方亲密度
 * @param {string} actorOpenid  - 触发者 openid
 * @param {string} targetOpenid - 目标用户 openid
 * @returns {Promise<void>}
 */
async function awardIntimacyIfPartners(actorOpenid, targetOpenid) {
  if (actorOpenid === targetOpenid) return;

  /** @type {{ data: any[] }} */
  const userRes = await db.collection('users').where({ _openid: actorOpenid }).get();
  if (!userRes.data || userRes.data.length === 0) return;

  const partnerId = getPartnerId(userRes.data[0]);
  if (partnerId === targetOpenid) {
    await Promise.all([
      db.collection('users').where({ _openid: actorOpenid }).update({
        data: { intimacy: _.inc(1), lastIntimacyUpdate: db.serverDate() },
      }),
      db.collection('users').where({ _openid: targetOpenid }).update({
        data: { intimacy: _.inc(1), lastIntimacyUpdate: db.serverDate() },
      }),
    ]);
  }
}

// ============================================================
// 云函数入口
// ============================================================

/**
 * @param {MomentsEvent & WXContext} event
 * @param {any} context
 */
exports.main = async (event, context) => {
  /** @type {string} */
  const openid = cloud.getWXContext().OPENID;
  /** @type {MomentsAction} */
  const { action } = event;

  try {
    switch (action) {
      // ---- 发布动态 ----
      case 'add': {
        /** @type {{ _id: string }} */
        const addResult = await db.collection('moments').add({
          data: {
            userId: openid,
            content: event.content || '',
            images: event.images || [],
            likes: 0,
            likedBy: [],
            createTime: db.serverDate(),
          },
        });
        return { success: true, id: addResult._id };
      }

      // ---- 获取动态列表 ----
      case 'getList': {
        /** @type {string[]} */
        let userIds = [openid];

        /** @type {{ data: any[] }} */
        const partnerRes = await db.collection('users').where({ _openid: openid }).get();
        if (partnerRes.data && partnerRes.data.length > 0) {
          const pid = getPartnerId(partnerRes.data[0]);
          if (pid) userIds.push(pid);
        }

        /** @type {{ data: any[] }} */
        const listResult = await db.collection('moments')
          .where({ userId: _.in(userIds) })
          .orderBy('createTime', 'desc')
          .limit(50)
          .get();

        // 批量获取用户信息（含头像 HTTPS 转换）
        const uniqueUserIds = [...new Set(listResult.data.map(/** @param {any} m */ (m) => m.userId))];
        const userInfos = await fetchUserInfos(uniqueUserIds);

        // 转换动态图片
        await convertMomentImages(listResult.data);

        return { success: true, moments: listResult.data, userInfos };
      }

      // ---- 点赞/取消点赞 ----
      case 'like': {
        /** @type {{ data: any }} */
        const momentRes = await db.collection('moments').doc(event.momentId).get();
        if (!momentRes.data) return { success: false, error: '动态不存在' };

        /** @type {string} */
        const momentOwner = momentRes.data.userId;
        /** @type {string[]} */
        const likedBy = momentRes.data.likedBy || [];
        /** @type {boolean} */
        const isLiked = likedBy.includes(openid);

        if (isLiked) {
          await db.collection('moments').doc(event.momentId).update({
            data: { likes: _.inc(-1), likedBy: _.pull(openid) },
          });
        } else {
          await db.collection('moments').doc(event.momentId).update({
            data: { likes: _.inc(1), likedBy: _.push(openid) },
          });
          // 伴侣点赞 → 双方各 +1 亲密度
          await awardIntimacyIfPartners(openid, momentOwner);
        }

        return { success: true, liked: !isLiked };
      }

      // ---- 删除动态 ----
      case 'delete': {
        /** @type {{ data: any }} */
        const delMoment = await db.collection('moments').doc(event.momentId).get();
        if (delMoment.data.userId !== openid) return { success: false, error: '无权限删除' };
        await db.collection('moments').doc(event.momentId).remove();
        return { success: true };
      }

      // ---- 添加评论 ----
      case 'addComment': {
        /** @type {{ data: any }} */
        const targetMomentRes = await db.collection('moments').doc(event.momentId).get();
        if (!targetMomentRes.data) return { success: false, error: '动态不存在' };

        /** @type {string} */
        const momentOwner = targetMomentRes.data.userId;

        await db.collection('comments').add({
          data: {
            momentId: event.momentId,
            userId: openid,
            content: event.content || '',
            replyTo: event.replyTo || null,
            replyToUserId: event.replyToUserId || null,
            createTime: db.serverDate(),
          },
        });

        // 伴侣评论 → 双方各 +1 亲密度
        await awardIntimacyIfPartners(openid, momentOwner);
        return { success: true };
      }

      // ---- 获取评论列表 ----
      case 'getComments': {
        /** @type {{ data: any[] }} */
        const commentsResult = await db.collection('comments')
          .where({ momentId: event.momentId })
          .orderBy('createTime', 'asc')
          .get();

        // 批量获取评论者信息（含头像 HTTPS 转换）
        const commentUniqueUserIds = [...new Set(commentsResult.data.map(/** @param {any} c */ (c) => c.userId))];
        const commentUserInfos = await fetchUserInfos(commentUniqueUserIds);

        return { success: true, comments: commentsResult.data, commentUserInfos };
      }

      // ---- 删除评论 ----
      case 'deleteComment': {
        /** @type {{ data: any }} */
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
    /** @type {string} */
    const msg = error.message;
    return { success: false, error: msg };
  }
};
