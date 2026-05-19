// pages/profile/profile.js
const app = getApp();

Page({
  data: {
    userInfo: null,
    partnerInfo: null,
    relationships: [],
    stats: {
      moments: 0,
      wishes: 0,
      completedWishes: 0
    },
    showEditModal: false,
    showBindModal: false,
    showUnbindModal: false,
    editForm: {
      nickname: '',
      anniversaryDate: '',
      birthday: ''
    },
    partnerCode: '',
    selectedRelationType: 'couple',
    customRelationName: '',
    today: '' // 今天日期，用于日期选择限制
  },

  onShow: function() {
    // 设置今天的日期用于日期选择限制
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    this.setData({ today: today });
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

        // 如果有激活的关系，获取关系信息
        if (user && user.activeRelationship) {
          that.getPartnerInfo(user.activeRelationship);
        }

        // 加载关系列表
        that.loadRelationships();
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
    const that = this;
    db.collection('users').where({
      _openid: partnerId
    }).get().then(async res => {
      if (res.data.length > 0) {
        let partner = res.data[0];
        console.log('[profile] partner 原始数据:', JSON.stringify({
          nickname: partner.nickname,
          avatar: partner.avatar,
          _openid: partner._openid
        }));
        // 转换 cloud:// 头像为 HTTPS
        if (partner.avatar && partner.avatar.startsWith('cloud://')) {
          console.log('[profile] 开始转换头像:', partner.avatar);
          try {
            // 通过云函数获取临时链接（绕过客户端权限限制）
            const urlRes = await wx.cloud.callFunction({
              name: 'getTempFileURL',
              data: { fileList: [partner.avatar] }
            });
            console.log('[profile] 云函数返回:', JSON.stringify(urlRes));
            if (urlRes.result && urlRes.result.success && urlRes.result.data && urlRes.result.data.fileList) {
              const fileItem = urlRes.result.data.fileList[0];
              if (fileItem && fileItem.tempFileURL) {
                partner.avatar = fileItem.tempFileURL;
                console.log('[profile] 头像转换成功:', partner.avatar);
              } else {
                console.log('[profile] 头像转换失败: 无 tempFileURL, status:', fileItem && fileItem.status, 'errMsg:', fileItem && fileItem.errMsg);
              }
            } else {
              console.log('[profile] 头像转换失败:', urlRes.result && urlRes.result.error);
            }
          } catch (e) {
            console.error('[profile] 头像转换异常:', e);
          }
        }
        that.setData({ partnerInfo: partner });
      }
    });
  },

  // 加载关系列表
  loadRelationships: function() {
    wx.cloud.callFunction({
      name: 'relationships',
      data: { action: 'getList' }
    }).then(res => {
      if (res.result && res.result.success) {
        this.setData({
          relationships: res.result.relationships || [],
          activeRelationship: res.result.activeRelationship
        });
      }
    }).catch(err => {
      console.error('加载关系列表失败', err);
    });
  },

  // 选择关系类型
  onRelationTypeChange: function(e) {
    const types = ['couple', 'bestie', 'family', 'custom'];
    this.setData({
      selectedRelationType: types[e.detail.value]
    });
  },

  // 设置关系类型
  setRelationType: function(e) {
    this.setData({
      selectedRelationType: e.currentTarget.dataset.type
    });
  },

  // 自定义关系名称输入
  onCustomRelationInput: function(e) {
    this.setData({
      customRelationName: e.detail.value
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
    this.setData({
      showBindModal: true,
      partnerCode: '',
      selectedRelationType: 'couple'
    });
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

    const that = this;

    wx.showLoading({ title: '绑定中...' });

    // 使用新的关系管理云函数
    wx.cloud.callFunction({
      name: 'relationships',
      data: {
        action: 'bind',
        partnerCode: code,
        relationType: that.data.selectedRelationType,
        customRelationName: that.data.selectedRelationType === 'custom' ? that.data.customRelationName : ''
      }
    }).then(res => {
      wx.hideLoading();
      if (res.result && res.result.success) {
        wx.showToast({ title: '绑定成功' });
        that.hideBindModal();
        that.getUserInfo();
      } else {
        wx.showToast({
          title: res.result.error || '绑定失败',
          icon: 'none'
        });
      }
    }).catch(err => {
      wx.hideLoading();
      console.error('绑定失败', err);
      wx.showToast({
        title: '网络错误',
        icon: 'none'
      });
    });
  },

  generateInviteCode: function() {
    return 'COUPLE' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substr(2, 4).toUpperCase();
  },

  // 复制邀请码
  copyInviteCode: function() {
    const userInfo = this.data.userInfo;
    if (!userInfo || !userInfo.inviteCode) {
      wx.showToast({
        title: '邀请码不存在',
        icon: 'none'
      });
      return;
    }

    wx.setClipboardData({
      data: userInfo.inviteCode,
      success: () => {
        wx.showToast({
          title: '邀请码已复制',
          icon: 'success'
        });
      },
      fail: () => {
        wx.showToast({
          title: '复制失败',
          icon: 'none'
        });
      }
    });
  },

  // 显示解除关系弹窗
  showUnbindModal: function() {
    this.setData({ showUnbindModal: true });
  },

  hideUnbindModal: function() {
    this.setData({ showUnbindModal: false });
  },

  // 发起解除关系
  requestUnbind: function() {
    const partnerInfo = this.data.partnerInfo;
    if (!partnerInfo) {
      wx.showToast({ title: '暂无绑定关系', icon: 'none' });
      return;
    }

    wx.showModal({
      title: '确认解除',
      content: '确定要发起解除关系吗？对方确认后将解除绑定。',
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '处理中...' });
          wx.cloud.callFunction({
            name: 'relationships',
            data: {
              action: 'requestUnbind',
              partnerId: partnerInfo._openid
            }
          }).then(res => {
            wx.hideLoading();
            if (res.result && res.result.success) {
              wx.showToast({ title: '已发起解除请求' });
              this.hideUnbindModal();
              this.loadRelationships();
            } else {
              wx.showToast({
                title: res.result.error || '操作失败',
                icon: 'none'
              });
            }
          }).catch(err => {
            wx.hideLoading();
            console.error('解除关系失败', err);
            wx.showToast({ title: '操作失败', icon: 'none' });
          });
        }
      }
    });
  },

  // 确认解除关系
  confirmUnbind: function(e) {
    const partnerId = e.currentTarget.dataset.partnerid;
    wx.showModal({
      title: '确认解除',
      content: '确定要解除该关系吗？解除后共同数据将被清除。',
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '处理中...' });
          wx.cloud.callFunction({
            name: 'relationships',
            data: {
              action: 'confirmUnbind',
              partnerId: partnerId
            }
          }).then(res => {
            wx.hideLoading();
            if (res.result && res.result.success) {
              wx.showToast({ title: '已解除关系' });
              this.setData({
                partnerInfo: null,
                partnerId: ''
              });
              this.loadRelationships();
              this.getUserInfo();
            } else {
              wx.showToast({
                title: res.result.error || '操作失败',
                icon: 'none'
              });
            }
          }).catch(err => {
            wx.hideLoading();
            console.error('解除关系失败', err);
            wx.showToast({ title: '操作失败', icon: 'none' });
          });
        }
      }
    });
  }
});
