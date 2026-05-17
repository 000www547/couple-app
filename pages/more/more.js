// pages/more/more.js
const app = getApp();

Page({
  data: {
    intimacy: 0,
    intimacyLevel: 1,
    showIntimacyHelp: false
  },

  onShow: function() {
    this.getIntimacy();
  },

  onLoad: function() {},

  // 获取亲密度数据
  getIntimacy: function() {
    wx.cloud.callFunction({
      name: 'login',
      data: {}
    }).then(res => {
      if (res.result.success && res.result.user) {
        const intimacy = res.result.user.intimacy || 0;
        this.setData({
          intimacy: intimacy,
          intimacyLevel: this.calculateLevel(intimacy)
        });
      }
    });
  },

  // 计算亲密度等级
  calculateLevel: function(intimacy) {
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

  // 获取下一级所需亲密度
  getNextLevelNeed: function() {
    const level = this.data.intimacyLevel;
    const thresholds = [0, 10, 20, 40, 70, 100, 150, 200, 300, 500];
    if (level >= 10) return null; // 最高级
    return thresholds[level];
  },

  // 跳转戳一戳页面
  goToPoke: function() {
    wx.navigateTo({
      url: '/pages/more/poke/poke'
    });
  },

  // 显示亲密度帮助
  showIntimacyHelp: function() {
    const level = this.data.intimacyLevel;
    const currentIntimacy = this.data.intimacy;
    const thresholds = [0, 10, 20, 40, 70, 100, 150, 200, 300, 500];
    const nextThreshold = level >= 10 ? null : thresholds[level];
    const progress = nextThreshold ? Math.min(100, Math.round((currentIntimacy / nextThreshold) * 100)) : 100;

    wx.showModal({
      title: '💗 亲密度说明',
      content: `当前等级：Lv.${level}\n当前亲密度：${currentIntimacy}\n${nextThreshold ? '距离升级：' + (nextThreshold - currentIntimacy) + '点' : '已达到最高等级！'}\n\n📈 如何提升亲密度：\n• 评论甜蜜时刻 +1点\n• 戳一戳TA +2点\n\n💝 亲密度等级：\nLv.1-2 陌生阶段\nLv.3-4 初步认识\nLv.5-6 熟悉阶段\nLv.7-8 亲密阶段\nLv.9-10 灵魂伴侣`,
      showCancel: false,
      confirmText: '知道了'
    });
  },

  // 显示关于信息
  showAbout: function() {
    wx.showModal({
      title: '💝 泡芙空间',
      content: '一款专为亲密关系设计的日常分享小程序\n\n📌 主要功能：\n• 纪念日管理\n• 甜蜜时刻\n• 心愿清单\n• 戳一戳互动\n• 亲密度系统\n\n🎨 开发：Claude & 000www547\n📧 GitHub: github.com/000www547/couple-app',
      showCancel: false,
      confirmText: '了解了'
    });
  }
});