import { randomUUID, type UUID } from "crypto";

import type WebSocket from "ws";

import Adapter from "yuzai/adapter";
import Message, {
  MessageBuilder,
  TextBlock,
  AtBlock,
  AtallBlock,
  FaceBlock,
  type MessageBlock,
} from "yuzai/message";
import logger from "yuzai/logger";
import { importExtension } from "yuzai/extensions";
import type * as Onebot11 from "yuzai/extensions/onebot_11_types";
import type {
  InfoChannel,
  InfoGroup,
  InfoGuild,
  InfoUserGroup,
  InfoUserGuild,
  InfoUserPersonal,
} from "yuzai/types";
import type Bot from "yuzai/bot";

const { default: WS } = await importExtension("ws");

export default class OneBotv11Adapter extends Adapter {
  readonly id = "onebotv11";
  readonly name = "OneBotv11";
  readonly path = "data/OneBotv11";
  /** 适配器的 WebSocket 实例 */
  _ws: WebSocket & { sendMessage: (data: object) => void };
  /** 适配器的 WebSocket 实例 */
  get ws() {
    return this._ws;
  }
  /** 用于存储请求 */
  requests = new Map<UUID, any>();
  /** 超时时间 */
  timeout = 60000;

  /**
   * 构造函数
   * @param ws WebSocket 实例
   * @param path 路径
   */
  constructor(ws: WebSocket & { sendMessage: (data: object) => void }) {
    super();
    this._ws = ws;
  }

  /**
   * 适配器初始化
   */
  static async init() {
    for (const path of ["OneBotv11", "go-cqhttp"]) {
      // 向 WS 注册路径
      WS.addPath(
        path,
        // 当 WebSocketServer 接收到对应路径的升级请求时触发回调
        (ws: WebSocket & { sendMessage: (data: object) => void }) => {
          // 创建适配器实例
          const adapter = new OneBotv11Adapter(ws);
          // 注册新机器人
          this.newBot(adapter);
          // 返回适配器处理消息的函数，在收到 WebSocket 消息时会调用
          return adapter.onWsMessage.bind(adapter);
        },
      );
    }
  }

  /**
   * 处理 WebSocket 消息
   * @param message WS 消息
   * @param ws WebSocket 实例
   */
  onWsMessage(message: WebSocket.RawData, ws: WebSocket) {
    // 解析消息
    let messageObject;
    try {
      messageObject = {
        ...JSON.parse(String(message)),
        raw: String(message),
      };
    } catch (err) {
      return logger.error(["解码数据失败", message, err]);
    }
    // 只是想用 const 变量的洁癖而已
    const event = messageObject as
      | Onebot11.Onebot11Event
      | Onebot11.GoCqhttpEvent
      | Onebot11.Onebot11Response;
    // 按类型调用对应的处理函数
    if ("post_type" in event) {
      switch (event.post_type) {
        case "meta_event":
          this.onMetaMessage(event, ws);
          break;
        case "message":
          this.onMessage(event);
          break;
        case "notice":
          this.onNotice(event);
          break;
        case "request":
          this.onRequest(event);
          break;
        case "message_sent":
          this.onMessage(event);
          break;
        default:
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 未知消息暂时用 any
          logger.warn(`未知消息：${logger.magenta((event as any).raw)}`, (event as any).self_id);
      }
    } else if (event.echo && this.requests.has(event.echo as UUID)) {
      // 收到的是请求的响应
      // TODO 这里的 resolve 过程也许还能再优化一下
      const requestID = event.echo as UUID;
      if (![0, 1].includes(event.retcode)) {
        this.requests
          ?.get(requestID)
          .reject(Object.assign({ error: event }, this.requests.get(requestID).request));
      } else {
        this.requests.get(requestID).resolve(
          event.data
            ? new Proxy(event, {
                get: (target, prop) => {
                  if (typeof prop === "string") {
                    return target.data[prop] ?? (target as any)[prop];
                  }
                  return (target as any)[prop];
                },
              })
            : event,
        );
      }
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 未知消息暂时用 any
      logger.warn(`未知消息：${logger.magenta((event as any).raw)}`, (event as any).self_id);
    }
  }

  /**
   * 处理元事件消息
   * @param event 元事件消息
   * @param ws WebSocket 实例
   */
  onMetaMessage(event: Onebot11.Onebot11MetaEvent, ws: WebSocket) {
    switch (event.meta_event_type) {
      case "heartbeat":
        this.heartbeat(event);
        break;
      case "lifecycle":
        this.connect(event, ws);
        break;
      default:
        logger.warn(`未知消息：${logger.magenta((event as any).raw)}`, (event as any).self_id);
    }
  }

  /**
   * 处理心跳事件
   * @param event 心跳事件
   */
  heartbeat(event: Onebot11.Onebot11HeartbeatEvent) {
    if (event.status)
      // TODO message.bot.stat 谁在用？
      Object.assign(event, { bot: { stat: event.status } });
  }

  /**
   * 处理连接事件
   * @param event 连接事件
   * @param ws WebSocket 实例
   */
  connect(event: Onebot11.Onebot11LifecycleEvent, _ws: WebSocket) {
    if (event.sub_type === "connect") {
      this.bot?.onConnect();
    }
  }

  /**
   * 处理消息事件
   * @param event 消息事件
   */
  async onMessage(
    event:
      | Onebot11.Onebot11MessageEvent
      | Onebot11.GoCqhttpMessageEvent
      | Onebot11.GoCqhttpMessageSentEvent
      | Onebot11.LagrangeMessageEvent,
  ) {
    // 初始化一部分参数
    const messageBuilder = new MessageBuilder();
    messageBuilder.botUUID = (this.bot as Bot).UUID;
    messageBuilder.senderID = event.user_id.toString();
    messageBuilder.messageID = event.message_id.toString();
    messageBuilder.sendTimestampMs = event.time;

    // 按类型处理 messageType 和 target
    switch (event.message_type) {
      case "person":
      case "private": {
        switch (event.sub_type) {
          case "friend":
            messageBuilder.messageType = "private";
            break;
          case "group":
            messageBuilder.messageType = "groupPrivate";
            break;
          case "group_self":
            messageBuilder.messageType = "groupPrivate";
            break;
          case "other":
            messageBuilder.messageType = "private";
            break;
          default:
            logger.warn(`未知消息：${logger.magenta((event as any).raw)}`, (event as any).self_id);
            messageBuilder.messageType = "private";
        }

        messageBuilder.target = {
          type: "person",
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion,@typescript-eslint/no-non-null-asserted-optional-chain -- 按理说 bot 一定有 ID
          userID: this.bot?.id!,
        };

        const name =
          event.sender.nickname || this.bot?.friendList.get(event.user_id.toString())?.userName;
        logger.info(
          `好友消息：${name ? `[${name}] ` : ""}${event.raw_message}`,
          `${event.self_id} <= ${event.user_id}`,
          true,
        );
        break;
      }
      case "group": {
        messageBuilder.messageType = "group";
        messageBuilder.target = {
          type: "group",
          groupID: event.group_id.toString(),
        };

        // 匿名消息应添加到 platfrom 信息中
        switch (event.sub_type) {
          case "anonymous":
            (messageBuilder.platform.qq as { isAnonymous: boolean }).isAnonymous = true;
            break;
          case "normal":
            // messageBuilder.platform.qq.isAnonymous = false;
            break;
        }

        const group_name = // event.group_name || // QUEST 有实现用的 group_name 吗
          this.bot?.groupList.get(event.group_id.toString())?.groupName;

        let user_name = event.sender.card || event.sender.nickname;
        if (!user_name) {
          const userInfo = this.bot?.groupList
            .get(event.group_id.toString())
            ?.members.get(event.user_id.toString());
          if (userInfo) user_name = userInfo?.nickname || userInfo?.userName;
        }

        logger.info(
          `群消息：${user_name ? `[${group_name ? `${group_name}, ` : ""}${user_name}] ` : ""}${event.raw_message}`,
          `${event.self_id} <= ${event.group_id}, ${event.user_id}`,
          true,
        );
        break;
      }
      case "guild": {
        messageBuilder.messageType = "guild";
        messageBuilder.target = {
          type: "guild",
          guildID: event.guild_id.toString(),
          channelID: event.channel_id.toString(),
        };

        logger.info(
          `频道消息：[${event.sender.nickname}] ${String(event.message)}`,
          `${event.self_id} <= ${event.guild_id}-${event.channel_id}, ${event.user_id}`,
          true,
        );
        break;
      }
      default:
        logger.warn(`未知消息：${logger.magenta((event as any).raw)}`, (event as any).self_id);
    }

    // 解析消息内容
    messageBuilder.messageBlocks = this.onebot11MessageToMessageBlocks(event.message);

    // 向 bot 发送消息
    this.bot?.onMessage(messageBuilder.build());
  }

  /**
   * 处理通知事件
   * @param event 通知事件
   */
  async onNotice(event: Onebot11.Onebot11NoticeEvent | Onebot11.GoCqhttpNoticeEvent) {
    switch (event.notice_type) {
      case "friend_recall":
        logger.info(
          `好友消息撤回：${event.message_id}`,
          `${event.self_id} <= ${event.user_id}`,
          true,
        );
        break;
      case "group_recall":
        logger.info(
          `群消息撤回：${event.operator_id} => ${event.user_id} ${event.message_id}`,
          `${event.self_id} <= ${event.group_id}`,
          true,
        );
        break;
      case "group_increase": {
        logger.info(
          `群成员增加：${event.operator_id} => ${event.user_id} ${event.sub_type}`,
          `${event.self_id} <= ${event.group_id}`,
          true,
        );
        this.bot?.updateGroupList();
        if (event.user_id === event.self_id)
          this.bot?.updateGroupMemberList(event.group_id.toString());
        else this.bot?.updateGroupMemberInfo(event.group_id.toString(), event.user_id.toString());
        break;
      }
      case "group_decrease": {
        logger.info(
          `群成员减少：${event.operator_id} => ${event.user_id} ${event.sub_type}`,
          `${event.self_id} <= ${event.group_id}`,
          true,
        );
        if (event.user_id === event.self_id) {
          this.bot?.groupList.delete(event.group_id.toString());
        } else {
          this.bot?.groupList
            .get(event.group_id.toString())
            ?.members.delete(event.user_id.toString());
        }
        break;
      }
      case "group_admin":
        logger.info(
          `群管理员变动：${event.sub_type}`,
          `${event.self_id} <= ${event.group_id}, ${event.user_id}`,
          true,
        );
        this.bot?.updateGroupMemberInfo(event.group_id.toString(), event.user_id.toString());
        break;
      case "group_upload":
        logger.info(
          `群文件上传：${String(event.file)}`,
          `${event.self_id} <= ${event.group_id}, ${event.user_id}`,
          true,
        );
        {
          const messageBuilder = new MessageBuilder();
          messageBuilder.messageType = "group";
          messageBuilder.addFileBlock(event.file.name, {
            id: event.file.id,
            size: event.file.size,
            urlResolver: async (_block) => {
              return (
                await this.sendApi("get_group_file_url", {
                  group_id: event.group_id,
                  file_id: event.file.id,
                  busid: event.file.busid,
                })
              )?.data.url as string;
            },
          });
          messageBuilder.target = {
            type: "group",
            groupID: event.group_id.toString(),
          };
          messageBuilder.senderID = event.user_id.toString();
          messageBuilder.botUUID = (this.bot as Bot).UUID;
          messageBuilder.messageID = event.file.id;
          this.bot?.onMessage(messageBuilder.build());
        }
        break;
      case "group_ban":
        logger.info(
          `群禁言：${event.operator_id} => ${event.user_id} ${event.sub_type} ${event.duration}秒`,
          `${event.self_id} <= ${event.group_id}`,
          true,
        );
        this.bot?.updateGroupMemberInfo(event.group_id.toString(), event.user_id.toString());
        break;
      case "friend_add":
        logger.info("好友添加", `${event.self_id} <= ${event.user_id}`, true);
        this.bot?.updateFriendInfo(event.user_id.toString());
        break;
      case "notify":
        switch (event.sub_type) {
          case "poke":
            if ("group_id" in event)
              logger.info(
                `群戳一戳：${event.user_id} => ${event.target_id}`,
                `${event.self_id} <= ${event.group_id}`,
                true,
              );
            else
              logger.info(
                `好友戳一戳：${event.sender_id} => ${event.target_id}`,
                String(event.self_id),
              );
            break;
          case "honor":
            logger.info(
              `群荣誉：${event.honor_type}`,
              `${event.self_id} <= ${event.group_id}, ${event.user_id}`,
              true,
            );
            this.bot?.updateGroupMemberInfo(event.group_id.toString(), event.user_id.toString());
            break;
          case "title":
            logger.info(
              `群头衔：${event.title}`,
              `${event.self_id} <= ${event.group_id}, ${event.user_id}`,
              true,
            );
            this.bot?.updateGroupMemberInfo(event.group_id.toString(), event.user_id.toString());
            break;
          case "lucky_king":
            logger.info(
              `群红包运气王：${event.user_id}`,
              `${event.self_id} <= ${event.group_id}`,
              true,
            );
            break;
          default:
            logger.warn(
              `未知通知：${logger.magenta((event as any).raw)}`,
              String((event as any).self_id),
            );
        }
        break;
      case "group_card":
        logger.info(
          `群名片更新：${event.card_old} => ${event.card_new}`,
          `${event.self_id} <= ${event.group_id}, ${event.user_id}`,
          true,
        );
        this.bot?.updateGroupMemberInfo(event.group_id.toString(), event.user_id.toString());
        break;
      case "offline_file":
        logger.info(
          `离线文件：${String(event.file)}`,
          `${event.self_id} <= ${event.user_id}`,
          true,
        );
        {
          const messageBuilder = new MessageBuilder();
          messageBuilder.messageType = "private";
          messageBuilder.addFileBlock(event.file.name, {
            size: event.file.size,
            url: event.file.url,
          });
          messageBuilder.target = {
            type: "person",
            userID: event.self_id.toString(),
          };
          messageBuilder.senderID = event.user_id.toString();
          messageBuilder.botUUID = (this.bot as Bot).UUID;
          this.bot?.onMessage(messageBuilder.build());
        }
        break;
      case "client_status":
        logger.info(
          `客户端${event.online ? "上线" : "下线"}：${String(event.client)}`,
          await this.getID(),
        );
        if (this.bot)
          (this.bot.platform.qq as { clients: unknown }).clients = (
            await this.sendApi("get_online_clients")
          )?.data.clients;
        break;
      case "essence":
        logger.info(
          `群精华消息：${event.operator_id} => ${event.sender_id} ${event.sub_type} ${event.message_id}`,
          `${event.self_id} <= ${event.group_id}`,
          true,
        );
        break;
      // case "guild_channel_recall":
      //   logger.info(
      //     `频道消息撤回：${event.operator_id} => ${event.user_id} ${event.message_id}`,
      //     `${event.self_id} <= ${event.guild_id}-${event.channel_id}`,
      //     true
      //   );
      //   break;
      case "message_reactions_updated":
        logger.info(
          `频道消息表情贴：${event.message_id} ${String(event.current_reactions)}`,
          `${event.self_id} <= ${event.guild_id}-${event.channel_id}, ${event.user_id}`,
          true,
        );
        break;
      case "channel_updated":
        logger.info(
          `子频道更新：${String(event.old_info)} => ${String(event.new_info)}`,
          `${event.self_id} <= ${event.guild_id}-${event.channel_id}, ${event.user_id}`,
          true,
        );
        break;
      case "channel_created":
        logger.info(
          `子频道创建：${String(event.channel_info)}`,
          `${event.self_id} <= ${event.guild_id}-${event.channel_id}, ${event.user_id}`,
          true,
        );
        this.bot?.getChannelList(event.guild_id);
        break;
      case "channel_destroyed":
        logger.info(
          `子频道删除：${String(event.channel_info)}`,
          `${event.self_id} <= ${event.guild_id}-${event.channel_id}, ${event.user_id}`,
          true,
        );
        this.bot?.getChannelList(event.guild_id);
        break;
      default:
        logger.warn(`未知通知：${logger.magenta((event as any).raw)}`, (event as any).self_id);
    }
  }

  onRequest(event: Onebot11.Onebot11RequestEvent) {
    switch (event.request_type) {
      case "person":
        logger.info(
          `加好友请求：${event.comment}(${event.flag})`,
          `${event.self_id} <= ${event.user_id}`,
          true,
        );
        this.bot?.onNotice(
          "notice.friend.request",
          { timestamp: event.time, requesterID: event.user_id.toString(), message: event.comment },
          { qq: { flag: event.flag } },
        );
        break;
      case "group":
        logger.info(
          `加群请求：${event.sub_type} ${event.comment}(${event.flag})`,
          `${event.self_id} <= ${event.group_id}, ${event.user_id}`,
          true,
        );
        this.bot?.onNotice(
          "notice.group.request",
          {
            timestamp: event.time,
            requesterID: event.user_id.toString(),
            groupID: event.group_id.toString(),
            message: event.comment,
          },
          { qq: { flag: event.flag, subType: event.sub_type } },
        );
        break;
      default:
        logger.warn(`未知请求：${logger.magenta((event as any).raw)}`, (event as any).self_id);
    }
  }

  onebot11MessageToMessageBlocks(message: Onebot11.Onebot11Message) {
    const messageBlocks: MessageBlock[] = [];
    if (typeof message === "string") {
    } else {
      for (const messageSegment of message) {
        switch (messageSegment.type) {
          case "text":
            messageBlocks.push(new TextBlock(messageSegment.data.text));
            break;
          case "at":
            if (messageSegment.data.qq === "all") messageBlocks.push(new AtallBlock());
            else messageBlocks.push(new AtBlock(messageSegment.data.qq.toString()));
            break;
          case "face":
            messageBlocks.push(new FaceBlock(messageSegment.data.id.toString()));
            break;
        }
      }
    }
    return messageBlocks;
  }

  messageToOnebot11Message(message: Message): Onebot11.Onebot11MessageSegment[] {
    // TODO 待完成
    const messages: Onebot11.Onebot11MessageSegment[] = [];
    message.messageBlocks.map((i) => {
      switch (i.type) {
        case "text":
          messages.push({ type: "text", data: { text: i.text } });
          break;
        case "atall":
          messages.push({ type: "at", data: { qq: "all" } });
          break;
        case "at":
          messages.push({ type: "at", data: { qq: Number(i.targetUserID) } });
          break;
        case "face":
          messages.push({ type: "face", data: { id: Number(i.faceID) } });
          break;
        case "image":
          messages.push({ type: "image", data: { file: i.id as any } });
          break;
        case "file":
          // 上传文件需要单独处理
          break;
      }
    });
    return messages;
  }

  makeLog(message: Message) {
    return message.toString().replace(/base64:\/\/.*?(,|]|")/g, "base64://...$1");
  }

  // 原代码在 sendApi 中使用了 echo 存储请求信息，这里我重构为使用 Map
  async sendApi(action: string, params = {}) {
    const requestID = randomUUID();
    const request = { action, params, echo: requestID };
    this.ws.sendMessage(request);

    return new Promise<Onebot11.Onebot11Response | undefined>((resolve, reject) => {
      // 创建包含详细信息的超时错误
      const timeoutError = new Error(`Request timed out after ${this.timeout}ms`);
      timeoutError.name = "TimeoutError";
      Object.assign(timeoutError, request);

      // 设置超时定时器
      const timeout = setTimeout(() => {
        this.cleanupEcho(requestID); // 统一清理逻辑
        reject(timeoutError);
        logger.error(["请求超时", request], this.bot?.id);
        this.ws.terminate();
      }, this.timeout);

      // 存储到 Map 结构
      this.requests.set(requestID, {
        request,
        resolve: (response: any) => {
          this.cleanupEcho(requestID);
          resolve(response);
        },
        reject: (error: any) => {
          this.cleanupEcho(requestID);
          reject(error);
        },
        timeout,
      });
    });
  }

  // 统一清理方法
  cleanupEcho(requestID: UUID) {
    if (this.requests.has(requestID)) {
      const entry = this.requests.get(requestID);
      clearTimeout(entry.timeout);
      this.requests.delete(requestID);
    }
  }

  async getID() {
    logger.debug("获取机器人 QQ 号", this.bot?.UUID);
    return (await this.sendApi("get_login_info"))?.data.user_id as string;
  }

  async getNickname() {
    logger.debug("获取机器人昵称", this.bot?.id);
    return (await this.sendApi("get_login_info"))?.data.nickname as string;
  }

  async getFriendList() {
    logger.debug("获取好友列表", this.bot?.id);
    const response = (await this.sendApi("get_friend_list"))?.data as unknown as {
      user_id: number;
      nickname: string;
      remark: string;
    }[];
    if (!response) {
      return undefined;
    }
    const friends = new Map<string, InfoUserPersonal>();
    response.map((i) => {
      friends.set(i.user_id.toString(), {
        type: "person",
        userID: i.user_id.toString(),
        userName: i.nickname,
        remark: i.remark,
      });
    });
    return friends;
  }

  async getFriendInfo(userID: string): Promise<InfoUserPersonal | undefined> {
    const response = (
      await this.sendApi("get_stranger_info", {
        user_id: userID,
      })
    )?.data as unknown as {
      user_id: number;
      avatar: string;
      nickname: string;
      sign: string;
      sex: string;
      age: number;
      level: number;
      status: {
        status_id: number;
        face_id: number;
        message: string;
      };
      RegisterTime: string;
      Business: {
        type: number;
        name: string;
        level: number;
        icon: string;
        ispro: number;
        isyear: number;
      }[];
    };
    if (!response) {
      return undefined;
    }
    return {
      type: "person",
      userID: response.user_id.toString(),
      userName: response.nickname,
      sex:
        response.sex === "male"
          ? "male"
          : response.sex === "female"
            ? "female"
            : response.sex === "secret"
              ? "secret"
              : undefined,
      age: response.age,
      platform: {
        qq: {
          level: response.level,
          avatar: response.avatar,
          sign: response.sign,
        },
      },
    };
  }

  async getMessage(messageID: string) {
    const response = (await this.sendApi("get_msg", { message_id: messageID }))?.data as {
      time: number;
      message_type: "private" | "group";
      message_id: number;
      real_id: number;
      sender: {
        user_id: number;
        nickname: string;
      };
      message: Onebot11.Onebot11MessageSegment[];
      group_id?: number;
      group?: boolean;
    };
    if (!response) {
      return undefined;
    }

    const messageBuilder = new MessageBuilder();
    messageBuilder.messageID = messageID;

    if (response.group_id) {
      messageBuilder.messageType = "group";
      messageBuilder.target = {
        type: "group",
        groupID: response.group_id.toString(),
      };
      messageBuilder.senderID = response.sender.user_id.toString();
    } else {
      messageBuilder.messageType = "private";
      messageBuilder.target = { userID: this.bot?.id!, type: "person" };
      messageBuilder.senderID = response.sender.user_id.toString();
    } // TODO 待实现 guild

    messageBuilder.sendTimestampMs = response.time;
    const messageBlocks = this.onebot11MessageToMessageBlocks(response.message);
    messageBuilder.messageBlocks = messageBlocks;
    return messageBuilder.build();
  }

  async getPrivateMessageHistory(userID: string, startMessageID: string, count: number) {
    const response = (
      await this.sendApi("get_friend_msg_history", {
        user_id: userID,
        message_seq: startMessageID,
        count,
      })
    )?.data.messages as {
      message_type: "private";
      sub_type: "friend";
      message_id: number;
      user_id: number;
      message: Onebot11.Onebot11MessageSegment[];
      sender: {
        user_id: number;
        nickname: string;
      };
      target_id: number;
    }[];
    if (!response) {
      return undefined;
    }
    const messages: Message[] = [];
    response.map((i) => {
      const messageBuilder = new MessageBuilder();
      messageBuilder.messageID = i.message_id.toString();
      messageBuilder.senderID = i.sender.user_id.toString();
      messageBuilder.target = { type: "person", userID: i.target_id.toString() };
      messageBuilder.messageType = "private";
      // messageBuilder.sendTimestampMs = i.time;
      const messageBlocks = this.onebot11MessageToMessageBlocks(i.message);
      messageBuilder.messageBlocks = messageBlocks;
      return messageBuilder.build();
    });
    return messages;
  }

  async sendPrivateMessage(message: Message, userID: string): Promise<string | undefined> {
    logger.info(`发送好友消息：${this.makeLog(message)}`, `${this.bot?.id} => ${userID}`, true);
    return (
      (
        await this.sendApi("send_private_msg", {
          user_id: userID,
          message: this.messageToOnebot11Message(message),
        })
      )?.data.message_id as number
    ).toString();
  }

  async recallMessage(messageID: string) {
    logger.info(`撤回消息：${messageID}`, this.bot?.id);
    const response = await this.sendApi("delete_msg", { message_id: messageID });
    if (response?.status !== "ok") {
      logger.error(`撤回消息失败：${response}`, this.bot?.id);
      return false;
    }
    return true;
  }

  async getGroupList(): Promise<Map<string, InfoGroup> | undefined> {
    logger.debug("获取群列表", this.bot?.id);
    const response = (await this.sendApi("get_group_list"))?.data as unknown as {
      group_id: number;
      group_name: string;
      member_count: number;
      max_member_count: number;
    }[];
    if (!response) {
      return undefined;
    }
    const groups = new Map<string, InfoGroup>();
    response.map((i) => {
      groups.set(i.group_id.toString(), {
        groupID: i.group_id.toString(),
        groupName: i.group_name,
        memberCount: i.member_count,
        maxMemberCount: i.max_member_count,
        members: new Map<string, InfoUserGroup>(),
      });
    });
    return groups;
  }

  async getGroupInfo(groupID: string) {
    const response = (
      await this.sendApi("get_group_info", {
        group_id: groupID,
      })
    )?.data as unknown as {
      group_id: number;
      group_name: string;
      group_memo: string;
      group_create_time: number;
      group_level: number;
      member_count: number;
      max_member_count: number;
    };
    return {
      groupID: response.group_id.toString(),
      groupName: response.group_name,
      memberCount: response.member_count,
      maxMemberCount: response.max_member_count,
      remark: response.group_memo,
      members: new Map(),
    };
  }

  async getGroupMemberList(groupID: string) {
    const response = (
      await this.sendApi("get_group_member_list", {
        group_id: groupID,
      })
    )?.data as unknown as {
      group_id: number;
      user_id: number;
      nickname: string;
      card: string;
      sex: "male" | "female" | "unknown";
      age: number;
      area: string;
      join_time: number;
      last_sent_time: number;
      level: string;
      role: "owner" | "admin" | "member";
      unfriendly: boolean;
      title: string;
      title_expire_time: number;
      card_changeable: boolean;
      shut_up_timestamp: number;
    }[];
    if (!response) {
      return undefined;
    }
    const members = new Map<string, InfoUserGroup>();
    response.map((i) => {
      members.set(i.user_id.toString(), {
        type: "group",
        userID: i.user_id.toString(),
        userName: i.nickname,
        nickname: i.card,
        sex: i.sex === "unknown" ? undefined : i.sex,
        age: i.age,
      });
    });
    return members;
  }

  async getGroupMemberInfo(groupID: string, userID: string) {
    const response = (
      await this.sendApi("get_group_member_info", {
        group_id: groupID,
        user_id: userID,
      })
    )?.data as unknown as {
      group_id: number;
      user_id: number;
      nickname: string;
      card: string;
      sex: "male" | "female" | "unknown";
      age: number;
      area: string;
      join_time: number;
      last_sent_time: number;
      level: string;
      role: "owner" | "admin" | "member";
      unfriendly: boolean;
      title: string;
      title_expire_time: number;
      card_changeable: boolean;
      shut_up_timestamp: number;
    };
    if (!response) {
      return undefined;
    }
    return {
      type: "group",
      userID: response.user_id.toString(),
      userName: response.nickname,
      nickname: response.card,
      sex: response.sex === "unknown" ? undefined : response.sex,
      age: response.age,
    } satisfies InfoUserGroup;
  }

  async getGroupMessageHistory(groupID: string, startMessageID: string, count = 20) {
    const response = (
      await this.sendApi("get_group_msg_history", {
        group_id: groupID,
        message_seq: startMessageID,
        count,
      })
    )?.data.messages as {
      message_typ: "group";
      sub_type: "normal";
      message_id: number;
      group_id: number;
      user_id: number;
      anonymous: null;
      message: Onebot11.Onebot11MessageSegment[];
      raw_message: "string";
      sender: {
        user_id: number;
        nickname: "string";
        card: "string";
      };
    }[];
    if (!response) {
      return undefined;
    }
    const messages: Message[] = [];
    response.map((i) => {
      const messageBuilder = new MessageBuilder();
      messageBuilder.messageID = i.message_id.toString();
      messageBuilder.senderID = i.sender.user_id.toString();
      messageBuilder.messageType = "group";
      messageBuilder.messageBlocks = this.onebot11MessageToMessageBlocks(i.message);
      return messageBuilder.build();
    });
    return messages;
  }

  async sendGroupMessage(message: Message, groupID: string): Promise<string | undefined> {
    logger.info(`发送群消息：${this.makeLog(message)}`, `${this.bot?.id} => ${groupID}`, true);
    return (
      (
        await this.sendApi("send_group_msg", {
          group_id: groupID,
          message: this.messageToOnebot11Message(message),
        })
      )?.data.message_id as number
    ).toString();
  }

  async getGuildList() {
    const response = (await this.sendApi("get_guild_list"))?.data as unknown as
      | {
          guild_id: string;
          guild_name: string;
          guild_display_id: number;
        }[]
      | null;
    if (response === null) {
      return new Map();
    }
    if (!response) {
      return undefined;
    }
    const guilds = new Map<string, InfoGuild>();
    response.map((i) => {
      guilds.set(i.guild_id, {
        guildID: i.guild_id,
        guildName: i.guild_name,
        channels: new Map<string, InfoChannel>(),
      });
    });
  }

  async getGuildInfo(guildID: string) {
    const response = (
      await this.sendApi("get_guild_meta_by_guest", {
        guild_id: guildID,
      })
    )?.data as {
      guild_id: string;
      guild_name: string;
      guild_display_id: number;
    };
    if (!response) {
      return undefined;
    }
    return {
      guildID: response.guild_id,
      guildName: response.guild_name,
      guildDisplayID: response.guild_display_id,
      channels: new Map(),
    };
  }

  async getGuildMemberList(guildID: string) {
    const map = new Map<string, InfoUserGuild>();
    let next_token = "";
    while (true) {
      const response = (
        await this.sendApi("get_guild_member_list", {
          guild_id: guildID,
          next_token,
        })
      )?.data as {
        members: {
          tiny_id: string;
          title: string;
          nickname: string;
          role_id: string;
          role_name: string;
        }[];
        next_token: string;
        finished: boolean;
      };
      if (!response) break;

      for (const i of response.members)
        map.set(i.tiny_id, {
          type: "guild",
          userID: i.tiny_id,
          nickname: i.nickname,
          platform: {
            qq: {
              role_id: i.role_id,
              role_name: i.role_name,
              title: i.title,
            },
          },
        });
      if (response.finished) break;
      next_token = response.next_token;
    }
    return map;
  }

  async getGuildMemberInfo(guildID: string, userID: string) {
    const response = (
      await this.sendApi("get_guild_member_profile", {
        guild_id: guildID,
        user_id: userID,
      })
    )?.data as {
      tiny_id: string;
      nickname: string;
      avatar_url: string;
      join_time: number;
      roles: {
        role_id: string;
        role_name: string;
      }[];
    };
    if (!response) return undefined;

    return {
      type: "guild",
      userID: response.tiny_id,
      nickname: response.nickname,
    } satisfies InfoUserGuild;
  }

  async getChannelList(guildID: string) {
    const response = (
      await this.sendApi("get_guild_channel_list", {
        guild_id: guildID,
      })
    )?.data as unknown as {
      owner_guild_id: string;
      channel_id: string;
      channel_type: number;
      channel_name: string;
      create_time: number;
      creator_tiny_id: string;
      talk_permission: number;
      visible_type: number;
      current_slow_mode: number;
      slow_modes: {
        slow_mode_key: number;
        slow_mode_text: string;
        speak_frequency: number;
        slow_mode_circle: number;
      }[];
    }[];
    if (!response) return undefined;

    const channel = new Map<string, InfoChannel>();
    for (const data of response) {
      channel.set(data.channel_id, {
        channelID: data.channel_id,
        channelName: data.channel_name,
        platform: { qq: { ...response } }, // TODO 临时
      });
    }
    return channel;
  }

  async sendGuildMessage(message: Message, guildID: string, channelID: string) {
    logger.info(
      `发送频道消息：${this.makeLog(message)}`,
      `${this.bot?.id}] => ${guildID}-${channelID}`,
      true,
    );
    return (
      await this.sendApi("send_guild_channel_msg", {
        guild_id: guildID,
        channel_id: channelID,
        message: this.messageToOnebot11Message(message),
      })
    )?.data.message_id as string | undefined;
  }

  // async makeFile(file, opts) {
  //   file = await Bot.Buffer(file, {
  //     http: true,
  //     size: 10485760,
  //     ...opts,
  //   });
  //   if (Buffer.isBuffer(file)) return `base64://${file.toString("base64")}`;
  //   return file;
  // }
  // async getForwardMessage(messageID: string) {
  //   const response = (
  //     await this.sendApi("get_forward_msg", {
  //       messageID,
  //     })
  //   )?.data.messages;
  //   const messages: Message[] = [];
  //   for (const i of response) {
  //     const message = this.makeMessage(i);
  //     message.messageID = i.message_id;
  //     message.sender = {
  //       type: "group",
  //       userID: i.user_id,
  //       nickname: i.sender.nickname,
  //     };
  //     messages.push(message);
  //   }
  //   return messages;
  // }

  // async sendFriendForwardMessage(message: Message, userID: string) {
  //   logger.info(
  //     `发送好友转发消息：${this.makeLog(message)}`,
  //     `${this.bot?.id} => ${userID}`,
  //     true
  //   );
  //   return (
  //     await this.sendApi("send_private_forward_msg", {
  //       user_id: userID,
  //       messages: await this.makeOnebotForwardMessageArray(message),
  //     })
  //   )?.data.message_id;
  // }

  // async sendGroupForwardMsg(data, msg) {
  //   logger.info(
  //     `发送群转发消息：${this.makeLog(msg)}`,
  //     `${data.self_id} => ${data.group_id}`,
  //     true
  //   );
  //   return data.bot.sendApi("send_group_forward_msg", {
  //     group_id: data.group_id,
  //     messages: await this.makeForwardMessage(msg),
  //   });
  // }

  // setProfile(data, profile) {
  //   logger.info(`设置资料：${Bot.String(profile)}`, data.self_id);
  //   return data.bot.sendApi("set_qq_profile", profile);
  // }

  // async setAvatar(data, file) {
  //   logger.info(`设置头像：${file}`, data.self_id);
  //   return data.bot.sendApi("set_qq_avatar", {
  //     file: await this.makeFile(file),
  //   });
  // }

  // sendLike(data, times) {
  //   logger.info(`点赞：${times}次`, `${data.self_id} => ${data.user_id}`, true);
  //   return data.bot.sendApi("send_like", {
  //     user_id: data.user_id,
  //     times,
  //   });
  // }

  // setGroupName(data, group_name) {
  //   logger.info(
  //     `设置群名：${group_name}`,
  //     `${data.self_id} => ${data.group_id}`,
  //     true
  //   );
  //   return data.bot.sendApi("set_group_name", {
  //     group_id: data.group_id,
  //     group_name,
  //   });
  // }

  // async setGroupAvatar(data, file) {
  //   logger.info(
  //     `设置群头像：${file}`,
  //     `${data.self_id} => ${data.group_id}`,
  //     true
  //   );
  //   return data.bot.sendApi("set_group_portrait", {
  //     group_id: data.group_id,
  //     file: await this.makeFile(file),
  //   });
  // }

  // setGroupAdmin(data, user_id, enable) {
  //   logger.info(
  //     `${enable ? "设置" : "取消"}群管理员：${user_id}`,
  //     `${data.self_id} => ${data.group_id}`,
  //     true
  //   );
  //   return data.bot.sendApi("set_group_admin", {
  //     group_id: data.group_id,
  //     user_id,
  //     enable,
  //   });
  // }

  // setGroupCard(data, user_id, card) {
  //   logger.info(
  //     `设置群名片：${card}`,
  //     `${data.self_id} => ${data.group_id}, ${user_id}`,
  //     true
  //   );
  //   return data.bot.sendApi("set_group_card", {
  //     group_id: data.group_id,
  //     user_id,
  //     card,
  //   });
  // }

  // setGroupTitle(data, user_id, special_title, duration) {
  //   logger.info(
  //     `设置群头衔：${special_title} ${duration}`,
  //     `${data.self_id} => ${data.group_id}, ${user_id}`,
  //     true
  //   );
  //   return data.bot.sendApi("set_group_special_title", {
  //     group_id: data.group_id,
  //     user_id,
  //     special_title,
  //     duration,
  //   });
  // }

  // sendGroupSign(data) {
  //   logger.info("群打卡", `${data.self_id} => ${data.group_id}`, true);
  //   return data.bot.sendApi("send_group_sign", {
  //     group_id: data.group_id,
  //   });
  // }

  // setGroupBan(data, user_id, duration) {
  //   logger.info(
  //     `禁言群成员：${duration}秒`,
  //     `${data.self_id} => ${data.group_id}, ${user_id}`,
  //     true
  //   );
  //   return data.bot.sendApi("set_group_ban", {
  //     group_id: data.group_id,
  //     user_id,
  //     duration,
  //   });
  // }

  // setGroupWholeKick(data, enable) {
  //   logger.info(
  //     `${enable ? "开启" : "关闭"}全员禁言`,
  //     `${data.self_id} => ${data.group_id}`,
  //     true
  //   );
  //   return data.bot.sendApi("set_group_whole_ban", {
  //     group_id: data.group_id,
  //     enable,
  //   });
  // }

  // setGroupKick(data, user_id, reject_add_request) {
  //   logger.info(
  //     `踢出群成员${reject_add_request ? "拒绝再次加群" : ""}`,
  //     `${data.self_id} => ${data.group_id}, ${user_id}`,
  //     true
  //   );
  //   return data.bot.sendApi("set_group_kick", {
  //     group_id: data.group_id,
  //     user_id,
  //     reject_add_request,
  //   });
  // }

  // setGroupLeave(data, is_dismiss) {
  //   logger.info(
  //     is_dismiss ? "解散" : "退群",
  //     `${data.self_id} => ${data.group_id}`,
  //     true
  //   );
  //   return data.bot.sendApi("set_group_leave", {
  //     group_id: data.group_id,
  //     is_dismiss,
  //   });
  // }

  // downloadFile(data, url, thread_count, headers) {
  //   return data.bot.sendApi("download_file", {
  //     url,
  //     thread_count,
  //     headers,
  //   });
  // }

  // async sendFriendFile(data, file, name = path.basename(file)) {
  //   logger.info(
  //     `发送好友文件：${name}(${file})`,
  //     `${data.self_id} => ${data.user_id}`,
  //     true
  //   );
  //   return data.bot.sendApi("upload_private_file", {
  //     user_id: data.user_id,
  //     file: await this.makeFile(file, { file: true }),
  //     name,
  //   });
  // }

  // async sendGroupFile(data, file, folder, name = path.basename(file)) {
  //   logger.info(
  //     `发送群文件：${folder || ""}/${name}(${file})`,
  //     `${data.self_id} => ${data.group_id}`,
  //     true
  //   );
  //   return data.bot.sendApi("upload_group_file", {
  //     group_id: data.group_id,
  //     folder,
  //     file: await this.makeFile(file, { file: true }),
  //     name,
  //   });
  // }

  // deleteGroupFile(data, file_id, busid) {
  //   logger.info(
  //     `删除群文件：${file_id}(${busid})`,
  //     `${data.self_id} => ${data.group_id}`,
  //     true
  //   );
  //   return data.bot.sendApi("delete_group_file", {
  //     group_id: data.group_id,
  //     file_id,
  //     busid,
  //   });
  // }

  // createGroupFileFolder(data, name) {
  //   logger.info(
  //     `创建群文件夹：${name}`,
  //     `${data.self_id} => ${data.group_id}`,
  //     true
  //   );
  //   return data.bot.sendApi("create_group_file_folder", {
  //     group_id: data.group_id,
  //     name,
  //   });
  // }

  // getGroupFileSystemInfo(data) {
  //   return data.bot.sendApi("get_group_file_system_info", {
  //     group_id: data.group_id,
  //   });
  // }

  // getGroupFiles(data, folder_id) {
  //   if (folder_id)
  //     return data.bot.sendApi("get_group_files_by_folder", {
  //       group_id: data.group_id,
  //       folder_id,
  //     });
  //   return data.bot.sendApi("get_group_root_files", {
  //     group_id: data.group_id,
  //   });
  // }

  // getGroupFileUrl(data, file_id, busid) {
  //   return data.bot.sendApi("get_group_file_url", {
  //     group_id: data.group_id,
  //     file_id,
  //     busid,
  //   });
  // }

  // getGroupFs(data) {
  //   return {
  //     upload: this.sendGroupFile.bind(this, data),
  //     rm: this.deleteGroupFile.bind(this, data),
  //     mkdir: this.createGroupFileFolder.bind(this, data),
  //     df: this.getGroupFileSystemInfo.bind(this, data),
  //     ls: this.getGroupFiles.bind(this, data),
  //     download: this.getGroupFileUrl.bind(this, data),
  //   };
  // }

  // deleteFriend(data) {
  //   logger.info("删除好友", `${data.self_id} => ${data.user_id}`, true);
  //   return data.bot
  //     .sendApi("delete_friend", { user_id: data.user_id })
  //     .finally(this.getFriendMap.bind(this, data));
  // }

  // setFriendAddRequest(data, flag, approve, remark) {
  //   return data.bot.sendApi("set_friend_add_request", {
  //     flag,
  //     approve,
  //     remark,
  //   });
  // }

  // setGroupAddRequest(data, flag, approve, reason, sub_type = "add") {
  //   return data.bot.sendApi("set_group_add_request", {
  //     flag,
  //     sub_type,
  //     approve,
  //     reason,
  //   });
  // }

  // getGroupHonorInfo(data) {
  //   return data.bot.sendApi("get_group_honor_info", {
  //     group_id: data.group_id,
  //   });
  // }

  // getEssenceMsg(data) {
  //   return data.bot.sendApi("get_essence_msg_list", {
  //     group_id: data.group_id,
  //   });
  // }

  // setEssenceMsg(data, message_id) {
  //   return data.bot.sendApi("set_essence_msg", { message_id });
  // }

  // deleteEssenceMsg(data, message_id) {
  //   return data.bot.sendApi("delete_essence_msg", { message_id });
  // }
}
