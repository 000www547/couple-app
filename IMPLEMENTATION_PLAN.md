# 泡芙空间 - 全面改造实施计划

## 项目信息

- **项目名称**: 泡芙空间 (couple-app)
- **项目路径**: D:\ClaudeDev\couple-app
- **框架**: 微信小程序 + 微信云开发 + Vant WeApp
- **云环境ID**: cloud1-d3glxwciI0275ec8b
- **AppID**: wxe0cd39e9be5f1327
- **计划生成时间**: 2026-05-15

---

## 当前问题诊断

### 1. 云环境配置错误（致命）
- **错误**: `Env Not Exists` — 代码中使用 `env: 'cloud1'`，但实际环境ID是 `cloud1-d3glxwciI0275ec8b`
- **影响**: 所有云函数调用全部失败
- **修复文件**: `app.js`, `project.config.json`

### 2. 登录流程缺陷
- `userInfo` 为 null 时直接访问属性导致崩溃
- 缺少登录状态检查和错误处理
- **修复文件**: `app.js`, `pages/index/index.js`, `pages/profile/profile.js`

### 3. 功能未完善
- 纪念日标题固定为预设类型，无法自定义
- 编辑资料弹窗打开时 userInfo 为 null 导致崩溃
- 邀请码无展示入口

---

## 改造需求清单

### Phase 1: 修复基础问题（必须）

#### 1.1 修复云环境配置
- **文件**: `app.js`, `project.config.json`
- **操作**: 将 `env: 'cloud1'` 改为 `cloud1-d3glxwciI0275ec8b`

#### 1.2 修复登录流程
- **文件**: `app.js`, `pages/index/index.js`, `pages/profile/profile.js`
- **操作**:
  - 添加登录状态检查，未登录时显示登录按钮
  - 所有访问 `userInfo` 的地方添加 null 检查
  - 云函数调用失败时显示友好提示

#### 1.3 修复编辑资料崩溃
- **文件**: `pages/profile/profile.js`
- **操作**: `showEditModal` 中添加 `userInfo` 存在性检查

---

### Phase 2: 功能完善

#### 2.1 纪念日自定义标题
- **文件**: `pages/index/index.js`, `pages/index/index.wxml`
- **需求**: 用户可自定义纪念日标题，不仅限于"在一起"/"生日"/"其他"
- **实现**: 保留类型选择，但标题输入框允许自定义文本

#### 2.2 昵称设置优化
- **文件**: `pages/profile/profile.js`, `pages/profile/profile.wxml`
- **需求**: 
  - 提供"使用微信昵称"选项（调用 `wx.getUserProfile`）
  - 提供"自定义昵称"选项（手动输入）
- **实现**: 编辑资料弹窗中添加两个按钮选项

#### 2.3 邀请码展示
- **文件**: `pages/profile/profile.js`, `pages/profile/profile.wxml`
- **需求**: 在个人中心显示当前用户的邀请码，方便分享给伴侣
- **实现**: 在用户信息卡片下方添加邀请码展示区域，支持一键复制

---

### Phase 3: 关系系统重构（核心改造）

#### 3.1 数据库结构改造
- **文件**: `database/init.js`（更新文档）
- **新集合/字段**:
  ```
  users 集合新增字段:
  - relationships: array  // 关系列表
    [{ partnerId, type, status, createdAt, unbindRequestAt }]
  - activeRelationship: string  // 当前激活的关系partnerId
  
  新集合 relationships:
  - userAId, userBId
  - type: 'couple' | 'bestie' | 'family' | 'custom'
  - status: 'active' | 'pending_unbind' | 'unbound'
  - createdAt, unbindRequestAt, unbindApprovedAt
  - sharedDataCleared: boolean
  ```

#### 3.2 关系类型支持
- **文件**: `cloudfunctions/login/index.js`, `pages/profile/profile.js`
- **需求**: 支持多种亲密关系类型
  - 情侣 (couple)
  - 闺蜜/兄弟 (bestie)
  - 家人 (family)
  - 自定义 (custom)
- **实现**: 绑定伴侣时选择关系类型

#### 3.3 解除关系机制
- **文件**: `cloudfunctions/login/index.js`（新增 unbind 操作）, `pages/profile/profile.js`
- **需求**:
  - 一方提出解除，需另一方确认
  - 若30天内无响应，自动解除
  - 解除后双方共同数据全部清除
- **实现**:
  - 添加 `requestUnbind` 云函数操作
  - 添加 `confirmUnbind` 云函数操作
  - 添加定时云函数检查超期未确认的解绑请求
  - 解绑时清除 shared 类型的心愿、共同纪念日等数据

#### 3.4 多关系管理
- **文件**: `pages/profile/profile.js`, `pages/profile/profile.wxml`
- **需求**: 一个用户可以有多个亲密关系（1个伴侣 + N个闺蜜/家人）
- **实现**:
  - 关系列表展示
  - 添加新关系（输入邀请码 + 选择关系类型）
  - 切换当前查看的关系

---

### Phase 4: 数据权限改造

#### 4.1 纪念日数据共享
- **文件**: `cloudfunctions/login/index.js`（或新建 anniversaries 云函数）, `pages/index/index.js`
- **需求**: 关系双方的纪念日互相可见
- **实现**: 查询时同时查询自己和 partner 的纪念日

#### 4.2 甜蜜时刻可见性
- **文件**: `cloudfunctions/moments/index.js`
- **需求**: 仅关系双方可见彼此的甜蜜时刻
- **实现**: getList 时只返回自己和 partner 发布的动态

#### 4.3 心愿清单共享
- **文件**: `cloudfunctions/wishes/index.js`
- **需求**: 
  - 个人心愿仅自己可见
  - 共同心愿双方可见且可完成
- **实现**: 已完成，需验证权限逻辑

---

## 实施优先级

| 优先级 | 阶段 | 说明 |
|--------|------|------|
| P0 | Phase 1 | 云环境配置是前提，必须先解决 |
| P1 | Phase 2 | 基础功能完善，提升用户体验 |
| P2 | Phase 4 | 数据权限，确保隐私安全 |
| P3 | Phase 3 | 关系系统重构，核心差异化功能 |

---

## 关键文件清单

### 需要修改的文件

| 文件路径 | 修改内容 |
|----------|----------|
| `app.js` | 云环境ID、登录状态管理 |
| `project.config.json` | 云环境配置 |
| `pages/index/index.js` | 登录检查、null安全、纪念日标题自定义 |
| `pages/index/index.wxml` | 纪念日弹窗添加自定义标题 |
| `pages/profile/profile.js` | 编辑资料修复、昵称选项、邀请码展示、关系管理 |
| `pages/profile/profile.wxml` | 新增关系管理UI、邀请码展示、昵称选择 |
| `cloudfunctions/login/index.js` | 关系数据结构、邀请码、解绑逻辑 |
| `cloudfunctions/moments/index.js` | 权限控制（仅关系双方可见） |
| `cloudfunctions/wishes/index.js` | 权限验证 |
| `database/init.js` | 更新数据库结构文档 |

### 新增文件

| 文件路径 | 说明 |
|----------|------|
| `cloudfunctions/relationships/index.js` | 关系管理云函数（新建） |
| `cloudfunctions/unbindChecker/` | 定时检查解绑请求的云函数 |

---

## 技术实现要点

### 1. 云环境配置修复
```javascript
// app.js
wx.cloud.init({
  env: 'cloud1-d3glxwciI0275ec8b',
  traceUser: true,
});
```

### 2. 登录状态管理
```javascript
// 每个页面 onShow 时检查登录状态
onShow() {
  if (!app.globalData.userInfo) {
    this.login();
  }
}
```

### 3. 关系数据结构
```javascript
// users 集合中的 relationships 字段
relationships: [
  {
    partnerId: '对方的openid',
    type: 'couple', // couple | bestie | family | custom
    status: 'active', // active | pending_unbind | unbound
    createdAt: Date,
    unbindRequestAt: Date, // 解绑申请时间
    unbindRequestBy: 'openid' // 谁发起的解绑
  }
]
```

### 4. 解绑流程
```
用户A发起解绑 → status变为pending_unbind → 通知用户B
  → 用户B确认 → 立即解绑，清除共享数据
  → 用户B拒绝 → status恢复active
  → 30天无响应 → 自动解绑，清除共享数据
```

---

## 风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 云环境ID不确定 | 所有功能无法使用 | 已确认环境ID |
| 数据库结构变更 | 已有数据可能不兼容 | 编写数据迁移脚本 |
| 解绑数据清除 | 误操作导致数据丢失 | 添加二次确认、数据备份 |
| 多关系复杂度 | 代码复杂度增加 | 模块化设计、充分测试 |

---

## 实施记录

### Phase 1: 基础修复
- [ ] 1.1 修复云环境配置
- [ ] 1.2 修复登录流程
- [ ] 1.3 修复编辑资料崩溃

### Phase 2: 功能完善
- [ ] 2.1 纪念日自定义标题
- [ ] 2.2 昵称设置优化
- [ ] 2.3 邀请码展示

### Phase 3: 关系系统重构
- [ ] 3.1 数据库结构改造
- [ ] 3.2 关系类型支持
- [ ] 3.3 解除关系机制
- [ ] 3.4 多关系管理

### Phase 4: 数据权限改造
- [ ] 4.1 纪念日数据共享
- [ ] 4.2 甜蜜时刻可见性
- [ ] 4.3 心愿清单共享

---

*计划生成时间: 2026-05-15*
*云环境ID: cloud1-d3glxwciI0275ec8b*
