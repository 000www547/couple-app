/**
 * 数据库初始化脚本
 *
 * 使用方法：
 * 1. 在微信开发者工具中打开云开发控制台
 * 2. 创建以下集合（Collections）：
 *    - users
 *    - anniversaries
 *    - moments
 *    - wishes
 * 3. 部署云函数（在 cloudfunctions 目录上右键 -> 上传并部署）
 */

// 数据库集合说明
/**
 * users - 用户表
 * --------------------------------------------------
 * _id: 自动生成
 * _openid: 自动生成（微信云开发提供）
 * nickname: 昵称
 * avatar: 头像URL
 * role: 角色 (boyfriend/girlfriend) - 旧字段，兼容用
 * partnerId: 另一半的openid - 旧字段，兼容用
 * birthday: 生日
 * anniversaryDate: 在一起的日期
 * inviteCode: 邀请码
 * createTime: 创建时间
 *
 * === 新增字段 (关系系统) ===
 * relationships: array - 关系列表
 *   [{
 *     partnerId: string,        // 关系对象openid
 *     partnerName: string,      // 关系对象昵称
 *     type: string,            // 关系类型: couple/bestie/family/custom
 *     typeName: string,        // 关系类型名称
 *     status: string,          // 状态: active/pending_unbind/unbound
 *     createdAt: Date,         // 创建时间
 *     unbindRequestAt: Date,   // 解绑申请时间
 *     unbindRequestBy: string  // 解绑发起人openid
 *   }]
 * activeRelationship: string - 当前激活的关系partnerId
 *
 * anniversaries - 纪念日表
 * --------------------------------------------------
 * _id: 自动生成
 * userId: 所属用户openid
 * title: 标题
 * date: 日期
 * type: 类型 (start/birthday/custom)
 * createTime: 创建时间
 *
 * moments - 甜蜜时刻表
 * --------------------------------------------------
 * _id: 自动生成
 * userId: 发布者openid
 * content: 文字内容
 * images: 图片URL数组
 * likes: 点赞数
 * likedBy: 点赞用户openid数组
 * createTime: 创建时间
 *
 * wishes - 心愿清单表
 * --------------------------------------------------
 * _id: 自动生成
 * userId: 所属用户openid
 * title: 心愿标题
 * description: 描述
 * isCompleted: 是否完成
 * completedBy: 完成者openid
 * completedTime: 完成时间
 * isShared: 是否为共同心愿
 * createTime: 创建时间
 */

// 初始化索引（根据需要创建）
/*
db.collection('anniversaries').createIndex({
  name: 'userIdIndex',
  fields: [{ fieldName: 'userId', order: 'asc' }]
});

db.collection('moments').createIndex({
  name: 'createTimeIndex',
  fields: [{ fieldName: 'createTime', order: 'desc' }]
});

db.collection('wishes').createIndex({
  name: 'userIdIndex',
  fields: [{ fieldName: 'userId', order: 'asc' }]
});
*/

console.log('请在微信开发者工具云开发控制台中手动创建以下集合：');
console.log('1. users - 用户表');
console.log('2. anniversaries - 纪念日表');
console.log('3. moments - 甜蜜时刻表');
console.log('4. wishes - 心愿清单表');

/**
 * 关系系统说明
 *
 * 支持多种关系类型：
 * - couple: 情侣
 * - bestie: 闺蜜/兄弟
 * - family: 家人
 * - custom: 自定义
 *
 * 解绑流程：
 * 1. 用户A发起解绑 → status变为pending_unbind
 * 2. 用户B收到通知，可选择：
 *    - 确认解除 → 立即解绑，清除共享数据
 *    - 无响应 → 30天后自动解除
 *    - 取消解绑 → 恢复active状态
 *
 * 数据权限：
 * - 纪念日：双方可互相查看
 * - 甜蜜时刻：仅关系双方可见
 * - 心愿清单：个人心愿仅自己可见，共同心愿双方可见
 */
