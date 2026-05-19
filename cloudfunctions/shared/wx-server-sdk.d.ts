/**
 * @fileoverview wx-server-sdk 类型声明
 * 为微信云函数 SDK 提供基础类型支持
 */

declare module 'wx-server-sdk' {
  interface ICloudInitConfig {
    env?: string | { database?: string; storage?: string; functions?: string };
  }

  interface WXContext {
    OPENID: string;
    APPID: string;
    UNIONID?: string;
  }

  interface DatabaseCommand {
    in(values: any[]): any;
    or(...conditions: any[]): any;
    inc(delta: number): any;
    push(values: any): any;
    pull(values: any): any;
    set(value: any): any;
    remove(): any;
    eq(value: any): any;
    neq(value: any): any;
    gt(value: any): any;
    gte(value: any): any;
    lt(value: any): any;
    lte(value: any): any;
  }

  interface DatabaseCollection {
    doc(id: string): any;
    where(condition: any): any;
    orderBy(field: string, order: 'asc' | 'desc'): any;
    limit(max: number): any;
    skip(n: number): any;
    field(projection: any): any;
    count(): Promise<{ total: number }>;
    get(): Promise<{ data: any[] }>;
    add(params: { data: any }): Promise<{ _id: string }>;
    update(params: { data: any }): Promise<{ updated: number }>;
    remove(): Promise<{ removed: number }>;
  }

  interface Database {
    collection(name: string): DatabaseCollection;
    serverDate(): Date;
    command: DatabaseCommand;
  }

  interface CloudInstance {
    init(config?: ICloudInitConfig): void;
    DYNAMIC_CURRENT_ENV: string;
    database(): Database;
    getWXContext(): WXContext;
    getTempFileURL(params: { fileList: string[] }): Promise<{
      fileList: Array<{ fileID: string; tempFileURL?: string; status?: number; errorMessage?: string }>;
    }>;
  }

  const cloud: CloudInstance;
  export = cloud;
}

// 全局 console 类型补充（Node.js 环境）
declare var console: {
  log(...args: any[]): void;
  error(...args: any[]): void;
  warn(...args: any[]): void;
  info(...args: any[]): void;
};
