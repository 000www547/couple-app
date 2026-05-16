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
    loading: false,
    commentInputs: {}, // 每条动态的评论输入
    replyingTo: null, // 当前回复的对象
    replyingToCommentId: null // 回复的评论ID
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
        // 为每条动态初始化评论相关字段
        const moments = res.result.moments.map(m => ({
          ...m,
          showComments: false,
          comments: [],
          commentUserInfos: {}
        }));

        this.setData({
          moments: moments,
          userInfos: res.result.userInfos
        });

        // 加载每条动态的评论
        this.loadAllComments();
      }
    }).catch(err => {
      this.setData({ loading: false });
      console.error('加载失败', err);
    });
  },

  // 加载所有动态的评论
  loadAllComments: function() {
    const moments = this.data.moments;
    const promises = moments.map((moment, index) => {
      return wx.cloud.callFunction({
        name: 'moments',
        data: {
          action: 'getComments',
          momentId: moment._id
        }
      }).then(res => {
        if (res.result.success) {
          const updatedMoments = this.data.moments;
          updatedMoments[index].comments = res.result.comments;
          updatedMoments[index].commentUserInfos = res.result.commentUserInfos || {};
          this.setData({ moments: updatedMoments });
        }
      }).catch(err => {
        console.error('加载评论失败', err);
      });
    });

    Promise.all(promises).catch(err => {
      console.error('批量加载评论失败', err);
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
  },

  // 切换评论显示/隐藏
  toggleComments: function(e) {
    const momentId = e.currentTarget.dataset.id;
    const index = e.currentTarget.dataset.index;
    const moments = this.data.moments;

    moments[index].showComments = !moments[index].showComments;

    // 关闭回复状态
    this.setData({
      moments: moments,
      replyingTo: null,
      replyingToCommentId: null
    });
  },

  // 显示回复输入框
  showReplyInput: function(e) {
    const momentId = e.currentTarget.dataset.momentid;
    const commentId = e.currentTarget.dataset.commentid;
    const userId = e.currentTarget.dataset.userid;
    const index = e.currentTarget.dataset.index;
    const moments = this.data.moments;
    const commentUserInfos = moments[index].commentUserInfos;

    const replyToNickname = commentUserInfos[userId]?.nickname || '匿名用户';

    this.setData({
      replyingTo: replyToNickname,
      replyingToCommentId: commentId
    });
  },

  // 评论输入
  onCommentInput: function(e) {
    const momentId = e.currentTarget.dataset.momentid;
    const value = e.detail.value;
    const commentInputs = this.data.commentInputs;
    commentInputs[momentId] = value;
    this.setData({ commentInputs: commentInputs });
  },

  // 提交评论
  submitComment: function(e) {
    const momentId = e.currentTarget.dataset.momentid;
    const content = this.data.commentInputs[momentId];

    if (!content || !content.trim()) {
      wx.showToast({ title: '请输入评论内容', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '发送中...' });

    const data = {
      action: 'addComment',
      momentId: momentId,
      content: content.trim()
    };

    // 如果是回复
    if (this.data.replyingToCommentId) {
      data.replyTo = this.data.replyingToCommentId;
      data.replyToUserId = this.getReplyToUserId(momentId);
    }

    wx.cloud.callFunction({
      name: 'moments',
      data: data
    }).then(res => {
      wx.hideLoading();
      if (res.result.success) {
        wx.showToast({ title: '评论成功' });

        // 清空输入
        const commentInputs = this.data.commentInputs;
        commentInputs[momentId] = '';
        this.setData({
          commentInputs: commentInputs,
          replyingTo: null,
          replyingToCommentId: null
        });

        // 重新加载评论
        this.loadAllComments();
      } else {
        wx.showToast({ title: '评论失败', icon: 'none' });
      }
    }).catch(err => {
      wx.hideLoading();
      console.error('评论失败', err);
      wx.showToast({ title: '评论失败', icon: 'none' });
    });
  },

  // 获取回复目标用户的ID
  getReplyToUserId: function(momentId) {
    const moments = this.data.moments;
    const moment = moments.find(m => m._id === momentId);
    if (moment && moment.comments) {
      const comment = moment.comments.find(c => c._id === this.data.replyingToCommentId);
      return comment?.userId || null;
    }
    return null;
  },

  // 删除评论
  deleteComment: function(e) {
    const commentId = e.currentTarget.dataset.commentid;
    const momentId = e.currentTarget.dataset.momentid;
    const that = this;

    wx.showModal({
      title: '确认删除',
      content: '确定要删除这条评论吗？',
      success: function(res) {
        if (res.confirm) {
          wx.cloud.callFunction({
            name: 'moments',
            data: {
              action: 'deleteComment',
              commentId: commentId
            }
          }).then(res => {
            if (res.result.success) {
              wx.showToast({ title: '已删除' });
              that.loadAllComments();
            }
          });
        }
      }
    });
  }
});
