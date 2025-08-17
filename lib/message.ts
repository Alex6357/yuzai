import { fileURLToPath } from "node:url";
import { type UUID, createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import { PlatformInfo, type Target } from "./types.ts";
import logger from "./logger.ts";

export abstract class MessageBlock {
  // TODO 确定 TYPE 范围
  abstract readonly type: "text" | "face" | "image" | "file" | "at" | "atall" | "quote";
  abstract toString(): string;

  protected _platform?: PlatformInfo;
  get platform() {
    return this._platform;
  }
}

/** 消息中的文本块 */
export class TextBlock extends MessageBlock {
  readonly type = "text";
  private readonly _text: string;

  get text() {
    return this._text;
  }

  constructor(text: string) {
    super();
    this._text = text;
  }

  toString() {
    return this._text;
  }
}

/** 消息中的表情块 */
export class FaceBlock extends MessageBlock {
  readonly type = "face";
  private readonly _faceID: string;
  get faceID() {
    return this._faceID;
  }
  get name() {
    return this._name;
  }
  private readonly _name?: string;

  constructor(faceID: string, name?: string) {
    super();
    this._faceID = faceID;
    this._name = name;
  }

  toString(): string {
    return `<fase: ${this._name ? this._name : this._faceID}>`;
  }
}

/** 消息中的图片块 */
export class ImageBlock extends MessageBlock {
  readonly type = "image";
  private readonly _id: string;
  get id() {
    return this._id;
  }
  private readonly _name?: string;
  get name() {
    return this._name;
  }
  // @ts-expect-error TS6133 未完成
  private _size?: number;
  // @ts-expect-error TS6133 未完成
  private _url?: string;

  constructor(id: string, name?: string, size?: number, url?: string) {
    super();
    this._id = id;
    this._name = name;
    this._size = size;
    this._url = url;
  }

  toString() {
    return `<image: ${this._name || this._id || "image"}>`;
  }
}

/** 消息中的文件块 */
/*
 * 文件块要考虑到两个地点：机器人端（客户端）和适配器端（服务端）
 * 机器人端，需要考虑如何下载文件，下载文件的校验，下载后路径的转换
 * 适配器端，需要考虑上传文件的方式（网址，上传文件到服务器），考虑客户端与服务端分离或者在本地
 *
 * 在机器人端，收到的文件块必然是一个 URL，发送的文件块大概率是一个文件路径
 * 在适配器端，需要发送的文件大概率是机器人端的文件路径，也可能是 URL
 */
export class FileBlock extends MessageBlock {
  readonly type = "file";
  private readonly _id?: string;
  get id() {
    return this._id;
  }

  private readonly _name: string;
  get name() {
    return this._name;
  }

  private _size?: number;
  get size() {
    return this._size;
  }

  private _checksum?: { type: string; value: string };
  get checksum() {
    return this._checksum;
  }

  private readonly _url?: string;
  private readonly _urlResolver?: (fileBlock: FileBlock) => Promise<string>;
  get url() {
    return this._url;
  }
  async getUrl() {
    if (this._url) return this._url;
    if (this._urlResolver) return this._urlResolver(this);
    return this._url;
  }

  private _localFilePath?: string;
  get localFilePath() {
    return this._localFilePath;
  }

  constructor(
    name: string,
    id?: string,
    size?: number,
    checksum?: { type: string; value: string },
    url?: string,
    urlResolver?: (fileBlock: FileBlock) => Promise<string>,
  ) {
    super();
    this._id = id;
    this._name = name;
    this._size = size;
    this._checksum = checksum;
    this._url = url;
    this._urlResolver = urlResolver;
    if (url?.startsWith("file://")) {
      let filePath = fileURLToPath(url);
      if (process.platform === "win32") filePath = filePath.replace(/\\/g, "/");
      this._localFilePath = filePath;
    }
  }

  /**
   * 下载文件
   *
   * 如果文件已经存在于本地，会直接返回已经存在的路径
   * @param dir 要下载到的路径
   * @param altName 要下载的文件名，默认使用文件原名称
   * @param force 强制重新下载
   * @param noCheck 是否不校验文件大小和校验和
   * @returns 下载后的文件路径
   */
  async download(dir: string, altName?: string, force = false, noCheck = false) {
    if (this.url && (!this.localFilePath || force)) {
      const name = altName || this.name || this.id;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- 由于 this.name 一定存在，所以 name 一定存在
      const absolutePath = path.resolve(dir, name!);
      const url = await this.getUrl();
      if (!url) {
        logger.error("文件 URL 不存在");
        return;
      }
      const res = await fetch(url);
      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      await fs.writeFile(absolutePath, buffer);
      this._localFilePath = absolutePath;
      if (!this._size) this._size = buffer.byteLength;
      else if (!noCheck && this._size !== buffer.byteLength) {
        logger.error(`文件 ${name} 大小不匹配，预期 ${this._size}，实际 ${buffer.byteLength}`);
      }
      if (!this._checksum)
        this._checksum = {
          type: "sha256",
          value: createHash("sha256").update(buffer).digest("hex"),
        };
      else if (!noCheck) {
        const checksum = createHash(this._checksum.type).update(buffer).digest("hex");
        if (checksum !== this._checksum.value) {
          logger.error(`文件 ${name} 校验和不匹配，预期 ${this._checksum.value}，实际 ${checksum}`);
        }
      }
      return absolutePath;
    } else {
      return this.localFilePath;
    }
  }

  /**
   * 打开文件
   *
   * 如果文件不存在，会先下载文件
   * @returns 文件句柄
   */
  async open() {
    if (this.localFilePath) return await fs.open(this.localFilePath);
    const path = await this.download(os.tmpdir());
    if (!path) return;
    return await fs.open(path);
  }

  toString() {
    return `<file: ${this._name || this._id || "file"}, url: ${this.url}>`;
  }
}

/** 消息中的 @ 块 */
export class AtBlock extends MessageBlock {
  readonly type = "at";
  private readonly _targetUserID: string;
  get targetUserID() {
    return this._targetUserID;
  }
  private readonly _targetNickname?: string;
  get targetNickname() {
    return this._targetNickname;
  }

  /**
   * @param targetUserID 目标用户 ID，如果为空则为全体成员
   * @param targetNickname 目标用户名称
   */
  constructor(targetUserID: string, targetNickname?: string) {
    super();
    this._targetUserID = targetUserID;
    this._targetNickname = targetNickname;
  }

  toString(): string {
    return `<at: ${this._targetUserID}>`;
  }
}

/** 消息中的 \@全体成员 块 */
export class AtallBlock extends MessageBlock {
  readonly type = "atall";

  toString(): string {
    return `<atall>`;
  }
}

/**
 * @description 消息中的引用块
 *
 * 有些平台只能引用一条，这种情况可以有两种处理方式：
 * - 以第一个出现的引用块为准，同时在消息正文中忽略所有的引用块
 * - 以文本方式构造类似引用的格式，把引用内容以文本块的形式添加到消息中
 */
export class QuoteBlock extends MessageBlock {
  readonly type = "quote";
  private readonly _messageID?: string;
  get messageID() {
    return this._messageID;
  }
  private readonly _message?: Message;
  get message() {
    return this._message;
  }

  constructor(messageID: string);
  constructor(message: Message);
  constructor(messageIDOrMessage: string | Message) {
    super();
    if (typeof messageIDOrMessage === "string") {
      this._messageID = messageIDOrMessage;
    } else {
      this._message = messageIDOrMessage;
    }
  }

  toString(): string {
    return `<quote: ${this._messageID || this._message}>`;
  }
}

/** 构造消息需要的参数 */
interface MessageConstructor {
  botUUID?: UUID;
  senderID?: string;
  target?: Target;
  messageType?: "private" | "group" | "groupPrivate" | "guild" | "guildPrivate";
  messageID?: string;
  sendTimestampMs?: number;
  messageBlocks?: MessageBlock[] | MessageBlock;
  platform?: PlatformInfo;
}

/** 一条完整的消息 */
export default class Message {
  /** Client 维护的 Bot UUID，与机器人本身无关 */
  protected _botUUID?: UUID;
  /** Client 维护的 Bot UUID，与机器人本身无关 */
  get botUUID(): UUID | undefined {
    return this._botUUID;
  }

  /** 消息发送者 */
  protected _senderID?: string;
  /** 消息发送者 */
  get senderID() {
    return this._senderID;
  }

  /** 消息接收者 */
  protected _target?: Target;
  /** 消息接收者 */
  get target() {
    return this._target;
  }

  /** 消息类型，分别为 `private` 私聊，`group` 群聊，`groupPrivate` 群私信，`guild` 频道，`guildPrivate` 频道私信 */
  protected _messageType?: "private" | "group" | "groupPrivate" | "guild" | "guildPrivate";
  /** 消息类型，分别为 `private` 私聊，`group` 群聊，`groupPrivate` 群私信，`guild` 频道，`guildPrivate` 频道私信 */
  get messageType(): "private" | "group" | "groupPrivate" | "guild" | "guildPrivate" | undefined {
    return this._messageType;
  }

  /** 此条消息 ID */
  protected _messageID?: string;
  /** 此条消息 ID */
  get messageID(): string | undefined {
    return this._messageID;
  }

  /** 消息内容 */
  protected _messageBlocks: MessageBlock[] = [];
  /** 消息内容 */
  get messageBlocks() {
    return this._messageBlocks;
  }

  /** 消息发送时间，毫秒级时间戳 */
  protected _sendTimestampMs?: number;
  /** 消息发送时间，毫秒级时间戳 */
  get sendTimestampMs(): number | undefined {
    return this._sendTimestampMs;
  }

  /** 平台相关信息 */
  protected _platform?: PlatformInfo;
  /** 平台相关信息 */
  get platform(): PlatformInfo | undefined {
    return this._platform;
  }

  /** 字符串形式的消息内容 */
  get rawMessage() {
    // TODO 是文本还是json？
    return this.toString();
  }

  /**
   * 将消息转换成字符串
   * @returns 字符串形式的消息内容
   */
  toString() {
    return this._messageBlocks.map((i) => i.toString()).join("");
  }

  /**
   * 构造函数
   * @param botUUID Client 维护的 Bot UUID，与机器人本身无关
   * @param senderID 消息发送者 ID
   * @param target 消息接收者
   * @param messageType 消息类型，分别为 `private` 私聊，`group` 群聊，`group_private` 群私信，`guild` 频道，`guild_private` 频道私信
   * @param messageID 此条消息 ID
   * @param messageBlocks 消息块列表
   * @param sendTimestampMs 消息发送时间，毫秒级时间戳
   */
  constructor({
    botUUID,
    senderID,
    target,
    messageType,
    messageID,
    messageBlocks,
    sendTimestampMs,
  }: MessageConstructor) {
    this._botUUID = botUUID;
    this._senderID = senderID;
    this._target = target;
    this._messageID = messageID;
    this._messageType = messageType;
    this._sendTimestampMs = sendTimestampMs;
    if (messageBlocks) {
      if (Array.isArray(messageBlocks)) {
        this._messageBlocks = messageBlocks;
      } else {
        this._messageBlocks.push(messageBlocks);
      }
    }
  }
}

/** 消息构建器，用于构建一条完整的消息 */
export class MessageBuilder {
  /** Client 维护的 Bot UUID，与机器人本身无关 */
  protected _botUUID?: UUID;
  /** Client 维护的 Bot UUID，与机器人本身无关 */
  get botUUID(): UUID | undefined {
    return this._botUUID;
  }
  set botUUID(botUUID: UUID) {
    this._botUUID = botUUID;
  }
  /** Client 维护的 Bot UUID，与机器人本身无关 */
  setBotUUID(botUUID: UUID) {
    this.botUUID = botUUID;
    return this;
  }

  /** 消息发送者 */
  protected _senderID?: string;
  /** 消息发送者 */
  get senderID(): string | undefined {
    return this._senderID;
  }
  set senderID(senderID: string) {
    this._senderID = senderID;
  }
  /** 消息发送者 */
  setSender(senderID: string) {
    this.senderID = senderID;
    return this;
  }

  /** 消息接收者 */
  protected _target?: Target;
  /** 消息接收者 */
  get target(): Target | undefined {
    return this._target;
  }
  set target(target: Target) {
    this._target = target;
  }
  /** 消息接收者 */
  setTarget(target: Target) {
    this.target = target;
    return this;
  }

  /** 消息类型，分别为 `private` 私聊，`group` 群聊，`group_private` 群私信，`guild` 频道，`guild_private` 频道私信 */
  protected _messageType?: "private" | "group" | "groupPrivate" | "guild" | "guildPrivate";
  /** 消息类型，分别为 `private` 私聊，`group` 群聊，`group_private` 群私信，`guild` 频道，`guild_private` 频道私信 */
  get messageType(): "private" | "group" | "groupPrivate" | "guild" | "guildPrivate" | undefined {
    return this._messageType;
  }
  set messageType(messageType: "private" | "group" | "groupPrivate" | "guild" | "guildPrivate") {
    this._messageType = messageType;
  }
  /** 消息类型，分别为 `private` 私聊，`group` 群聊，`group_private` 群私信，`guild` 频道，`guild_private` 频道私信 */
  setMessageType(messageType: "private" | "group" | "groupPrivate" | "guild" | "guildPrivate") {
    this.messageType = messageType;
    return this;
  }

  /** 此条消息 ID */
  protected _messageID?: string;
  /** 此条消息 ID */
  get messageID(): string | undefined {
    return this._messageID;
  }
  set messageID(messageID: string) {
    this._messageID = messageID;
  }
  /** 此条消息 ID */
  setMessageID(messageID: string) {
    this.messageID = messageID;
    return this;
  }

  /** 消息内容 */
  protected _messageBlocks: MessageBlock[] = [];
  /** 消息内容 */
  get messageBlocks() {
    return this._messageBlocks;
  }
  set messageBlocks(messageBlocks: MessageBlock[]) {
    this._messageBlocks = messageBlocks;
  }
  /** 消息内容 */
  setMessageBlocks(messageBlocks: MessageBlock[]) {
    this.messageBlocks = messageBlocks;
    return this;
  }

  /** 消息发送时间，毫秒级时间戳 */
  protected _sendTimestampMs?: number;
  /** 消息发送时间，毫秒级时间戳 */
  get sendTimestampMs(): number | undefined {
    return this._sendTimestampMs;
  }
  set sendTimestampMs(sendTimestampMs: number) {
    this._sendTimestampMs = sendTimestampMs;
  }
  /** 消息发送时间，毫秒级时间戳 */
  setSendTimestampMs(sendTimestampMs: number) {
    this.sendTimestampMs = sendTimestampMs;
    return this;
  }

  /** 平台相关信息 */
  protected _platform: PlatformInfo = new PlatformInfo();
  /** 平台相关信息 */
  get platform(): PlatformInfo {
    return this._platform;
  }
  /** 平台相关信息 */
  set platform(platform: PlatformInfo | object) {
    if (platform instanceof PlatformInfo) this._platform = platform;
    else this._platform = new PlatformInfo(platform as Record<string, Record<string, unknown>>);
  }
  /** 平台相关信息 */
  setPlatform(platform: PlatformInfo | object) {
    this.platform = platform;
    return this;
  }

  /** 字符串形式的消息内容 */
  get rawMessage() {
    // TODO 是文本还是json？
    return this.toString();
  }

  /**
   * 将消息转换成字符串
   * @returns 字符串形式的消息内容
   */
  toString() {
    return this._messageBlocks.map((i) => i.toString()).join("");
  }

  /**
   * 消息构造器
   */
  constructor();
  /**
   * 构造消息
   * @param botUUID Client 维护的 Bot UUID，与机器人本身无关
   * @param sender 消息发送者
   * @param target 消息接收者
   * @param messageType 消息类型，分别为 `private` 私聊，`group` 群聊，`group_private` 群私信，`guild` 频道，`guild_private` 频道私信
   * @param messageID 此条消息 ID
   * @param messageBlocks 消息块列表
   * @param sendTimestampMs 消息发送时间，毫秒级时间戳
   */
  constructor({
    botUUID,
    senderID,
    target,
    messageType,
    messageID,
    messageBlocks,
    sendTimestampMs,
  }: MessageConstructor);
  /**
   * 从已有消息构造
   * @param originMessage 已有消息
   */
  constructor(originMessage?: Message);
  constructor(obj?: MessageConstructor | Message) {
    this._botUUID = obj?.botUUID;
    this._senderID = obj?.senderID;
    this._target = obj?.target;
    this._messageID = obj?.messageID;
    this._messageType = obj?.messageType;
    this._sendTimestampMs = obj?.sendTimestampMs;
    if (obj?.messageBlocks) {
      if (Array.isArray(obj.messageBlocks)) {
        this._messageBlocks = obj.messageBlocks;
      } else {
        this._messageBlocks.push(obj.messageBlocks);
      }
    }
  }

  /**
   * 从已有消息构造
   *
   * 所有属性都将被覆盖，包括消息块列表
   * @param originMessage 已有消息
   */
  fromMessage(originMessage: Message): MessageBuilder {
    this._botUUID = originMessage.botUUID;
    this._senderID = originMessage.senderID;
    this._target = originMessage.target;
    this._messageID = originMessage.messageID;
    this._messageType = originMessage.messageType;
    this._sendTimestampMs = originMessage.sendTimestampMs;
    this._messageBlocks = originMessage.messageBlocks;
    return this;
  }

  /**
   * 向消息中添加消息块
   * @param messageBlock 消息内容
   * @param index 添加位置索引，默认为 -1
   * @returns 添加内容后的消息
   */
  add(messageBlock: MessageBlock, index = -1): MessageBuilder {
    this._messageBlocks.splice(index, 0, messageBlock);
    return this;
  }
  /**
   * 删除消息块
   * @param index 要删除的消息块的索引
   * @returns 删除内容后的消息
   */
  remove(index: number): MessageBuilder {
    this._messageBlocks.splice(index, 1);
    return this;
  }
  /**
   * 向消息中添加文本块
   * @param text 文本内容
   * @param index 添加位置索引，默认为 -1
   * @returns 添加内容后的消息
   */
  addTextBlock(text: string, index = -1): MessageBuilder {
    this.add(new TextBlock(text), index);
    return this;
  }
  /**
   * 向消息中添加表情块
   * @param faceID 表情 ID
   * @param name 表情名称
   * @param index 添加位置索引，默认为 -1
   * @returns 添加内容后的消息
   */
  addFaceBlock(faceID: string, name?: string, index = -1): MessageBuilder {
    this.add(new FaceBlock(faceID, name), index);
    return this;
  }
  /**
   * 向消息中添加 At 块
   * @param userID 用户 ID
   * @param name 用户名称
   * @param index 添加位置索引，默认为 -1
   * @returns 添加内容后的消息
   */
  addAtBlock(userID: string, name?: string, index = -1): MessageBuilder {
    this.add(new AtBlock(userID, name), index);
    return this;
  }
  /**
   * 向消息中添加 AtAll 块
   * @param index 添加位置索引，默认为 -1
   * @returns 添加内容后的消息
   */
  addAtallBlock(index = -1): MessageBuilder {
    this.add(new AtallBlock(), index);
    return this;
  }
  /**
   * 向消息中添加图片块
   * @param image 图片 URL
   * @param name 图片名称
   * @param index 添加位置索引，默认为 -1
   * @returns 添加内容后的消息
   */
  addImageBlock(image: string, name?: string, index = -1): MessageBuilder {
    this.add(new ImageBlock(image, name), index);
    return this;
  }
  /**
   * 向消息中添加引用块
   * @param message 引用的消息
   * @param index 添加位置索引，默认为 -1
   * @returns 添加内容后的消息
   */
  addQuoteBlock(message: Message, index?: number): MessageBuilder;
  /**
   * 向消息中添加引用块
   * @param messageID 引用的消息 ID
   * @param index 添加位置索引，默认为 -1
   * @returns 添加内容后的消息
   */
  addQuoteBlock(messageID: string, index?: number): MessageBuilder;
  addQuoteBlock(message: Message | string, index = -1): MessageBuilder {
    // 这里只能这么写，只写一句 add 通过不了类型检查
    if (typeof message === "string") {
      this.add(new QuoteBlock(message), index);
    } else {
      this.add(new QuoteBlock(message), index);
    }
    return this;
  }
  /**
   * 向消息中添加文件块
   * @param id 文件 ID
   * @param name 文件名称
   * @param size 文件大小
   * @param checksum 文件校验和
   * @param url 文件 URL
   * @param index 添加位置索引，默认为 -1
   */
  addFileBlock(
    name: string,
    {
      id,
      size,
      checksum,
      url,
      urlResolver,
    }: {
      id?: string;
      size?: number;
      checksum?: { type: string; value: string };
      url?: string;
      urlResolver?: (fileBlock: FileBlock) => Promise<string>;
    },
    index = -1,
  ) {
    this.add(new FileBlock(name, id, size, checksum, url, urlResolver), index);
  }

  /**
   * 完成构建
   */
  build(): Message {
    return new Message({
      botUUID: this._botUUID,
      senderID: this._senderID,
      target: this._target,
      messageType: this._messageType,
      messageID: this._messageID,
      messageBlocks: this._messageBlocks,
      sendTimestampMs: this._sendTimestampMs,
    });
  }
}
