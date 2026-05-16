// pages/more/poke/poke.js
const app = getApp();

Page({
  data: {
    partnerName: 'TA',
    heartbeats: [],
    loading: false,
    isPressing: false,
    isSending: false,
    holdTime: 0,
    progress: 0,
    holdText: '按住发送',
    touchTimer: null
  },

  onLoad: function() {
    this.loadPartnerInfo();
  },

  onShow: function() {
    this.loadHeartbeats();
  },

  onUnload: function() {
    this.clearTimer();
  },

  // 获取伴侣信息
  loadPartnerInfo: function() {
    const that = this;
    wx.cloud.callFunction({
      name: 'login',
      data: {}
    }).then(res => {
      if (res.result.success && res.result.user) {
        const user = res.result.user;
        let partnerId = null;

        if (user.relationships && user.relationships.length > 0) {
          const active = user.relationships.find(r => r.status === 'active');
          if (active) partnerId = active.partnerId;
        }
        if (!partnerId && user.activeRelationship) {
          partnerId = user.activeRelationship;
        }

        if (partnerId) {
          // 直接查询数据库获取伴侣昵称
          const db = wx.cloud.database();
          db.collection('users').where({
            _openid: partnerId
          }).get().then(pRes => {
            if (pRes.data && pRes.data.length > 0) {
              that.setData({
                partnerName: pRes.data[0].nickname || 'TA'
              });
            }
          }).catch(() => {});
        }
      }
    }).catch(() => {});
  },

  // 加载心跳记录
  loadHeartbeats: function() {
    this.setData({ loading: true });

    wx.cloud.callFunction({
      name: 'heartbeat',
      data: { action: 'getList' }
    }).then(res => {
      this.setData({ loading: false });
      if (res.result.success) {
        const list = (res.result.heartbeats || []).map(item => {
          return {
            ...item,
            timeAgo: this.formatTimeAgo(item.createTime)
          };
        });
        this.setData({ heartbeats: list });
      }
    }).catch(err => {
      this.setData({ loading: false });
      console.error('加载失败', err);
    });
  },

  // 时间格式化
  formatTimeAgo: function(timeStr) {
    if (!timeStr) return '';
    const now = new Date();
    const time = new Date(timeStr);
    const diff = Math.floor((now - time) / 1000);

    if (diff < 60) return '刚刚';
    if (diff < 3600) return Math.floor(diff / 60) + '分钟前';
    if (diff < 86400) return Math.floor(diff / 3600) + '小时前';
    if (diff < 604800) return Math.floor(diff / 86400) + '天前';
    return (time.getMonth() + 1) + '月' + time.getDate() + '日';
  },

  // 清除计时器
  clearTimer: function() {
    if (this.data.touchTimer) {
      clearInterval(this.data.touchTimer);
      this.setData({ touchTimer: null });
    }
  },

  // 触摸开始
  onTouchStart: function() {
    if (this.data.isSending) return;

    this.clearTimer();

    let holdTime = 0;
    const that = this;

    this.setData({
      isPressing: true,
      holdTime: 0,
      progress: 0,
      holdText: '按住发送'
    });

    const timer = setInterval(() => {
      holdTime += 50;
      const progress = Math.min((holdTime / 1000) * 100, 100);

      that.setData({
        holdTime: holdTime,
        progress: progress
      });

      if (holdTime >= 1000) {
        that.clearTimer();
        that.doSend();
      }
    }, 50);

    this.setData({ touchTimer: timer });
  },

  // 触摸结束
  onTouchEnd: function() {
    this.clearTimer();
    if (!this.data.isSending) {
      this.setData({
        isPressing: false,
        holdTime: 0,
        progress: 0,
        holdText: '按住发送'
      });
    }
  },

  // 执行发送
  doSend: function() {
    if (this.data.isSending) return;

    this.setData({
      isSending: true,
      isPressing: false,
      holdText: '发送中...'
    });

    // 震动反馈
    wx.vibrateLong({
      success: () => console.log('震动成功')
    });

    const callHeartbeat = (retryCount = 0) => {
      wx.cloud.callFunction({
        name: 'heartbeat',
        data: {
          action: 'send',
          type: 'poke'
        }
      }).then(res => {
        this.setData({
          isSending: false,
          holdTime: 0,
          progress: 0,
          holdText: '按住发送'
        });

        if (res.result.success) {
          wx.showToast({
            title: '心跳已发送 💓',
            icon: 'none'
          });
          this.loadHeartbeats();
        } else {
          const msg = res.result.error || '发送失败';
          wx.showToast({ title: msg, icon: 'none' });
        }
      }).catch(err => {
        console.error('发送失败', err, 'retry:', retryCount);
        // 冷启动超时自动重试一次
        if (retryCount === 0 && err && err.message && err.message.includes('timeout')) {
          console.log('检测到超时，自动重试...');
          callHeartbeat(retryCount + 1);
          return;
        }
        this.setData({
          isSending: false,
          holdTime: 0,
          progress: 0,
          holdText: '按住发送'
        });
        wx.showToast({ title: '发送失败', icon: 'none' });
      });
    };
    callHeartbeat();
  }
});