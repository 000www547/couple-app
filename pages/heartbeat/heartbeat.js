// pages/heartbeat/heartbeat.js
const app = getApp();

Page({
  data: {
    heartbeats: [],
    userInfos: {},
    currentUser: null,
    heartType: 'heartbeat', // 'heartbeat' | 'poke'
    loading: false,
    unreadCount: 0,
    isSending: false,
    holdTime: 0,
    touchTimer: null
  },

  onShow: function() {
    this.getCurrentUser();
    this.loadHeartbeats();
    this.getUnreadCount();
  },

  onHide: function() {
    // 停止计时器
    if (this.data.touchTimer) {
      clearInterval(this.data.touchTimer);
    }
  },

  getCurrentUser: function() {
    const that = this;
    wx.cloud.callFunction({
      name: 'login',
      data: {}
    }).then(res => {
      if (res.result.success) {
        that.setData({ currentUser: res.result.user });
      }
    });
  },

  loadHeartbeats: function() {
    this.setData({ loading: true });

    wx.cloud.callFunction({
      name: 'heartbeat',
      data: { action: 'getList' }
    }).then(res => {
      this.setData({ loading: false });
      if (res.result.success) {
        this.setData({
          heartbeats: res.result.heartbeats,
          userInfos: res.result.userInfos
        });
      }
    }).catch(err => {
      this.setData({ loading: false });
      console.error('加载失败', err);
    });
  },

  getUnreadCount: function() {
    wx.cloud.callFunction({
      name: 'heartbeat',
      data: { action: 'getUnreadCount' }
    }).then(res => {
      if (res.result.success) {
        this.setData({ unreadCount: res.result.count });
      }
    });
  },

  setHeartType: function(e) {
    const type = e.currentTarget.dataset.type;
    this.setData({ heartType: type });
  },

  onTouchStart: function() {
    const that = this;
    let holdTime = 0;

    this.data.touchTimer = setInterval(() => {
      holdTime += 100;
      that.setData({ holdTime: holdTime });

      // 长按1秒后自动发送
      if (holdTime >= 1000) {
        clearInterval(that.data.touchTimer);
        that.doSend();
      }
    }, 100);
  },

  onTouchEnd: function() {
    if (this.data.touchTimer) {
      clearInterval(this.data.touchTimer);
      this.setData({ holdTime: 0 });
    }
  },

  sendHeartbeat: function() {
    // 这个函数会被长按触发，但我们主要依赖 onTouchStart 的定时器
    // 这里只是作为保底
    if (this.data.holdTime >= 1000) {
      this.doSend();
    }
  },

  doSend: function() {
    if (this.data.isSending) return;

    this.setData({
      isSending: true,
      holdTime: 1000
    });

    // 震动反馈
    wx.vibrateLong({
      success: () => {
        console.log('震动成功');
      }
    });

    // 发送心跳到云数据库
    wx.cloud.callFunction({
      name: 'heartbeat',
      data: {
        action: 'send',
        type: this.data.heartType
      }
    }).then(res => {
      this.setData({ isSending: false, holdTime: 0 });

      if (res.result.success) {
        const typeText = this.data.heartType === 'poke' ? '戳一戳' : '心跳';
        wx.showToast({
          title: `${typeText}已发送 💓`,
          icon: 'none'
        });

        // 重新加载列表
        this.loadHeartbeats();
      } else {
        wx.showToast({
          title: '发送失败',
          icon: 'none'
        });
      }
    }).catch(err => {
      this.setData({ isSending: false, holdTime: 0 });
      console.error('发送心跳失败', err);
      wx.showToast({
        title: '发送失败',
        icon: 'none'
      });
    });
  },

  // 标记已读
  markAsRead: function(e) {
    const id = e.currentTarget.dataset.id;

    wx.cloud.callFunction({
      name: 'heartbeat',
      data: {
        action: 'markRead',
        id: id
      }
    }).then(res => {
      if (res.result.success) {
        this.loadHeartbeats();
        this.getUnreadCount();
      }
    });
  }
});
