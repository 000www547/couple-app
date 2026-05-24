/**
 * @fileoverview 清空缓存数据云函数
 * - 清空亲密值
 * - 清空心跳记录
 * - 清空愿望数据
 * - 清空时刻数据
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

/**
 * 清空数据云函数入口
 * @param {Object} event - 包含 action 字段
 * @param {string} event.action - 操作类型: clearIntimacy|clearHeartbeats|clearWishes|clearMoments|clearAll
 * @param {Object} context - 微信上下文
 * @returns {Promise<Object>} - 返回操作结果
 */
exports.main = function (event, context) {
  var openid = cloud.getWXContext().OPENID;
  var action = event.action;
  console.log('[clearData] 收到请求, action:', action, 'openid:', openid);

  if (!openid) {
    return Promise.resolve({ success: false, error: '无法获取用户身份' });
  }

  switch (action) {
    case 'clearIntimacy':
      return clearIntimacy(openid);
    case 'clearHeartbeats':
      return clearHeartbeats(openid);
    case 'clearWishes':
      return clearWishes(openid);
    case 'clearMoments':
      return clearMoments(openid);
    case 'clearAll':
      return clearAll(openid);
    default:
      return Promise.resolve({ success: false, error: '未知操作类型' });
  }
};

/**
 * 清空亲密值
 * @param {string} openid - 用户 openid
 * @returns {Promise<Object>}
 */
function clearIntimacy(openid) {
  console.log('[clearData] 开始清空亲密值, openid:', openid);
  
  return db.collection('users').where({ _openid: openid }).update({
    data: {
      intimacy: 0,
      lastIntimacyUpdate: db.serverDate()
    }
  }).then(function(updateRes) {
    console.log('[clearData] 亲密值清空成功', updateRes);
    return { success: true, message: '亲密值已清空', updated: updateRes.updated };
  }).catch(function(error) {
    console.error('[clearData] 清空亲密值失败', error);
    return { success: false, error: error.message };
  });
}

/**
 * 清空心跳记录
 * @param {string} openid - 用户 openid
 * @returns {Promise<Object>}
 */
function clearHeartbeats(openid) {
  console.log('[clearData] 开始清空心跳记录, openid:', openid);
  
  // 先查询该用户的所有心跳记录
  return db.collection('heartbeats').where(_.or([
    { userId: openid },
    { partnerId: openid }
  ])).get().then(function(queryRes) {
    console.log('[clearData] 查询到心跳记录数:', queryRes.data.length);
    
    if (queryRes.data.length === 0) {
      return { success: true, message: '无心跳记录需要清空', deleted: 0 };
    }
    
    // 批量删除（每次最多100条）
    var batchDelete = function(index) {
      if (index >= queryRes.data.length) {
        return Promise.resolve();
      }
      
      var batch = queryRes.data.slice(index, index + 100);
      var promises = batch.map(function(record) {
        return db.collection('heartbeats').doc(record._id).remove();
      });
      
      return Promise.all(promises).then(function() {
        return batchDelete(index + 100);
      });
    };
    
    return batchDelete(0).then(function() {
      console.log('[clearData] 心跳记录清空成功');
      return { success: true, message: '心跳记录已清空', deleted: queryRes.data.length };
    });
  }).catch(function(error) {
    console.error('[clearData] 清空心跳记录失败', error);
    return { success: false, error: error.message };
  });
}

/**
 * 清空愿望数据
 * @param {string} openid - 用户 openid
 * @returns {Promise<Object>}
 */
function clearWishes(openid) {
  console.log('[clearData] 开始清空愿望数据, openid:', openid);
  
  return db.collection('wishes').where({ _openid: openid }).get().then(function(queryRes) {
    console.log('[clearData] 查询到愿望记录数:', queryRes.data.length);
    
    if (queryRes.data.length === 0) {
      return { success: true, message: '无愿望记录需要清空', deleted: 0 };
    }
    
    var batchDelete = function(index) {
      if (index >= queryRes.data.length) {
        return Promise.resolve();
      }
      
      var batch = queryRes.data.slice(index, index + 100);
      var promises = batch.map(function(record) {
        return db.collection('wishes').doc(record._id).remove();
      });
      
      return Promise.all(promises).then(function() {
        return batchDelete(index + 100);
      });
    };
    
    return batchDelete(0).then(function() {
      console.log('[clearData] 愿望记录清空成功');
      return { success: true, message: '愿望记录已清空', deleted: queryRes.data.length };
    });
  }).catch(function(error) {
    console.error('[clearData] 清空愿望记录失败', error);
    return { success: false, error: error.message };
  });
}

/**
 * 清空时刻数据
 * @param {string} openid - 用户 openid
 * @returns {Promise<Object>}
 */
function clearMoments(openid) {
  console.log('[clearData] 开始清空时刻数据, openid:', openid);
  
  return db.collection('moments').where({ _openid: openid }).get().then(function(queryRes) {
    console.log('[clearData] 查询到时刻记录数:', queryRes.data.length);
    
    if (queryRes.data.length === 0) {
      return { success: true, message: '无时刻记录需要清空', deleted: 0 };
    }
    
    var batchDelete = function(index) {
      if (index >= queryRes.data.length) {
        return Promise.resolve();
      }
      
      var batch = queryRes.data.slice(index, index + 100);
      var promises = batch.map(function(record) {
        return db.collection('moments').doc(record._id).remove();
      });
      
      return Promise.all(promises).then(function() {
        return batchDelete(index + 100);
      });
    };
    
    return batchDelete(0).then(function() {
      console.log('[clearData] 时刻记录清空成功');
      return { success: true, message: '时刻记录已清空', deleted: queryRes.data.length };
    });
  }).catch(function(error) {
    console.error('[clearData] 清空时刻记录失败', error);
    return { success: false, error: error.message };
  });
}

/**
 * 清空所有数据
 * @param {string} openid - 用户 openid
 * @returns {Promise<Object>}
 */
function clearAll(openid) {
  console.log('[clearData] 开始清空所有数据, openid:', openid);
  
  return clearIntimacy(openid).then(function(intimacyRes) {
    return clearHeartbeats(openid).then(function(heartbeatsRes) {
      return clearWishes(openid).then(function(wishesRes) {
        return clearMoments(openid).then(function(momentsRes) {
          return {
            success: true,
            message: '所有数据已清空',
            details: {
              intimacy: intimacyRes,
              heartbeats: heartbeatsRes,
              wishes: wishesRes,
              moments: momentsRes
            }
          };
        });
      });
    });
  }).catch(function(error) {
    console.error('[clearData] 清空所有数据失败', error);
    return { success: false, error: error.message };
  });
}
