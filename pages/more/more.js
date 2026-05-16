// pages/more/more.js
Page({
  data: {},

  onLoad: function() {},

  // 跳转戳一戳页面
  goToPoke: function() {
    wx.navigateTo({
      url: '/pages/more/poke/poke'
    });
  }
});