// pages/moments/moments.js
const app = getApp();

Page({
  data: {
    moments: [],
    userInfos: {},
    currentUser: null,
    showPostModal: false,
    newMoment: {
      content: '',
      images: []
    },
    loading: false
  },

  onShow: function() {
    this.loadMoments();
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
      }
    });
  },

  loadMoments: function() {
    this.setData({ loading: true });
    
    wx.cloud.callFunction({
      name: 'moments',
      data: { action: 'getList' }
    }).then(res => {
      this.setData({ loading: false });
      if (res.result.success) {
        this.setData({
          moments: res.result.moments,
          userInfos: res.result.userInfos
        });
      }
    }).catch(err => {
      this.setData({ loading: false });
      console.error('加载失败', err);
    });
  },

  showPostModal: function() {
    this.setData({ showPostModal: true });
  },

  hidePostModal: function() {
    this.setData({ 
      showPostModal: false,
      newMoment: { content: '', images: [] }
    });
  },

  onContentInput: function(e) {
    this.setData({
      'newMoment.content': e.detail.value
    });
  },

  chooseImages: function() {
    const that = this;
    const maxCount = 9 - this.data.newMoment.images.length;
    
    if (maxCount <= 0) {
      wx.showToast({
        title: '最多9张图片',
        icon: 'none'
      });
      return;
    }

    wx.chooseImage({
      count: maxCount,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: function(res) {
        const images = [...that.data.newMoment.images, ...res.tempFilePaths];
        that.setData({
          'newMoment.images': images
        });
      }
    });
  },

  removeImage: function(e) {
    const index = e.currentTarget.dataset.index;
    const images = this.data.newMoment.images;
    images.splice(index, 1);
    this.setData({
      'newMoment.images': images
    });
  },

  uploadImages: function(images) {
    return new Promise((resolve, reject) => {
      if (images.length === 0) {
        resolve([]);
        return;
      }

      const promises = images.map((path) => {
        return new Promise((res, rej) => {
          const cloudPath = 'moments/' + Date.now() + '-' + Math.random() * 1000000 + '.' + path.split('.').pop();
          wx.cloud.uploadFile({
            cloudPath: cloudPath,
            filePath: path,
            success: function(uploadRes) {
              res(uploadRes.fileID);
            },
            fail: function(err) {
              rej(err);
            }
          });
        });
      });

      Promise.all(promises).then(resolve).catch(reject);
    });
  },

  postMoment: async function() {
    const { newMoment } = this.data;
    
    if (!newMoment.content && newMoment.images.length === 0) {
      wx.showToast({
        title: '请输入内容或选择图片',
        icon: 'none'
      });
      return;
    }

    wx.showLoading({ title: '发布中...' });

    try {
      let images = [];
      if (newMoment.images.length > 0) {
        images = await this.uploadImages(newMoment.images);
      }

      await wx.cloud.callFunction({
        name: 'moments',
        data: {
          action: 'add',
          content: newMoment.content,
          images: images
        }
      });

      wx.hideLoading();
      wx.showToast({ title: '发布成功' });
      this.hidePostModal();
      this.loadMoments();
    } catch (err) {
      wx.hideLoading();
      wx.showToast({
        title: '发布失败',
        icon: 'none'
      });
      console.error(err);
    }
  },

  likeMoment: function(e) {
    const momentId = e.currentTarget.dataset.id;
    
    wx.cloud.callFunction({
      name: 'moments',
      data: {
        action: 'like',
        momentId: momentId
      }
    }).then(res => {
      if (res.result.success) {
        this.loadMoments();
      }
    });
  },

  deleteMoment: function(e) {
    const momentId = e.currentTarget.dataset.id;
    const that = this;
    
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这条动态吗？',
      success: function(res) {
        if (res.confirm) {
          wx.cloud.callFunction({
            name: 'moments',
            data: {
              action: 'delete',
              momentId: momentId
            }
          }).then(res => {
            if (res.result.success) {
              wx.showToast({ title: '已删除' });
              that.loadMoments();
            }
          });
        }
      }
    });
  },

  previewImage: function(e) {
    const url = e.currentTarget.dataset.url;
    wx.previewImage({
      current: url,
      urls: [url]
    });
  }
});
