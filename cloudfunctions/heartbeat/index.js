/**
 * @fileoverview 心跳/戳一戳云函数
 * - 发送心跳 +2 亲密度（双方）
 * - 获取心跳历史（含方向标记）
 * - 未读数统计
 * - 已移除 async/await，兼容 Node.js 8.9
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

/**
 * 心跳云函数入口
 * @param {Object} event - 事件对象
 * @param {string} event.action - 操作类型: send|getList|markRead|getUnreadCount
 * @param {string} [event.id] - markRead 用：心跳记录 ID
 * @param {string} [event.type] - 心跳类型
 * @param {Object} context - 上下文
 * @returns {Promise<Object>} - 返回操作结果
 */
exports.main = function (event, context) {
  var openid = cloud.getWXContext().OPENID;
  var action = event.action;
  console.log('[heartbeat] 收到请求, action:', action, 'openid:', openid);

  switch (action) {
    case 'send':
      return sendHeartbeat(openid, event);
    case 'getList':
      return getHeartbeatList(openid);
    case 'markRead':
      return markRead(event.id);
    case 'getUnreadCount':
      return getUnreadCount(openid);
    default:
      return Promise.resolve({ success: false, error: '未知操作' });
  }
};

/**
 * 发送心跳
 * @param {string} openid - 用户 openid
 * @param {Object} event - 事件对象
 * @returns {Promise<Object>}
 */
function sendHeartbeat(openid, event) {
  console.log('[heartbeat] send: 开始查询用户', openid);
  
  return db.collection('users').where({ _openid: openid }).get().then(function(userRes) {
    console.log('[heartbeat] send: 用户查询结果', userRes.data.length);
    
    if (!userRes.data || userRes.data.length === 0) {
      return { success: false, error: '用户不存在' };
    }
    
    var user = userRes.data[0];
    var partnerId = null;
    
    if (user.relationships && user.relationships.length > 0) {
      var active = null;
      for (var i = 0; i < user.relationships.length; i++) {
        if (user.relationships[i].status === 'active') {
          active = user.relationships[i];
          break;
        }
      }
      if (active) partnerId = active.partnerId;
    }
    if (!partnerId) partnerId = user.activeRelationship || null;
    
    console.log('[heartbeat] send: partnerId:', partnerId);
    
    if (!partnerId) {
      return { success: false, error: '请先绑定伴侣' };
    }
    
    // 记录心跳 + 双方各+2亲密度（并行执行）
    return Promise.all([
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
    ]).then(function() {
      console.log('[heartbeat] send: 完成');
      return { success: true };
    });
  }).catch(function(error) {
    console.error('[heartbeat] send: 失败', error);
    return { success: false, error: error.message };
  });
}

/**
 * 获取心跳列表
 * @param {string} openid - 用户 openid
 * @returns {Promise<Object>}
 */
function getHeartbeatList(openid) {
  var partnerId = null;
  
  return db.collection('users').where({ _openid: openid }).get().then(function(userListRes) {
    if (userListRes.data && userListRes.data.length > 0) {
      var u = userListRes.data[0];
      if (u.relationships && u.relationships.length > 0) {
        var active = null;
        for (var i = 0; i < u.relationships.length; i++) {
          if (u.relationships[i].status === 'active') {
            active = u.relationships[i];
            break;
          }
        }
        if (active) partnerId = active.partnerId;
      }
      if (!partnerId) partnerId = u.activeRelationship || null;
    }
    
    return db.collection('heartbeats')
      .where(_.or([
        { userId: openid },
        { partnerId: openid }
      ]))
      .orderBy('createTime', 'desc')
      .limit(50)
      .get();
  }).then(function(listResult) {
    // 批量获取用户信息
    var uniqueUserIds = [];
    for (var j = 0; j < listResult.data.length; j++) {
      var uid = listResult.data[j].userId;
      if (uniqueUserIds.indexOf(uid) === -1) {
        uniqueUserIds.push(uid);
      }
    }
    
    return db.collection('users')
      .where({ _openid: _.in(uniqueUserIds) })
      .get()
      .then(function(userInfosRes) {
        return {
          listResult: listResult,
          userInfosRes: userInfosRes
        };
      });
  }).then(function(data) {
    var listResult = data.listResult;
    var userInfosRes = data.userInfosRes;
    
    var userInfos = {};
    var cloudAvatars = [];
    var avatarMap = {};
    
    userInfosRes.data.forEach(function(u) {
      userInfos[u._openid] = u;
      if (u.avatar && u.avatar.startsWith('cloud://')) {
        cloudAvatars.push(u.avatar);
        avatarMap[u._openid] = u.avatar;
      }
    });
    
    // 批量转换 cloud:// 头像为 HTTPS
    if (cloudAvatars.length > 0) {
      return cloud.getTempFileURL({ fileList: cloudAvatars }).then(function(urlRes) {
        if (urlRes.fileList) {
          urlRes.fileList.forEach(function(item) {
            if (item.tempFileURL) {
              var openidKey = null;
              var keys = Object.keys(avatarMap);
              for (var k = 0; k < keys.length; k++) {
                if (avatarMap[keys[k]] === item.fileID) {
                  openidKey = keys[k];
                  break;
                }
              }
              if (openidKey && userInfos[openidKey]) {
                userInfos[openidKey].avatar = item.tempFileURL;
              }
            }
          });
        }
        return listResult;
      }).then(function() {
        return { listResult: listResult, userInfos: userInfos };
      });
    }
    
    return { listResult: listResult, userInfos: userInfos };
  }).then(function(data) {
    var listResult = data.listResult;
    var userInfos = data.userInfos;
    
    // 附加方向标记
    var heartbeats = listResult.data.map(function(h) {
      return Object.assign({}, h, { isSentByMe: h.userId === openid });
    });
    
    return { success: true, heartbeats: heartbeats, userInfos: userInfos };
  }).catch(function(error) {
    console.error('[heartbeat] getList: 失败', error);
    return { success: false, error: error.message };
  });
}

/**
 * 标记已读
 * @param {string} id - 心跳记录 ID
 * @returns {Promise<Object>}
 */
function markRead(id) {
  return db.collection('heartbeats').doc(id).update({
    data: { isRead: true },
  }).then(function() {
    return { success: true };
  }).catch(function(error) {
    return { success: false, error: error.message };
  });
}

/**
 * 获取未读计数
 * @param {string} openid - 用户 openid
 * @returns {Promise<Object>}
 */
function getUnreadCount(openid) {
  var unreadUserIds = [openid];
  
  return db.collection('users').where({ _openid: openid }).get().then(function(unreadUserRes) {
    if (unreadUserRes.data && unreadUserRes.data.length > 0) {
      var u = unreadUserRes.data[0];
      var pid = null;
      if (u.relationships && u.relationships.length > 0) {
        var active = null;
        for (var i = 0; i < u.relationships.length; i++) {
          if (u.relationships[i].status === 'active') {
            active = u.relationships[i];
            break;
          }
        }
        if (active) pid = active.partnerId;
      }
      if (!pid) pid = u.activeRelationship || null;
      if (pid) unreadUserIds.push(pid);
    }
    
    return db.collection('heartbeats')
      .where({
        userId: _.in(unreadUserIds),
        isRead: false,
        _openid: _.neq(openid),
      })
      .count();
  }).then(function(unreadResult) {
    return { success: true, count: unreadResult.total };
  }).catch(function(error) {
    return { success: false, error: error.message };
  });
}
