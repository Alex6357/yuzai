import { EventEmitter } from "events";

import Bot from "./bot.ts";
import Message from "./message.ts";
import type {
  InfoChannel,
  InfoGroup,
  InfoGuild,
  InfoUserGroup,
  InfoUserGuild,
  InfoUserPersonal,
} from "./types.ts";
import client from "./client.ts";

/** 定义一个适配器接口，用于描述不同消息平台的通用功能。 */
abstract class Adapter extends EventEmitter {
  /** 适配器的标识符 */
  static readonly id: string;

  /** 适配器的名称 */
  static readonly name: string;

  /** 适配器应用到的机器人 */
  _bot?: WeakRef<Bot>;
  /** 适配器应用到的机器人 */
  get bot() {
    return this._bot?.deref();
  }

  /**
   * 初始化适配器
   */
  // TODO 可以改返回类型
  static init(): Promise<void> {
    return Promise.resolve();
  }

  /**
   * 向 client 请求新建一个机器人和适配器实例
   * @param adapter - 适配器实例，应由适配器自行创建
   */
  static newBot(adapter: Adapter) {
    client.newBot(adapter);
  }

  /**
   * 绑定到机器人
   * @param bot - 要绑定的机器人实例
   */
  bind(bot: Bot) {
    this._bot = new WeakRef(bot);
  }

  // ==================== Bot 信息接口 ====================

  /**
   * 获取机器人 ID
   * @returns 如果成功返回机器人 ID，否则返回 undefined
   */
  abstract getID(): Promise<string | undefined>;

  /**
   * 获取机器人昵称
   * @returns 如果成功返回机器人昵称，否则返回 undefined
   */
  abstract getNickname(): Promise<string | undefined>;

  // ==================== 好友相关接口 ====================

  /**
   * 获取好友列表
   *
   * 此函数可以根据实现的速度自行决定返回仅包含昵称的简单信息还是包含详细信息的完整对象，
   * 要获取详细信息尽量使用 `getFriendInfo` 方法。
   *
   * @returns 好友列表，以用户 ID 为键，`InfoUserPersonal` 对象为值，失败返回 undefined
   */
  abstract getFriendList(): Promise<Map<string, InfoUserPersonal> | undefined>;

  /**
   * 获取好友信息
   * @param userID - 要获取信息的用户 ID
   * @returns 如果成功返回一个 `UserFriend` 对象，否则返回 undefined
   */
  abstract getFriendInfo(userID: string): Promise<InfoUserPersonal | undefined>;

  /**
   * 获取消息
   * @param messageID - 要获取的消息的 ID
   * @returns 如果成功返回一个 `Message`，否则返回 undefined
   */
  abstract getMessage(messageID: string): Promise<Message | undefined>;

  /**
   * 获取私聊消息记录
   * @param userID - 要获取消息记录的用户 ID
   * @param startMessageID - 起始消息 ID
   * @param count - 要获取的消息数量，默认为 20
   * @returns 消息记录数组，失败返回 undefined
   */
  // TODO 应该用装饰器？
  async getPrivateMessageHistoryWrapper(
    userID: string,
    startMessageID: string,
    count = 20,
  ): Promise<Message[] | undefined> {
    return await this.getPrivateMessageHistory(userID, startMessageID, count);
  }

  /**
   * 获取私聊消息记录
   * @param userID - 要获取消息记录的用户 ID
   * @param startMessageID - 起始消息 ID
   * @param count - 要获取的消息数量，默认为 20
   * @returns 消息记录数组，失败返回 undefined
   */
  abstract getPrivateMessageHistory(
    userID: string,
    startMessageID: string,
    count: number,
  ): Promise<Message[] | undefined>;

  /**
   * 发送消息
   * @param message - 要发送的消息
   * @param userID - 要发送的用户 ID
   * @returns 发送成功后返回消息 ID，否则返回 undefined
   */
  abstract sendPrivateMessage(message: Message, userID: string): Promise<string | undefined>;

  /**
   * 撤回指定 ID 的消息。
   * @param messageID - 要撤回的消息的 ID
   * @returns 如果撤回成功，返回 true；否则返回 false
   */
  abstract recallMessage?(messageID: string): Promise<boolean>;

  // ==================== 群聊相关接口 ====================

  /**
   * 获取群列表
   * @returns 群列表，以群 ID 为键，`Group` 对象为值
   */
  getGroupList?(): Promise<Map<string, InfoGroup> | undefined>;

  /**
   * 获取群信息
   * @param groupID - 要获取信息的群 ID
   * @returns 如果成功返回一个 `Group` 对象，否则返回 undefined
   */
  getGroupInfo?(groupID: string): Promise<InfoGroup | undefined>;

  /**
   * 获取群成员列表
   * @param groupID - 要获取成员列表的群 ID
   * @returns 群成员列表，以用户 ID 为键，`InfoUserGroup` 对象为值
   */
  getGroupMemberList?(groupID: string): Promise<Map<string, InfoUserGroup> | undefined>;

  /**
   * 获取群成员信息
   * @param groupID - 要获取信息的群 ID
   * @param userID - 要获取信息的用户 ID
   * @returns 如果成功返回一个 `InfoUserGroup` 对象，否则返回 undefined
   */
  getGroupMemberInfo?(groupID: string, userID: string): Promise<InfoUserGroup | undefined>;

  /**
   * 获取群消息记录
   * @param groupID - 要获取消息记录的群 ID
   * @param startMessageID - 起始消息 ID
   * @param count - 要获取的消息数量，默认为 20
   * @returns 消息记录数组，失败返回 undefined
   */
  async getGroupMessageHistoryWrapper(
    groupID: string,
    startMessageID: string,
    count = 20,
  ): Promise<Message[] | undefined> {
    return this.getGroupMessageHistory?.(groupID, startMessageID, count);
  }

  /**
   * 获取群消息记录
   * @param groupID - 要获取消息记录的群 ID
   * @param startMessageID - 起始消息 ID
   * @param count - 要获取的消息数量，默认为 20
   * @returns 消息记录数组，失败返回 undefined
   */
  async getGroupMessageHistory?(
    groupID: string,
    startMessageID: string,
    count: number,
  ): Promise<Message[] | undefined>;

  /**
   * 发送群消息
   * @param message - 要发送的消息
   * @param groupID - 要发送的群 ID
   * @returns 发送成功后返回消息 ID，否则返回 undefined
   */
  sendGroupMessage?(message: Message, groupID: string): Promise<string | undefined>;

  // 频道相关接口

  /**
   * 获取频道列表
   * @returns 频道列表，以频道 ID 为键，频道信息为值
   */
  getGuildList?(): Promise<Map<string, InfoGuild> | undefined>;

  /**
   * 获取频道信息
   * @param guildID - 要获取信息的频道 ID
   * @returns 如果成功返回一个包含频道信息的对象，否则返回 undefined
   */
  getGuildInfo?(guildID: string): Promise<InfoGuild | undefined>;

  /**
   * 获取频道成员列表
   * @param guildID - 要获取成员列表的频道 ID
   * @returns 频道成员列表，以用户 ID 为键，用户信息为值
   */
  getGuildMemberList?(guildID: string): Promise<Map<string, InfoUserGuild> | undefined>;

  /**
   * 获取频道成员信息
   * @param guildID - 要获取信息的频道 ID
   * @param userID - 要获取信息的用户 ID
   * @returns 如果成功返回一个包含用户信息的对象，否则返回 undefined
   */
  getGuildMemberInfo?(guildID: string, userID: string): Promise<InfoUserGuild | undefined>;

  /**
   * 获取频道子频道列表
   * @param guildID - 要获取子频道列表的频道 ID
   * @returns 频道子频道列表，以子频道 ID 为键，子频道信息为值
   */
  getChannelList?(guildID: string): Promise<Map<string, InfoChannel> | undefined>;
}

export default Adapter;
