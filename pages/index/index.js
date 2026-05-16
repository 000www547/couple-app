// pages/index/index.js
const app = getApp();

Page({
  data: {
    userInfo: null,
    daysTogether: 0,
    partnerBirthday: null,
    birthdayCountdown: -1, // -1 表示没有生日记录，0 表示生日就在今天
    anniversaries: [],
    showAddModal: false,
    currentPinnedLabel: '在一起的第',
    pinnedAnniversary: null,
    currentPinnedIndex: 0, // 当前首页显示第几个纪念日
    today: '', // 今天日期，用于日期选择限制
    intimacyLevel: 1, // 亲密度等级
    intimacy: 0, // 亲密度点数
    newAnniversary: {
      title: '',
      date: '',
      type: 'custom',
      customTitle: '',
      who: '我' // 默认是"我"的生日
    }
  },

  onShow: function() {
    // 设置今天的日期用于日期选择限制
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    this.setData({ today: today });
    this.login();
  },

  login: function(retryCount = 0) {
    wx.showLoading({ title: '加载中...' });

    wx.cloud.callFunction({
      name: 'login',
      data: {},
      timeout: 30000  // 增加超时时间到30秒
    }).then(res => {
      wx.hideLoading();
      if (res.result && res.result.success) {
        const user = res.result.user;
        this.setData({ userInfo: user });
        app.globalData.userInfo = user;
        app.globalData.isLoggedIn = true;

        // 计算亲密度等级
        const intimacy = user.intimacy || 0;
        const intimacyLevel = this.calculateIntimacyLevel(intimacy);
        this.setData({
          intimacy: intimacy,
          intimacyLevel: intimacyLevel
        });

        this.loadAnniversaries();
      } else {
        wx.showToast({
          title: '登录失败，请重试',
          icon: 'none'
        });
      }
    }).catch(err => {
      wx.hideLoading();
      console.error('登录失败', err);

      // 如果是超时错误，最多重试2次
      if (err.errMsg && err.errMsg.includes('timeout') && retryCount < 2) {
        console.log(`登录超时，正在重试... (${retryCount + 1}/2)`);
        setTimeout(() => {
          this.login(retryCount + 1);
        }, 2000); // 2秒后重试
        return;
      }

      wx.showToast({
        title: '网络错误，请检查连接',
        icon: 'none'
      });
    });
  },

  calculateDaysTogether: function(startDate) {
    const [y, m, d] = startDate.split('-').map(Number);
    const start = new Date(y, m - 1, d);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return Math.floor((now - start) / (1000 * 60 * 60 * 24));
  },

  // 计算亲密度等级
  calculateIntimacyLevel: function(intimacy) {
    if (intimacy >= 500) return 10;
    if (intimacy >= 300) return 9;
    if (intimacy >= 200) return 8;
    if (intimacy >= 150) return 7;
    if (intimacy >= 100) return 6;
    if (intimacy >= 70) return 5;
    if (intimacy >= 40) return 4;
    if (intimacy >= 20) return 3;
    if (intimacy >= 10) return 2;
    return 1;
  },

  calculateBirthdayCountdown: function(birthday) {
    if (!birthday) return 0;
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    // 解析生日的月日
    const [year, month, day] = birthday.split('-').map(Number);

    // 计算到今年生日的天数
    let thisYearBirthday = new Date(now.getFullYear(), month - 1, day);
    // 如果今年生日已过，计算到明年
    if (thisYearBirthday < now) {
      thisYearBirthday = new Date(now.getFullYear() + 1, month - 1, day);
    }

    // 计算天数差，向上取整以确保正确性
    const diffTime = thisYearBirthday - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return diffDays;
  },

  calculateCountdown: function(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return Math.floor((date - now) / (1000 * 60 * 60 * 24));
  },

  // 加载纪念日列表
  loadAnniversaries: function() {
    const that = this;
    const db = wx.cloud.database();

    if (!this.data.userInfo || !this.data.userInfo._openid) {
      console.log('用户未登录，跳过加载纪念日');
      return;
    }

    const currentOpenid = this.data.userInfo._openid;

    let query = db.collection('anniversaries').where({
      userId: currentOpenid
    });

    if (this.data.userInfo.activeRelationship) {
      query = db.collection('anniversaries').where(
        db.command.or(
          { userId: currentOpenid },
          { userId: this.data.userInfo.activeRelationship }
        )
      );
    }

    query.orderBy('date', 'asc').get({
      success: function(res) {
        const anniversaries = res.data.map(item => {
          let countdown = 0;
          let isPast = false;

          // 根据类型使用不同的计算方式
          if (item.type === 'birthday') {
            countdown = that.calculateBirthdayCountdown(item.date);
            isPast = false; // 生日总是显示"距离下次还有XX天"
          } else if (item.type === 'start') {
            countdown = that.calculateDaysTogether(item.date);
            isPast = false; // 在一起天数总是正数
          } else {
            // 自定义纪念日：保留正负号（未来为正，过去为负）
            countdown = that.calculateCountdown(item.date);
            isPast = countdown < 0;
          }

          item.isPartner = item.userId !== currentOpenid;
          return {
            ...item,
            countdown: countdown, // 保留正负号
            displayCountdown: Math.abs(countdown), // 显示用的正数
            isPast: isPast
          };
        });

        // 重置当前显示的索引，并确保在有效范围内
        const currentIndex = that.data.currentPinnedIndex || 0;
        const validIndex = anniversaries.length > 0 ? currentIndex % anniversaries.length : 0;

        // 找到第一个生日类型作为生日倒计时显示
        const birthdayAnniversary = anniversaries.find(a => a.type === 'birthday');
        const birthdayCountdown = birthdayAnniversary ? birthdayAnniversary.countdown : -1;

        // 如果没有纪念日，立即清空首页主卡片，防止旧数据残留
        if (anniversaries.length === 0) {
          that.setData({
            anniversaries: [],
            currentPinnedIndex: 0,
            birthdayCountdown: -1,
            pinnedAnniversary: null,
            currentPinnedLabel: '添加你们的第一个纪念日'
          });
          return; // 直接返回，不再调用 updateHeroCard
        }

        that.setData({
          anniversaries,
          currentPinnedIndex: validIndex,
          birthdayCountdown: birthdayCountdown
        });
        that.updateHeroCard();
      },
      fail: function(err) {
        console.error('加载纪念日失败', err);
      }
    });
  },

  // 更新主卡片显示
  updateHeroCard: function() {
    const { anniversaries, currentPinnedIndex } = this.data;

    // 如果没有纪念日，显示空状态
    if (!anniversaries || anniversaries.length === 0) {
      this.setData({
        pinnedAnniversary: null,
        currentPinnedLabel: '添加你们的第一个纪念日'
      });
      return;
    }

    // 确保索引在有效范围内
    const validIndex = currentPinnedIndex % anniversaries.length;
    const pinned = anniversaries[validIndex];

    if (pinned) {
      let label = '';
      let days = 0;
      let unit = '天';
      let subtitle = '';

      // 根据类型计算显示内容
      if (pinned.type === 'start') {
        // 在一起：显示"第XX天"
        label = '在一起的第';
        days = this.calculateDaysTogether(pinned.date);
        unit = '天';
      } else if (pinned.type === 'birthday') {
        // 生日：显示"距离下次还有XX天"
        label = '距离生日还有';
        days = this.calculateBirthdayCountdown(pinned.date);
        unit = '天';
        // 显示是谁的生日
        subtitle = pinned.who ? `${pinned.who}的生日` : pinned.title;
      } else {
        // 自定义纪念日：根据日期是未来还是过去，分别处理
        const countdown = this.calculateCountdown(pinned.date);
        if (countdown >= 0) {
          // 未来日期：倒数
          label = '距离' + pinned.title + '还有';
          days = countdown;
          unit = '天';
        } else {
          // 过去日期：显示"第XX天"
          label = pinned.title + '的第';
          days = Math.abs(countdown);
          unit = '天';
        }
      }

      this.setData({
        pinnedAnniversary: {
          label: label,
          days: days,
          unit: unit,
          subtitle: subtitle || pinned.title,
          type: pinned.type
        },
        currentPinnedIndex: validIndex
      });
    }
  },

  // 点击主卡片切换显示下一个纪念日
  togglePinnedType: function() {
    const { anniversaries, currentPinnedIndex } = this.data;

    // 如果没有纪念日，不执行切换
    if (!anniversaries || anniversaries.length === 0) {
      wx.showToast({
        title: '请先添加纪念日',
        icon: 'none'
      });
      return;
    }

    // 切换到下一个纪念日
    let nextIndex = (currentPinnedIndex + 1) % anniversaries.length;

    this.setData({
      currentPinnedIndex: nextIndex
    });

    this.updateHeroCard();

    // 显示提示：当前显示的是第几个
    const current = anniversaries[nextIndex];
    const whoInfo = current.who ? `(${current.who})` : '';
    wx.showToast({
      title: `${current.title} ${whoInfo}`,
      icon: 'none',
      duration: 1000
    });
  },

  showAddAnniversary: function() {
    this.setData({ showAddModal: true });
  },

  hideAddModal: function() {
    this.setData({
      showAddModal: false,
      newAnniversary: { title: '', date: '', type: 'custom', customTitle: '', who: '我' }
    });
  },

  onCustomTitleInput: function(e) {
    this.setData({
      'newAnniversary.customTitle': e.detail.value
    });
  },

  // 输入"是谁的"生日
  onWhoInput: function(e) {
    this.setData({
      'newAnniversary.who': e.detail.value
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
    const db = wx.cloud.database(); // 先初始化 db

    if (!this.data.userInfo || !this.data.userInfo._openid) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }

    if (!newAnniversary.date) {
      wx.showToast({ title: '请选择日期', icon: 'none' });
      return;
    }

    let finalTitle = newAnniversary.title;
    if (newAnniversary.type === 'custom') {
      finalTitle = newAnniversary.customTitle || '自定义纪念日';
      if (!newAnniversary.customTitle) {
        wx.showToast({ title: '请输入自定义标题', icon: 'none' });
        return;
      }
    }

    // 构建保存的数据
    const saveData = {
      userId: this.data.userInfo._openid,
      title: finalTitle,
      date: newAnniversary.date,
      type: newAnniversary.type,
      createTime: db.serverDate() // 现在 db 已经定义了
    };

    // 如果是生日类型，保存"是谁的"
    if (newAnniversary.type === 'birthday' && newAnniversary.who) {
      saveData.who = newAnniversary.who;
    }

    db.collection('anniversaries').add({
      data: saveData,
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
