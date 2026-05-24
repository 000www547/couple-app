// pages/pet/pet.js
const app = getApp();

Page({
  data: {
    needBind: false,
    hasPet: false,
    pet1: null,
    pet2: null,
    currentSlot: 'pet1',
    currentPet: null,
    canUnlockPet2: false,
    
    // 新建宠物
    newPetType: '',
    newPetName: '',
    
    // 弹窗
    showUnlockPopup: false,
    showEditNamePopup: false,
    editName: '',
    
    // 操作状态
    isOperating: false,
    showIntro: false,  // 功能介绍是否展开

    // 动画状态
    showHearts: false,   // 摸摸爱心泡泡
    showFoodFly: false,   // 投喂食物飞入
    showSparkle: false,   // 好感度升级闪光
    petBounce: false,     // 宠物跳跃
    petShake: false,      // 宠物摇晃
    feedAnim: false,       // 投喂按钮动画
    petAnim: false,        // 摸摸按钮动画
    prevAffection: 0       // 上一次好感度（用于检测升级）
  },

  onShow: function() {
    this.getPetData();
  },

  // 获取宠物数据
  getPetData: function() {
    wx.cloud.callFunction({
      name: 'pet',
      data: { action: 'get' }
    }).then(res => {
      if (res.result.success) {
        if (res.result.needBind) {
          this.setData({ needBind: true });
          return;
        }

        if (!res.result.hasPet) {
          this.setData({
            needBind: false,
            hasPet: false
          });
          return;
        }

        this.setData({
          needBind: false,
          hasPet: true,
          pet1: res.result.pet1,
          pet2: res.result.pet2,
          canUnlockPet2: res.result.canUnlockPet2,
        });

        // 保留当前选中的宠物槽位，不要自动跳回 pet1
        const slot = this.data.currentSlot;
        const targetPet = slot === 'pet2' && res.result.pet2 ? res.result.pet2 : res.result.pet1;
        this.setData({
          currentPet: targetPet,
          currentSlot: targetPet === res.result.pet2 ? 'pet2' : 'pet1'
        });

        // 检测好感度是否升级（触发闪光特效），基于当前选中的宠物
        if (targetPet && this.data.prevAffection > 0) {
          const newAff = targetPet.affection || 0;
          const oldAff = this.data.prevAffection;
          if (Math.floor(newAff / 20) > Math.floor(oldAff / 20)) {
            this.triggerSparkle();
          }
        }
        this.setData({ prevAffection: targetPet ? (targetPet.affection || 0) : 0 });
      } else if (res.result.error) {
        wx.showToast({
          title: res.result.error,
          icon: 'none'
        });
      }
    });
  },

  // 选择宠物类型
  selectPetType: function(e) {
    this.setData({
      newPetType: e.currentTarget.dataset.type
    });
  },

  // 输入宠物名字
  onNameInput: function(e) {
    this.setData({
      newPetName: e.detail.value
    });
  },

  // 创建宠物
  createPet: function() {
    if (!this.data.newPetType) {
      wx.showToast({
        title: '请选择宠物类型',
        icon: 'none'
      });
      return;
    }

    wx.showLoading({ title: '创建中...' });

    wx.cloud.callFunction({
      name: 'pet',
      data: {
        action: 'init',
        petType: this.data.newPetType,
        petName: this.data.newPetName || (this.data.newPetType === 'dog' ? '小狗' : '小兔')
      }
    }).then(res => {
      wx.hideLoading();
      if (res.result.success) {
        wx.showToast({
          title: '创建成功',
          icon: 'success'
        });
        this.getPetData();
      } else {
        wx.showToast({
          title: res.result.error,
          icon: 'none'
        });
      }
    });
  },

  // 切换宠物
  switchPet: function(e) {
    const slot = e.currentTarget.dataset.slot;
    const pet = slot === 'pet1' ? this.data.pet1 : this.data.pet2;
    
    this.setData({
      currentSlot: slot,
      currentPet: pet
    });
  },

  // 投喂
  feedPet: function() {
    if (this.data.isOperating) return;
    
    this.setData({ isOperating: true });

    // 触发投喂动画
    this.setData({
      showFoodFly: true,
      petBounce: true,
      feedAnim: true
    });
    // 重置动画状态
    setTimeout(() => {
      this.setData({
        showFoodFly: false,
        feedAnim: false
      });
    }, 800);
    setTimeout(() => {
      this.setData({ petBounce: false });
    }, 600);

    wx.cloud.callFunction({
      name: 'pet',
      data: {
        action: 'feed',
        slot: this.data.currentSlot
      }
    }).then(res => {
      this.setData({ isOperating: false });
      if (res.result.success) {
        wx.showToast({
          title: '投喂成功 +2',
          icon: 'none'
        });
        this.getPetData();
      } else {
        wx.showToast({
          title: res.result.error,
          icon: 'none'
        });
      }
    });
  },

  // 抚摸
  petAnimal: function() {
    if (this.data.isOperating) return;
    
    this.setData({ isOperating: true });

    // 触发摸摸动画
    this.setData({
      showHearts: true,
      petShake: true,
      petAnim: true
    });
    // 重置动画状态
    setTimeout(() => {
      this.setData({
        showHearts: false,
        petAnim: false
      });
    }, 1500);
    setTimeout(() => {
      this.setData({ petShake: false });
    }, 500);

    wx.cloud.callFunction({
      name: 'pet',
      data: {
        action: 'pet',
        slot: this.data.currentSlot
      }
    }).then(res => {
      this.setData({ isOperating: false });
      if (res.result.success) {
        wx.showToast({
          title: '抚摸成功 +3',
          icon: 'none'
        });
        this.getPetData();
      } else {
        wx.showToast({
          title: res.result.error,
          icon: 'none'
        });
      }
    });
  },

  // 显示解锁弹窗
  showUnlockModal: function() {
    this.setData({
      showUnlockPopup: true,
      newPetType: '',
      newPetName: ''
    });
  },

  // 隐藏解锁弹窗
  hideUnlockModal: function() {
    this.setData({ showUnlockPopup: false });
  },

  // 解锁第二只宠物
  unlockPet2: function() {
    if (!this.data.newPetType) {
      wx.showToast({
        title: '请选择宠物类型',
        icon: 'none'
      });
      return;
    }

    wx.showLoading({ title: '解锁中...' });

    wx.cloud.callFunction({
      name: 'pet',
      data: {
        action: 'unlockPet2',
        petType: this.data.newPetType,
        petName: this.data.newPetName || (this.data.newPetType === 'dog' ? '小狗' : '小兔')
      }
    }).then(res => {
      wx.hideLoading();
      if (res.result.success) {
        wx.showToast({
          title: '解锁成功',
          icon: 'success'
        });
        this.setData({ showUnlockPopup: false });
        this.getPetData();
      } else {
        wx.showToast({
          title: res.result.error,
          icon: 'none'
        });
      }
    });
  },

  // 显示修改名字弹窗
  showEditName: function() {
    this.setData({
      showEditNamePopup: true,
      editName: this.data.currentPet.name
    });
  },

  // 隐藏修改名字弹窗
  hideEditNamePopup: function() {
    this.setData({ showEditNamePopup: false });
  },

  // 输入新名字
  onEditNameInput: function(e) {
    this.setData({
      editName: e.detail.value
    });
  },

  // 确认修改名字
  confirmEditName: function() {
    if (!this.data.editName.trim()) {
      wx.showToast({
        title: '请输入名字',
        icon: 'none'
      });
      return;
    }

    wx.showLoading({ title: '修改中...' });

    wx.cloud.callFunction({
      name: 'pet',
      data: {
        action: 'setName',
        slot: this.data.currentSlot,
        name: this.data.editName.trim()
      }
    }).then(res => {
      wx.hideLoading();
      if (res.result.success) {
        wx.showToast({
          title: '修改成功',
          icon: 'success'
        });
        this.setData({ showEditNamePopup: false });
        this.getPetData();
      } else {
        wx.showToast({
          title: res.result.error,
          icon: 'none'
        });
      }
    });
  },

  // 去绑定
  goToBind: function() {
    wx.navigateBack();
  },

  // 切换功能介绍展开/收起
  toggleIntro: function() {
    this.setData({ showIntro: !this.data.showIntro });
  },

  // 触发闪光特效（好感度升级时）
  triggerSparkle: function() {
    this.setData({ showSparkle: true });
    setTimeout(() => {
      this.setData({ showSparkle: false });
    }, 1000);
  }
});
