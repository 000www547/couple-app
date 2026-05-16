const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

// 生成邀请码
function generateInviteCode() {
  return 'COUPLE' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substr(2, 4).toUpperCase();
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  try {
    // 查询用户是否已存在
    const userResult = await db.collection('users').where({
      _openid: openid
    }).get();

    if (userResult.data && userResult.data.length > 0) {
      // 用户已存在，返回用户信息
      const user = userResult.data[0];
      return {
        success: true,
        user: {
          _id: user._id,
          _openid: user._openid,
          nickname: user.nickname || '',
          avatar: user.avatar || '',
          inviteCode: user.inviteCode || '',
          birthday: user.birthday || '',
          anniversaryDate: user.anniversaryDate || '',
          activeRelationship: user.activeRelationship || null,
          relationships: user.relationships || [],
          partnerBirthday: user.partnerBirthday || ''
        }
      };
    } else {
      // 新用户，创建用户记录
      const inviteCode = generateInviteCode();
      const addResult = await db.collection('users').add({
        data: {
          _openid: openid,
          nickname: '',
          avatar: '',
          inviteCode: inviteCode,
          birthday: '',
          anniversaryDate: '',
          activeRelationship: null,
          relationships: [],
          partnerBirthday: '',
          createTime: db.serverDate()
        }
      });

      return {
        success: true,
        user: {
          _id: addResult._id,
          _openid: openid,
          nickname: '',
          avatar: '',
          inviteCode: inviteCode,
          birthday: '',
          anniversaryDate: '',
          activeRelationship: null,
          relationships: [],
          partnerBirthday: ''
        }
      };
    }
  } catch (error) {
    return {
      success: false,
      error: error.message || '登录失败'
    };
  }
};
