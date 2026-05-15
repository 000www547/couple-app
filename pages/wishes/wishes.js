// pages/wishes/wishes.js
const app = getApp();

Page({
  data: {
    wishes: [],
    currentUser: null,
    activeTab: 'all',
    showAddModal: false,
    newWish: {
      title: '',
      description: '',
      isShared: false
    },
    loading: false,
    progressPercent: 0,
    completedCount: 0
  },

  onShow: function() {
    this.getCurrentUser();
  },

  onLoad: function() {
    this.getCurrentUser();
  },

  getCurrentUser: function() {
    const that = this;
    wx.cloud.callFunction({
      name: 'login',
      data: {}
    }).then(res => {
      if (res.result.success) {
        that.setData({ currentUser: res.result.user });
        that.loadWishes();
      }
    });
  },

  loadWishes: function() {
    this.setData({ loading: true });
    
    wx.cloud.callFunction({
      name: 'wishes',
      data: { action: 'getList', type: this.data.activeTab }
    }).then(res => {
      this.setData({ loading: false });
      if (res.result.success) {
        const wishes = res.result.wishes;
        const completedCount = wishes.filter(w => w.isCompleted).length;
        const percent = wishes.length > 0 ? Math.round((completedCount / wishes.length) * 100) : 0;
        this.setData({ wishes, progressPercent: percent, completedCount });
      }
    }).catch(err => {
      this.setData({ loading: false });
      console.error('加载失败', err);
    });
  },

  onTabChange: function(e) {
    const type = e.detail.name;
    this.setData({ activeTab: type });
    this.loadWishes();
  },

  showAddModal: function() {
    this.setData({ showAddModal: true });
  },

  hideAddModal: function() {
    this.setData({ 
      showAddModal: false,
      newWish: { title: '', description: '', isShared: false }
    });
  },

  onTitleInput: function(e) {
    this.setData({
      'newWish.title': e.detail.value
    });
  },

  onDescInput: function(e) {
    this.setData({
      'newWish.description': e.detail.value
    });
  },

  onShareChange: function(e) {
    this.setData({
      'newWish.isShared': e.detail.value
    });
  },

  addWish: function() {
    const { newWish } = this.data;
    
    if (!newWish.title) {
      wx.showToast({
        title: '请输入心愿',
        icon: 'none'
      });
      return;
    }

    wx.showLoading({ title: '添加中...' });

    wx.cloud.callFunction({
      name: 'wishes',
      data: {
        action: 'add',
        title: newWish.title,
        description: newWish.description,
        isShared: newWish.isShared
      }
    }).then(res => {
      wx.hideLoading();
      if (res.result.success) {
        wx.showToast({ title: '添加成功' });
        this.hideAddModal();
        this.loadWishes();
      }
    }).catch(err => {
      wx.hideLoading();
      wx.showToast({
        title: '添加失败',
        icon: 'none'
      });
    });
  },

  toggleComplete: function(e) {
    const wishId = e.currentTarget.dataset.id;
    const wish = this.data.wishes.find(w => w._id === wishId);
    
    const action = wish.isCompleted ? 'uncomplete' : 'complete';
    
    wx.cloud.callFunction({
      name: 'wishes',
      data: {
        action: action,
        wishId: wishId
      }
    }).then(res => {
      if (res.result.success) {
        this.loadWishes();
      }
    });
  },

  deleteWish: function(e) {
    const wishId = e.currentTarget.dataset.id;
    const that = this;
    
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这个心愿吗？',
      success: function(res) {
        if (res.confirm) {
          wx.cloud.callFunction({
            name: 'wishes',
            data: {
              action: 'delete',
              wishId: wishId
            }
          }).then(res => {
            if (res.result.success) {
              wx.showToast({ title: '已删除' });
              that.loadWishes();
            }
          });
        }
      }
    });
  },
  
  getProgress: function() {
    if (this.data.wishes.length === 0) return 0;
    const completed = this.data.wishes.filter(w => w.isCompleted).length;
    return Math.round((completed / this.data.wishes.length) * 100);
  }
});
