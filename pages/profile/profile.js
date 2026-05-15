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
      if (res.result && res.result.success) {
        const user = res.result.user;
        that.setData({ userInfo: user });
        app.globalData.userInfo = user;
        app.globalData.isLoggedIn = true;

        // 加载统计数据
        if (user && user._openid) {
          that.loadStats();
        }

        // 如果有伴侣，获取伴侣信息
        if (user && user.partnerId) {
          that.getPartnerInfo(user.partnerId);
        }
      } else {
        console.error('获取用户信息失败', res.result);
      }
    }).catch(err => {
      console.error('获取用户信息出错', err);
      wx.showToast({
        title: '加载失败，请重试',
        icon: 'none'
      });
    });
  },

  loadStats: function() {
    const db = wx.cloud.database();
    const userInfo = this.data.userInfo;

    if (!userInfo || !userInfo._openid) {
      console.log('用户未登录，跳过加载统计');
      return;
    }

    const openid = userInfo._openid;

    // 统计动态数
    db.collection('moments').where({
      userId: openid
    }).count().then(res => {
      this.setData({ 'stats.moments': res.total });
    }).catch(err => {
      console.error('统计动态数失败', err);
    });

    // 统计心愿
    db.collection('wishes').where({
      userId: openid
    }).count().then(res => {
      this.setData({ 'stats.wishes': res.total });
    }).catch(err => {
      console.error('统计心愿失败', err);
    });

    // 统计已完成心愿
    db.collection('wishes').where({
      userId: openid,
      isCompleted: true
    }).count().then(res => {
      this.setData({ 'stats.completedWishes': res.total });
    }).catch(err => {
      console.error('统计已完成心愿失败', err);
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
    const userInfo = this.data.userInfo;
    if (!userInfo) {
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      });
      return;
    }

    this.setData({
      showEditModal: true,
      editForm: {
        nickname: userInfo.nickname || '',
        anniversaryDate: userInfo.anniversaryDate || '',
        birthday: userInfo.birthday || ''
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

    if (!userInfo || !userInfo._id) {
      wx.showToast({
        title: '用户未登录',
        icon: 'none'
      });
      return;
    }

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
      },
      fail: (err) => {
        console.error('保存资料失败', err);
        wx.showToast({
          title: '保存失败',
          icon: 'none'
        });
      }
    });
  },

  onChooseAvatar: function(e) {
    const avatarUrl = e.detail.avatarUrl;
    const that = this;

    if (!that.data.userInfo || !that.data.userInfo._id) {
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      });
      return;
    }

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
          },
          fail: (err) => {
            console.error('更新头像失败', err);
            wx.showToast({
              title: '更新失败',
              icon: 'none'
            });
          }
        });
      },
      fail: (err) => {
        console.error('上传头像失败', err);
        wx.showToast({
          title: '上传失败',
          icon: 'none'
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

    const userInfo = this.data.userInfo;
    if (!userInfo || !userInfo._id || !userInfo._openid) {
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      });
      return;
    }

    const db = wx.cloud.database();
    const that = this;

    wx.showLoading({ title: '绑定中...' });

    // 通过邀请码查找用户
    db.collection('users').where({
      inviteCode: code
    }).get().then(res => {
      if (res.data.length === 0) {
        wx.hideLoading();
        wx.showToast({
          title: '邀请码无效',
          icon: 'none'
        });
        return;
      }

      const partner = res.data[0];
      if (partner._openid === userInfo._openid) {
        wx.hideLoading();
        wx.showToast({
          title: '不能绑定自己',
          icon: 'none'
        });
        return;
      }

      // 互相绑定
      const batch = db.batch();
      batch.update(db.collection('users').doc(userInfo._id), {
        data: { partnerId: partner._openid, role: 'boyfriend' }
      });
      batch.update(db.collection('users').doc(partner._id), {
        data: { partnerId: userInfo._openid, role: 'girlfriend' }
      });

      batch.commit().then(() => {
        wx.hideLoading();
        wx.showToast({ title: '绑定成功' });
        that.hideBindModal();
        that.getUserInfo();
      }).catch(err => {
        wx.hideLoading();
        console.error('绑定失败', err);
        wx.showToast({
          title: '绑定失败',
          icon: 'none'
        });
      });
    }).catch(err => {
      wx.hideLoading();
      console.error('查找邀请码失败', err);
      wx.showToast({
        title: '网络错误',
        icon: 'none'
      });
    });
  },

  generateInviteCode: function() {
    return 'COUPLE' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substr(2, 4).toUpperCase();
  }
});
