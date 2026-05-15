// pages/profile/profile.js
const app = getApp();

Page({
  data: {
    userInfo: null,
    partnerInfo: null,
    stats: {
      moments: 0,
      wishes: 0,
      completedWishes: 0
    },
    showEditModal: false,
    showBindModal: false,
    editForm: {
      nickname: '',
      anniversaryDate: '',
      birthday: ''
    },
    partnerCode: ''
  },

  onShow: function() {
    this.getUserInfo();
  },

  getUserInfo: function() {
    const that = this;
    wx.cloud.callFunction({
      name: 'login',
      data: {}
    }).then(res => {
      if (res.result.success) {
        that.setData({ userInfo: res.result.user });
        
        // 加载统计数据
        that.loadStats();
        
        // 如果有伴侣，获取伴侣信息
        if (res.result.user.partnerId) {
          that.getPartnerInfo(res.result.user.partnerId);
        }
      }
    });
  },

  loadStats: function() {
    const db = wx.cloud.database();
    const openid = this.data.userInfo._openid;
    
    // 统计动态数
    db.collection('moments').where({
      userId: openid
    }).count().then(res => {
      this.setData({ 'stats.moments': res.total });
    });
    
    // 统计心愿
    db.collection('wishes').where({
      userId: openid
    }).count().then(res => {
      this.setData({ 'stats.wishes': res.total });
    });
    
    // 统计已完成心愿
    db.collection('wishes').where({
      userId: openid,
      isCompleted: true
    }).count().then(res => {
      this.setData({ 'stats.completedWishes': res.total });
    });
  },

  getPartnerInfo: function(partnerId) {
    const db = wx.cloud.database();
    db.collection('users').where({
      _openid: partnerId
    }).get().then(res => {
      if (res.data.length > 0) {
        this.setData({ partnerInfo: res.data[0] });
      }
    });
  },

  showEditModal: function() {
    this.setData({
      showEditModal: true,
      editForm: {
        nickname: this.data.userInfo.nickname || '',
        anniversaryDate: this.data.userInfo.anniversaryDate || '',
        birthday: this.data.userInfo.birthday || ''
      }
    });
  },

  hideEditModal: function() {
    this.setData({ showEditModal: false });
  },

  onNicknameInput: function(e) {
    this.setData({ 'editForm.nickname': e.detail.value });
  },

  onAnniversaryChange: function(e) {
    this.setData({ 'editForm.anniversaryDate': e.detail.value });
  },

  onBirthdayChange: function(e) {
    this.setData({ 'editForm.birthday': e.detail.value });
  },

  saveProfile: function() {
    const { editForm, userInfo } = this.data;
    const db = wx.cloud.database();
    
    db.collection('users').doc(userInfo._id).update({
      data: {
        nickname: editForm.nickname,
        anniversaryDate: editForm.anniversaryDate,
        birthday: editForm.birthday
      },
      success: () => {
        wx.showToast({ title: '保存成功' });
        this.hideEditModal();
        this.getUserInfo();
      }
    });
  },

  onChooseAvatar: function(e) {
    const avatarUrl = e.detail.avatarUrl;
    const that = this;
    
    wx.cloud.uploadFile({
      cloudPath: 'avatars/' + Date.now() + '.png',
      filePath: avatarUrl,
      success: function(res) {
        const db = wx.cloud.database();
        db.collection('users').doc(that.data.userInfo._id).update({
          data: { avatar: res.fileID },
          success: () => {
            wx.showToast({ title: '头像已更新' });
            that.getUserInfo();
          }
        });
      }
    });
  },

  showBindModal: function() {
    this.setData({ showBindModal: true, partnerCode: '' });
  },

  hideBindModal: function() {
    this.setData({ showBindModal: false });
  },

  onCodeInput: function(e) {
    this.setData({ partnerCode: e.detail.value });
  },

  bindPartner: function() {
    const code = this.data.partnerCode.trim();
    if (!code) {
      wx.showToast({
        title: '请输入对方邀请码',
        icon: 'none'
      });
      return;
    }

    const db = wx.cloud.database();
    const that = this;
    
    // 通过邀请码查找用户
    db.collection('users').where({
      inviteCode: code
    }).get().then(res => {
      if (res.data.length === 0) {
        wx.showToast({
          title: '邀请码无效',
          icon: 'none'
        });
        return;
      }

      const partner = res.data[0];
      if (partner._openid === that.data.userInfo._openid) {
        wx.showToast({
          title: '不能绑定自己',
          icon: 'none'
        });
        return;
      }

      // 互相绑定
      const batch = db.batch();
      batch.update(db.collection('users').doc(that.data.userInfo._id), {
        data: { partnerId: partner._openid, role: 'boyfriend' }
      });
      batch.update(db.collection('users').doc(partner._id), {
        data: { partnerId: that.data.userInfo._openid, role: 'girlfriend' }
      });

      batch.commit().then(() => {
        wx.showToast({ title: '绑定成功' });
        that.hideBindModal();
        that.getUserInfo();
      });
    });
  },

  generateInviteCode: function() {
    return 'COUPLE' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substr(2, 4).toUpperCase();
  }
});
