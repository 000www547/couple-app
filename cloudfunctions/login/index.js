// 云函数：用户登录
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  try {
    // 查询用户是否已存在
    let user = await db.collection('users').where({
      _openid: openid
    }).get();

    if (user.data && user.data.length > 0) {
      // 用户已存在，返回用户信息
      return {
        success: true,
        user: user.data[0],
        isNew: false
      };
    } else {
      // 新用户，创建用户信息
      const newUser = {
        _openid: openid,
        nickname: event.nickname || '未设置昵称',
        avatar: event.avatar || '',
        role: '', // boyfriend 或 girlfriend
        partnerId: '',
        createTime: db.serverDate(),
        anniversaryDate: event.anniversaryDate || null // 在一起的日期
      };

      const result = await db.collection('users').add({
        data: newUser
      });

      return {
        success: true,
        user: { ...newUser, _id: result._id },
        isNew: true
      };
    }
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
};
