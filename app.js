// app.js
App({
  onLaunch: function () {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
    } else {
      wx.cloud.init({
        env: wx.cloud.DYNAMIC_CURRENT_ENV, // 使用当前环境
        traceUser: true,
      });
    }
  },

  globalData: {
    userInfo: null,
    openid: '',
    isLoggedIn: false,
  },
});
