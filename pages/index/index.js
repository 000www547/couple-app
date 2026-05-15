// pages/index/index.js
const app = getApp();

Page({
  data: {
    userInfo: null,
    daysTogether: 0,
    partnerBirthday: null,
    birthdayCountdown: 0,
    anniversaries: [],
    showAddModal: false,
    newAnniversary: {
      title: '',
      date: '',
      type: 'custom',
      customTitle: ''
    }
  },

  onShow: function() {
    this.login();
  },

  login: function() {
    wx.showLoading({ title: '加载中...' });

    wx.cloud.callFunction({
      name: 'login',
      data: {}
    }).then(res => {
      wx.hideLoading();
      if (res.result && res.result.success) {
        const user = res.result.user;
        this.setData({ userInfo: user });
        app.globalData.userInfo = user;
        app.globalData.isLoggedIn = true;
        this.loadAnniversaries();

        // 计算在一起天数
        if (user && user.anniversaryDate) {
          this.calculateDaysTogether(user.anniversaryDate);
        }
      } else {
        wx.showToast({
          title: '登录失败，请重试',
          icon: 'none'
        });
      }
    }).catch(err => {
      wx.hideLoading();
      console.error('登录失败', err);
      wx.showToast({
        title: '网络错误，请检查连接',
        icon: 'none'
      });
    });
  },

  calculateDaysTogether: function(startDate) {
    const start = new Date(startDate);
    const now = new Date();
    const days = Math.floor((now - start) / (1000 * 60 * 60 * 24));
    this.setData({ daysTogether: days });
  },

  calculateBirthdayCountdown: function(birthday) {
    const now = new Date();
    let birthdayDate = new Date(birthday);
    birthdayDate.setFullYear(now.getFullYear());
    
    if (birthdayDate < now) {
      birthdayDate.setFullYear(now.getFullYear() + 1);
    }
    
    const days = Math.floor((birthdayDate - now) / (1000 * 60 * 60 * 24));
    this.setData({ birthdayCountdown: days });
  },

  loadAnniversaries: function() {
    const that = this;
    const db = wx.cloud.database();

    if (!this.data.userInfo || !this.data.userInfo._openid) {
      console.log('用户未登录，跳过加载纪念日');
      return;
    }

    db.collection('anniversaries').where({
      userId: this.data.userInfo._openid
    }).orderBy('date', 'asc').get({
      success: function(res) {
        const anniversaries = res.data.map(item => {
          const date = new Date(item.date);
          const now = new Date();
          const days = Math.floor((date - now) / (1000 * 60 * 60 * 24));

          if (item.type === 'start') {
            that.calculateDaysTogether(item.date);
          } else if (item.type === 'birthday') {
            that.calculateBirthdayCountdown(item.date);
          }

          return {
            ...item,
            countdown: days >= 0 ? days : 0,
            isPast: days < 0
          };
        });

        that.setData({ anniversaries });
      },
      fail: function(err) {
        console.error('加载纪念日失败', err);
      }
    });
  },

  showAddAnniversary: function() {
    this.setData({ showAddModal: true });
  },

  hideAddModal: function() {
    this.setData({
      showAddModal: false,
      newAnniversary: { title: '', date: '', type: 'custom', customTitle: '' }
    });
  },

  onCustomTitleInput: function(e) {
    this.setData({
      'newAnniversary.customTitle': e.detail.value
    });
  },

  onTitleInput: function(e) {
    this.setData({
      'newAnniversary.title': e.detail.value
    });
  },

  onDateChange: function(e) {
    this.setData({
      'newAnniversary.date': e.detail.value
    });
  },

  onTypeChange: function(e) {
    const type = e.currentTarget.dataset.type;
    let title = '';

    // 根据类型设置默认标题
    switch (type) {
      case 'start':
        title = '在一起';
        break;
      case 'birthday':
        title = '生日';
        break;
      case 'custom':
        title = this.data.newAnniversary.customTitle || '';
        break;
    }

    this.setData({
      'newAnniversary.type': type,
      'newAnniversary.title': title
    });
  },

  saveAnniversary: function() {
    const { newAnniversary } = this.data;

    if (!this.data.userInfo || !this.data.userInfo._openid) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }

    if (!newAnniversary.date) {
      wx.showToast({
        title: '请选择日期',
        icon: 'none'
      });
      return;
    }

    // 根据类型确定最终标题
    let finalTitle = newAnniversary.title;
    if (newAnniversary.type === 'custom') {
      finalTitle = newAnniversary.customTitle || '自定义纪念日';
      if (!newAnniversary.customTitle) {
        wx.showToast({
          title: '请输入自定义标题',
          icon: 'none'
        });
        return;
      }
    }

    const db = wx.cloud.database();
    db.collection('anniversaries').add({
      data: {
        userId: this.data.userInfo._openid,
        title: finalTitle,
        date: newAnniversary.date,
        type: newAnniversary.type,
        createTime: db.serverDate()
      },
      success: () => {
        wx.showToast({ title: '添加成功' });
        this.hideAddModal();
        this.loadAnniversaries();
      },
      fail: (err) => {
        console.error('添加纪念日失败', err);
        wx.showToast({ title: '添加失败', icon: 'none' });
      }
    });
  },

  deleteAnniversary: function(e) {
    const id = e.currentTarget.dataset.id;
    const that = this;
    
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这个纪念日吗？',
      success: function(res) {
        if (res.confirm) {
          const db = wx.cloud.database();
          db.collection('anniversaries').doc(id).remove({
            success: () => {
              wx.showToast({ title: '已删除' });
              that.loadAnniversaries();
            }
          });
        }
      }
    });
  }
});
