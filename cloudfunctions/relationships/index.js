/**
 * @fileoverview 关系管理云函数 - Promise版(兼容Node.js 8.9)
 * - 绑定/解除关系（邀请码方式）
 * - 30天解绑冷却期
 * - 清除共同数据
 * @module relationships
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

// ============================================================
// 常量
// ============================================================

/** 关系类型映射 */
const RELATION_TYPES = {
  couple: '情侣',
  bestie: '闺蜜/兄弟',
  family: '家人',
  custom: '自定义',
};

/** 解绑等待天数 */
const UNBIND_WAIT_DAYS = 30;

// ============================================================
// 工具函数
// ============================================================

/**
 * 批量获取伴侣头像并转换为 HTTPS
 * @param {Record<string,string>} avatarMap
 * @returns {Promise<Record<string,string>>}
 */
function convertPartnerAvatars(avatarMap) {
  var cloudAvatars = [];
  Object.keys(avatarMap).forEach(function (oid) {
    var avatar = avatarMap[oid];
    if (avatar && avatar.indexOf('cloud://') === 0) {
      cloudAvatars.push(avatar);
    }
  });

  if (cloudAvatars.length === 0) return Promise.resolve(avatarMap);

  return cloud.getTempFileURL({ fileList: cloudAvatars }).then(function (urlRes) {
    if (urlRes.fileList) {
      var cloudIndex = 0;
      Object.keys(avatarMap).forEach(function (oid) {
        var avatar = avatarMap[oid];
        if (avatar && avatar.indexOf('cloud://') === 0) {
          var match = urlRes.fileList[cloudIndex];
          if (match && match.tempFileURL) avatarMap[oid] = match.tempFileURL;
          cloudIndex++;
        }
      });
    }
    return avatarMap;
  }).catch(function (e) {
    console.error('[relationships] 头像批量转换失败', e);
    return avatarMap;
  });
}

/**
 * 清除指定用户的共同数据
 * @param {string} userDocId
 * @param {string} partnerId
 */
function clearSharedDataForUser(userDocId, partnerId) {
  return Promise.all([
    db.collection('wishes').where({ userId: partnerId, isShared: true }).remove(),
    db.collection('anniversaries').where({ userId: partnerId }).remove(),
    db.collection('moments').where({ userId: partnerId }).remove(),
  ]);
}

// ============================================================
// 业务函数
// ============================================================

/**
 * 绑定关系
 * @param {string} openid
 * @param {Object} event
 */
function bindRelationship(openid, event) {
  var partnerCode = event.partnerCode;
  var relationType = event.relationType;
  var customRelationName = event.customRelationName;

  if (!partnerCode) return Promise.resolve({ success: false, error: '请提供邀请码' });

  var type = relationType || 'couple';
  if (!RELATION_TYPES[type]) return Promise.resolve({ success: false, error: '无效的关系类型' });

  if (type === 'custom' && !customRelationName) {
    return Promise.resolve({ success: false, error: '请输入自定义关系名称' });
  }

  var typeName = type === 'custom' ? customRelationName : RELATION_TYPES[type];

  return db.collection('users').where({ inviteCode: partnerCode }).get().then(function (partnerResult) {
    if (!partnerResult.data || partnerResult.data.length === 0) {
      return { success: false, error: '邀请码无效' };
    }

    var partner = partnerResult.data[0];
    if (partner._openid === openid) return { success: false, error: '不能绑定自己' };

    return db.collection('users').where({ _openid: openid }).get().then(function (currentUserResult) {
      if (!currentUserResult.data || currentUserResult.data.length === 0) {
        return { success: false, error: '用户不存在' };
      }

      var currentUser = currentUserResult.data[0];
      var existingRelationships = currentUser.relationships || [];

      var existingRelation = existingRelationships.find(function (r) {
        return r.partnerId === partner._openid;
      });
      if (existingRelation) return { success: false, error: '已经绑定过该关系' };

      var relationship = {
        partnerId: partner._openid,
        partnerName: partner.nickname || 'TA',
        type: type,
        typeName: typeName,
        status: 'active',
        createdAt: db.serverDate(),
        unbindRequestAt: null,
        unbindRequestBy: null,
      };

      existingRelationships.push(relationship);

      return db.collection('users').doc(currentUser._id).update({
        data: {
          relationships: existingRelationships,
          activeRelationship: partner._openid,
        },
      }).then(function () {
        // 更新对方
        var partnerRelationships = partner.relationships || [];
        var existingPartnerRelation = partnerRelationships.find(function (r) {
          return r.partnerId === openid;
        });

        if (!existingPartnerRelation) {
          partnerRelationships.push({
            partnerId: openid,
            partnerName: currentUser.nickname || 'TA',
            type: type,
            typeName: typeName,
            status: 'active',
            createdAt: db.serverDate(),
            unbindRequestAt: null,
            unbindRequestBy: null,
          });

          return db.collection('users').doc(partner._id).update({
            data: {
              relationships: partnerRelationships,
              activeRelationship: openid,
            },
          }).then(function () {
            return {
              success: true,
              relationship: relationship,
              partner: { _openid: partner._openid, nickname: partner.nickname },
            };
          });
        }

        return {
          success: true,
          relationship: relationship,
          partner: { _openid: partner._openid, nickname: partner.nickname },
        };
      });
    });
  });
}

/**
 * 获取关系列表
 * @param {string} openid
 */
function getRelationshipList(openid) {
  return db.collection('users').where({ _openid: openid }).get().then(function (userResult) {
    if (!userResult.data || userResult.data.length === 0) {
      return { success: false, error: '用户不存在' };
    }

    var user = userResult.data[0];
    var relationships = user.relationships || [];
    var activeRelationship = user.activeRelationship;

    var partnerIds = relationships.map(function (r) { return r.partnerId; });
    var partnerNameMap = {};
    var partnerAvatarMap = {};

    if (partnerIds.length === 0) {
      return { success: true, relationships: relationships, activeRelationship: activeRelationship };
    }

    return db.collection('users').where({ _openid: _.in(partnerIds) }).get().then(function (partnerUsers) {
      partnerUsers.data.forEach(function (p) {
        partnerNameMap[p._openid] = p.nickname || 'TA';
        partnerAvatarMap[p._openid] = p.avatar || '';
      });

      return convertPartnerAvatars(partnerAvatarMap).then(function (convertedAvatarMap) {
        var enrichedRelationships = relationships.map(function (rel) {
          rel.partnerName = partnerNameMap[rel.partnerId] || rel.partnerName || 'TA';
          rel.partnerAvatar = convertedAvatarMap[rel.partnerId] || '';
          if (rel.status === 'pending_unbind' && rel.unbindRequestAt) {
            var requestTime = new Date(rel.unbindRequestAt);
            var now = new Date();
            var daysPassed = Math.floor((now - requestTime) / (1000 * 60 * 60 * 24));
            rel.remainingDays = Math.max(0, UNBIND_WAIT_DAYS - daysPassed);
            rel.isExpiring = rel.remainingDays <= 7;
          }
          rel.isActive = rel.partnerId === activeRelationship;
          return rel;
        });

        return { success: true, relationships: enrichedRelationships, activeRelationship: activeRelationship };
      });
    });
  });
}

/**
 * 发起解除关系
 * @param {string} openid
 * @param {Object} event
 */
function requestUnbind(openid, event) {
  var partnerId = event.partnerId;
  if (!partnerId) return Promise.resolve({ success: false, error: '缺少关系对象ID' });

  return db.collection('users').where({ _openid: openid }).get().then(function (currentUserResult) {
    if (!currentUserResult.data || currentUserResult.data.length === 0) {
      return { success: false, error: '用户不存在' };
    }

    var currentUser = currentUserResult.data[0];
    var relationships = currentUser.relationships || [];

    var relationIndex = relationships.findIndex(function (r) {
      return r.partnerId === partnerId;
    });
    if (relationIndex === -1) return { success: false, error: '关系不存在' };

    var relation = relationships[relationIndex];
    if (relation.status === 'pending_unbind') return { success: false, error: '已有待确认的解绑请求' };

    relationships[relationIndex].status = 'pending_unbind';
    relationships[relationIndex].unbindRequestAt = new Date();
    relationships[relationIndex].unbindRequestBy = openid;

    return db.collection('users').doc(currentUser._id).update({ data: { relationships: relationships } }).then(function () {
      // 更新对方
      return db.collection('users').where({ _openid: partnerId }).get().then(function (partnerResult) {
        if (partnerResult.data && partnerResult.data.length > 0) {
          var partner = partnerResult.data[0];
          var partnerRelationships = partner.relationships || [];
          var partnerRelationIndex = partnerRelationships.findIndex(function (r) {
            return r.partnerId === openid;
          });
          if (partnerRelationIndex !== -1) {
            partnerRelationships[partnerRelationIndex].status = 'pending_unbind';
            partnerRelationships[partnerRelationIndex].unbindRequestAt = new Date();
            partnerRelationships[partnerRelationIndex].unbindRequestBy = openid;
            return db.collection('users').doc(partner._id).update({
              data: { relationships: partnerRelationships },
            }).then(function () {
              return { success: true, message: '已发起解除关系请求', remainingDays: UNBIND_WAIT_DAYS };
            });
          }
        }
        return { success: true, message: '已发起解除关系请求', remainingDays: UNBIND_WAIT_DAYS };
      });
    });
  });
}

/**
 * 确认解除关系
 * @param {string} openid
 * @param {Object} event
 */
function confirmUnbind(openid, event) {
  var partnerId = event.partnerId;
  if (!partnerId) return Promise.resolve({ success: false, error: '缺少关系对象ID' });

  return db.collection('users').where({ _openid: openid }).get().then(function (currentUserResult) {
    if (!currentUserResult.data || currentUserResult.data.length === 0) {
      return { success: false, error: '用户不存在' };
    }

    var currentUser = currentUserResult.data[0];
    var relationships = currentUser.relationships || [];

    var relationIndex = relationships.findIndex(function (r) {
      return r.partnerId === partnerId;
    });
    if (relationIndex === -1) return { success: false, error: '关系不存在' };

    var relation = relationships[relationIndex];
    if (relation.status !== 'pending_unbind') return { success: false, error: '该关系无需确认解除' };
    if (relation.unbindRequestBy === openid) return { success: false, error: '不能确认自己发起的解绑请求' };

    relationships.splice(relationIndex, 1);

    var newActiveRelationship = currentUser.activeRelationship === partnerId ? '' : currentUser.activeRelationship;

    return db.collection('users').doc(currentUser._id).update({
      data: { relationships: relationships, activeRelationship: newActiveRelationship },
    }).then(function () {
      return clearSharedDataForUser(currentUser._id, partnerId).then(function () {
        // 更新对方
        return db.collection('users').where({ _openid: partnerId }).get().then(function (partnerResult) {
          if (partnerResult.data && partnerResult.data.length > 0) {
            var partner = partnerResult.data[0];
            var partnerRelationships = partner.relationships || [];
            var partnerRelationIndex = partnerRelationships.findIndex(function (r) {
              return r.partnerId === openid;
            });
            if (partnerRelationIndex !== -1) {
              partnerRelationships.splice(partnerRelationIndex, 1);
              var partnerNewActive = partner.activeRelationship === openid ? '' : partner.activeRelationship;
              return db.collection('users').doc(partner._id).update({
                data: { relationships: partnerRelationships, activeRelationship: partnerNewActive },
              }).then(function () {
                return clearSharedDataForUser(partner._id, openid).then(function () {
                  return { success: true, message: '已确认解除关系' };
                });
              });
            }
          }
          return { success: true, message: '已确认解除关系' };
        });
      });
    });
  });
}

/**
 * 取消解除关系
 * @param {string} openid
 * @param {Object} event
 */
function cancelUnbind(openid, event) {
  var partnerId = event.partnerId;
  if (!partnerId) return Promise.resolve({ success: false, error: '缺少关系对象ID' });

  return db.collection('users').where({ _openid: openid }).get().then(function (currentUserResult) {
    if (!currentUserResult.data || currentUserResult.data.length === 0) {
      return { success: false, error: '用户不存在' };
    }

    var currentUser = currentUserResult.data[0];
    var relationships = currentUser.relationships || [];

    var relationIndex = relationships.findIndex(function (r) {
      return r.partnerId === partnerId;
    });
    if (relationIndex === -1) return { success: false, error: '关系不存在' };

    var relation = relationships[relationIndex];
    if (relation.status !== 'pending_unbind') return { success: false, error: '该关系没有待确认的解绑请求' };
    if (relation.unbindRequestBy !== openid) return { success: false, error: '只有发起方才能取消解绑请求' };

    relationships[relationIndex].status = 'active';
    relationships[relationIndex].unbindRequestAt = null;
    relationships[relationIndex].unbindRequestBy = null;

    return db.collection('users').doc(currentUser._id).update({ data: { relationships: relationships } }).then(function () {
      // 更新对方
      return db.collection('users').where({ _openid: partnerId }).get().then(function (partnerResult) {
        if (partnerResult.data && partnerResult.data.length > 0) {
          var partner = partnerResult.data[0];
          var partnerRelationships = partner.relationships || [];
          var partnerRelationIndex = partnerRelationships.findIndex(function (r) {
            return r.partnerId === openid;
          });
          if (partnerRelationIndex !== -1) {
            partnerRelationships[partnerRelationIndex].status = 'active';
            partnerRelationships[partnerRelationIndex].unbindRequestAt = null;
            partnerRelationships[partnerRelationIndex].unbindRequestBy = null;
            return db.collection('users').doc(partner._id).update({
              data: { relationships: partnerRelationships },
            }).then(function () {
              return { success: true, message: '已取消解绑请求' };
            });
          }
        }
        return { success: true, message: '已取消解绑请求' };
      });
    });
  });
}

/**
 * 清除共同数据（对外入口）
 * @param {string} openid
 * @param {string} partnerId
 */
function clearSharedData(openid, partnerId) {
  return db.collection('users').where({ _openid: openid }).get().then(function (currentUserResult) {
    if (currentUserResult.data && currentUserResult.data.length > 0) {
      return clearSharedDataForUser(currentUserResult.data[0]._id, partnerId).then(function () {
        return { success: true };
      });
    }
    return { success: true };
  });
}

// ============================================================
// 云函数入口
// ============================================================

/**
 * @param {Object} event
 * @param {Object} context
 */
exports.main = function (event, context) {
  var openid = cloud.getWXContext().OPENID;
  var action = event.action;

  var result;
  switch (action) {
    case 'bind':        result = bindRelationship(openid, event); break;
    case 'getList':     result = getRelationshipList(openid); break;
    case 'requestUnbind': result = requestUnbind(openid, event); break;
    case 'confirmUnbind': result = confirmUnbind(openid, event); break;
    case 'cancelUnbind':  result = cancelUnbind(openid, event); break;
    case 'clearSharedData': result = clearSharedData(openid, event.partnerId); break;
    default: return Promise.resolve({ success: false, error: '未知操作' });
  }

  return result.catch(function (error) {
    return { success: false, error: error.message || String(error) };
  });
};
