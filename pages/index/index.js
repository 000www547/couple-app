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
      type: 'custom'
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
      if (res.result.success) {
        this.setData({ userInfo: res.result.user });
        this.loadAnniversaries();
        
        // 计算在一起天数
        if (res.result.user.anniversaryDate) {
          this.calculateDaysTogether(res.result.user.anniversaryDate);
        }
      }
    }).catch(err => {
      wx.hideLoading();
      console.error('登录失败', err);
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
      }
    });
  },

  showAddAnniversary: function() {
    this.setData({ showAddModal: true });
  },

  hideAddModal: function() {
    this.setData({ 
      showAddModal: false,
      newAnniversary: { title: '', date: '', type: 'custom' }
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
    this.setData({
      'newAnniversary.type': e.currentTarget.dataset.type
    });
  },

  saveAnniversary: function() {
    const { newAnniversary } = this.data;
    
    if (!newAnniversary.title || !newAnniversary.date) {
      wx.showToast({
        title: '请填写完整信息',
        icon: 'none'
      });
      return;
    }

    const db = wx.cloud.database();
    db.collection('anniversaries').add({
      data: {
        userId: this.data.userInfo._openid,
        title: newAnniversary.title,
        date: newAnniversary.date,
        type: newAnniversary.type,
        createTime: db.serverDate()
      },
      success: () => {
        wx.showToast({ title: '添加成功' });
        this.hideAddModal();
        this.loadAnniversaries();
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
