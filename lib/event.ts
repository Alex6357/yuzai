import Bot from "yuzai/bot";
import { getLogger } from "yuzai/logger";
import Message, { MessageBuilder } from "yuzai/message";
import { PlatformInfo } from "yuzai/types";
import type { TargetGroup } from "yuzai/types";

abstract class BaseEvent {
  protected _bot: Bot;
  get bot() {
    return this._bot;
  }

  constructor(bot: Bot) {
    this._bot = bot;
  }

  async sendToMaster(message: Message | string) {
    await Promise.allSettled(
      this.bot.masters.map((master) => {
        return this.bot.sendMessage(message, { userID: master });
      }),
    );
  }
}

class ConnectEvent extends BaseEvent {}

class MessageEvent extends BaseEvent {
  protected _message: Message;
  get message() {
    return this._message;
  }

  get type() {
    return this.message.messageType;
  }

  constructor(bot: Bot, message: Message) {
    super(bot);
    this._message = message;
  }

  /**
   * 回复当前消息
   * @param message 要发送的消息
   * @param quote 是否引用回复
   * @param recallMsg 群聊是否撤回消息，0-120秒，0不撤回
   * @param at 是否at用户
   */
  async reply(message: Message | string, quote = false, recallMsg = 0, at = false) {
    const logger = getLogger(this.bot.nickname);

    if (!this.message.senderID) {
      logger.error("消息用户 ID 为空，无法回复");
      return undefined;
    }

    const messageBuilder = new MessageBuilder();

    if (typeof message === "string") {
      messageBuilder.addTextBlock(message);
    } else {
      messageBuilder.fromMessage(message);
    }

    if (quote) {
      if (!this.message.messageID) logger.error("引用回复消息 ID 为空，引用回复功能无法使用");
      else messageBuilder.addQuoteBlock(this.message.messageID);
    }
    if (at) {
      messageBuilder.addAtBlock(this.message.senderID);
    }

    message = messageBuilder.build();
    let messageID: string | undefined;

    switch (this.message.messageType) {
      case "group":
        messageID = await this.bot?.adapter?.sendGroupMessage?.(
          message,
          (this.message.target as TargetGroup).groupID,
        );
        break;
      case "private":
        messageID = await this.bot?.adapter?.sendPrivateMessage(message, this.message.senderID);
    } // TODO 其他消息类型

    if (recallMsg > 0 && messageID) {
      if (this.bot?.adapter?.recallMessage) {
        setTimeout(async () => {
          await this.bot?.adapter?.recallMessage?.(messageID);
        }, recallMsg * 1000);
      } else {
        logger.warn("适配器不支持撤回消息");
      }
    }
  }
}

class NoticeEvent<NoticeEventID extends NoticeEventIDs | string> extends BaseEvent {
  protected _type: NoticeEventID;
  get type() {
    return this._type;
  }

  protected _data: NoticeEventData<NoticeEventID>;
  get data() {
    return this._data;
  }

  protected _platfrom?: PlatformInfo;
  get platform() {
    return this._platfrom;
  }

  constructor(
    bot: Bot,
    noticeType: NoticeEventID,
    data: NoticeEventData<NoticeEventID>,
    platformInfo?: PlatformInfo,
  ) {
    super(bot);
    this._type = noticeType;
    this._data = data;
    if (platformInfo) {
      this._platfrom = platformInfo;
    }
  }
}

interface FriendRequestData {
  timestamp: number;
  requesterID: string;
  message: string;
}

interface GroupRequestData {
  timestamp: number;
  requesterID: string;
  message: string;
  groupID: string;
}

interface GroupJoinData {
  timestamp: number;
  groupID: string;
  userID: string;
}

interface GroupLeaveData {
  timestamp: number;
  groupID: string;
  userID: string;
}

interface NoticeEventDataMap {
  "notice.friend.request": FriendRequestData;
  "notice.group.request": GroupRequestData;
  "notice.group.member_join": GroupJoinData;
  "notice.group.member_leave": GroupLeaveData;
}

type NoticeEventData<T extends NoticeEventIDs | string> = T extends keyof NoticeEventDataMap
  ? NoticeEventDataMap[T]
  : Record<string, unknown>;

type Event = BaseEvent | ConnectEvent | MessageEvent | NoticeEvent<NoticeEventIDs>;

type MessageEventIDs = "message" | "message.private" | "message.group" | "message.guild";

type NoticeEventIDs =
  | "notice.friend.request"
  | "notice.group.request"
  | "notice.group.member_join"
  | "notice.group.member_leave";
// | "notice.friend.accept"
// | "notice.friend.reject"
// | "notice.group.admin"
// | "notice.group.notice"
// | "notice.group.upload"
// | "notice.group.member.card"
// | "notice.group.member.permission"
// | "notice.group.member.mute"
// | "notice.guild.member.join"
// | "notice.guild.member.leave"
// | "notice.guild.member.mute"
// | "notice.guild.member.unmute"
// | "notice.guild.member.role"
// | "notice.guild.bot.join"
// | "notice.guild.bot.leave";

type EventIDs = "connect" | "schedule" | MessageEventIDs | NoticeEventIDs;

export { BaseEvent, ConnectEvent, MessageEvent, NoticeEvent };
export type { Event, EventIDs, MessageEventIDs, NoticeEventIDs, NoticeEventData };
