/**
 * @fileoverview 获取云存储文件临时下载链接
 * 以云函数管理员身份调用，可绕过「仅创建者可读写」的权限限制
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * @param {{fileList: string[]}} event
 */
exports.main = function (event, context) {
  var fileList = event.fileList;

  if (!fileList || !Array.isArray(fileList) || fileList.length === 0) {
    return Promise.resolve({ success: false, error: 'fileList is required and must be an array' });
  }

  console.log('[getTempFileURL] request fileList:', fileList);

  return cloud.getTempFileURL({ fileList: fileList }).then(function (result) {
    console.log('[getTempFileURL] result:', JSON.stringify(result));
    return { success: true, data: result };
  }).catch(function (error) {
    console.error('[getTempFileURL] error:', error);
    return { success: false, error: error.message };
  });
};
