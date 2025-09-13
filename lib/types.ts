/**
 * @file 类型定义
 * @interface TypeWithPlatform 可能携带平台信息的基础接口
 *
 * @interface Sender 信息发送者，包含发送者 ID
 *
 * @interface TargetUser 私聊信息接收者，包含接收者 ID，`type = "person"`
 * @interface TargetGroup 群聊信息接收者，包含接收群 ID，`type = "group"`
 * @interface TargetGuild 频道信息接收者，包含接收频道 ID 和子频道 ID，`type = "guild"`
 * @interface Target 信息接收者，可能是私聊、群聊或频道
 *
 * @interface InfoUserPersonal 好友信息，`type = "person"`
 * @interface InfoUserGroup 群成员信息，`type = "group"`
 * @interface InfoUserGuild 频道成员信息， `type = "guild"`
 * @interface InfoUser 用户信息，可能是个人、群成员或频道成员
 *
 * @interface InfoGroup 群信息
 * @interface InfoGuild 频道信息
 * @interface InfoChannel 频道子频道信息
 */

/** 可能携带平台信息的基础接口 */
export interface TypeWithPlatform {
  /** 平台信息 */
  readonly platform?: Readonly<
    Record<string, Readonly<Record<string, string | number | object>> | string>
  >;
  /*
  readonly platform?: {
    readonly [id: string]:
      | {
          readonly [key: string]: string | number | object;
        }
      | string;
  };
  */
}

/** 携带平台信息的类 */
export class PlatformInfo {
  /** 平台信息 */
  protected _platformInfo?: Record<string, Record<string, string | number | unknown>>;
  [key: string]: string | number | unknown;

  constructor(platformInfo?: Record<string, Record<string, string | number | unknown>>) {
    this._platformInfo = platformInfo;

    return new Proxy(this, {
      get(target, prop) {
        if (prop in target) {
          return target[prop as keyof typeof target];
        }
        for (const platformKey in target._platformInfo) {
          const platformData = target._platformInfo[platformKey];
          if (platformData && prop in platformData) {
            return platformData[prop as keyof typeof platformData];
          }
        }
        return undefined;
      },
    });
  }
}

/** 信息发送者 */
export interface Sender extends TypeWithPlatform {
  /** 发送者 ID */
  readonly userID: string;
}

/** 私聊信息接收者 */
export interface TargetUser extends TypeWithPlatform {
  /** 接收者类型 */
  readonly type: "person";
  /** 接收者 ID */
  readonly userID: string;
}

/** 群聊信息接收者 */
export interface TargetGroup extends TypeWithPlatform {
  /** 接收者类型 */
  readonly type: "group";
  /** 接收群 ID */
  readonly groupID: string;
}

/** 频道信息接收者 */
export interface TargetGuild extends TypeWithPlatform {
  /** 接收者类型 */
  readonly type: "guild";
  /** 接收频道 ID */
  readonly guildID: string;
  /** 接收子频道 ID */
  readonly channelID: string;
}

/** 信息接收者 */
export type Target = TargetUser | TargetGroup | TargetGuild;

/** 好友信息 */
export interface InfoUserPersonal extends TypeWithPlatform {
  readonly type: "person";
  readonly userID: string;
  readonly userName?: string;
  readonly remark?: string;
  readonly age?: number;
  readonly sex?: "male" | "female" | "secret";
  // readonly area?: string;
}

/** 群成员信息 */
export interface InfoUserGroup extends TypeWithPlatform {
  readonly type: "group";
  readonly userID: string;
  readonly userName?: string;
  readonly nickname?: string;
  readonly sex?: "male" | "female" | "secret";
  readonly age?: number;
  // readonly area?: string;
  // readonly joinTime?: number;
  // readonly lastSentTime?: number;
  // readonly level?: string;
  // readonly role?: "owner" | "admin" | "member";
  // readonly unfriendly?: boolean;
  // readonly title?: string;
  // readonly titleExpireTime?: number;
  // readonly cardChangeable?: boolean;
}

/** 频道成员信息 */
export interface InfoUserGuild extends TypeWithPlatform {
  readonly type: "guild";
  readonly userID: string;
  readonly nickname?: string;
  // readonly card?: string;
  readonly sex?: "male" | "female" | "secret";
}

/** 用户信息 */
export type InfoUser = InfoUserPersonal | InfoUserGroup | InfoUserGuild;

/** 群信息 */
export interface InfoGroup extends TypeWithPlatform {
  readonly groupID: string;
  readonly groupName: string;
  readonly members: Map<string, InfoUserGroup>;
  readonly memberCount: number;
  readonly remark?: string;
  readonly maxMemberCount?: number;
}

/** 频道信息 */
export interface InfoGuild extends TypeWithPlatform {
  readonly guildID: string;
  readonly guildName: string;
  // readonly guildDisplayID: string;
  readonly members?: Map<string, InfoUserGuild>;
  readonly channels: Map<string, InfoChannel>;
}

export interface InfoChannel extends TypeWithPlatform {
  readonly channelID: string;
  readonly channelName: string;
}
