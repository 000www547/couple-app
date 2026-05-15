const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();

  return {
    success: true,
    user: {
      _openid: wxContext.OPENID,
      activeRelationship: null,
      anniversaryDate: null,
      partnerBirthday: null
    }
  };
};
