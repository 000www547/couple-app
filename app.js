// app.js
App({
  onLaunch: function () {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
    } else {
      wx.cloud.init({
        env: 'cloud1-d3glxwciI0275ec8b', // 云开发环境ID
        traceUser: true,
      });
    }
    this.globalData = {
      userInfo: null,
      openid: '',
      isLoggedIn: false,
    };
  },

  globalData: {
    userInfo: null,
    openid: '',
    isLoggedIn: false,
  },
});