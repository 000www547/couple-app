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
    isOperating: false
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
          currentPet: res.result.pet1,
          currentSlot: 'pet1'
        });
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
  }
});
