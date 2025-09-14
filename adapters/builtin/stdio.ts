import readline from "node:readline/promises";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";

import * as utils from "../../lib/utils.ts";
import logger from "../../lib/logger.ts";
import Adapter from "../../lib/adapter.ts";
import Message, { MessageBuilder } from "../../lib/message.ts";
import type { InfoUserPersonal } from "../../lib/types.ts";
import client from "../../lib/client.ts";

class StdioAdapter extends Adapter {
  readonly id = "stdio";
  static readonly id = "stdio";
  readonly name = "标准输入输出";
  static readonly name = "标准输入输出";
  readonly path = "data/stdio/";
  static readonly path = "data/stdio/";
  catimg: (file: string) => Promise<void>;
  // @ts-expect-error TS6133 下文建立 readline.Interface 用于读取标准输入输出
  private sdk: readline.Interface;

  constructor() {
    super();
    // 检测是否存在 catimg 命令，初始化 readline.createInterface
    this.catimg = function (file: string) {
      return new Promise((resolve) =>
        spawn("catimg", ["-l0", file], { stdio: "inherit" })
          .on("error", () => (this.catimg = () => Promise.resolve()))
          .on("close", resolve),
      );
    };
    this.sdk = readline
      .createInterface({
        input: process.stdin,
        output: process.stderr,
      })
      .on("line", (data) => {
        const messageID = Date.now().toString(36);
        const message = new MessageBuilder({
          botUUID: this.bot?.UUID,
          senderID: this.id,
          target: {
            type: "person",
            userID: this.id,
          },
          messageType: "private",
          sendTimestampMs: Date.now(),
        })
          .addTextBlock(data)
          .build();
        fs.appendFile(`${this.path}history`, `${messageID}:${message}\n`, "utf8");
        logger.info(`系统消息: ${message.rawMessage}`, this.id);
        this.bot?.onMessage(message);
      })
      .on("close", () => client.gracefulExit());
  }

  /**
   * 初始化适配器
   * @param force 是否在 TTY 不可用的情况下强制生成 Bot
   */
  static async init(force = false) {
    if (!(process.stdin.isTTY || process.env.FORCE_TTY || force)) return;
    await utils.mkdir(this.path);
    // try {
    //   const HISTORY = (await fs.readFile(`${StdioAdapter.PATH}history`, "utf8"))
    //     .split("\n")
    //     .slice(-11, -1)
    //     .map((i) => i.replace(/^[0-9a-z]+?:/, ""))
    //     .reverse();
    // } catch (err) {
    //   logger.trace(err, StdioAdapter.ID);
    // }
    this.newBot(new StdioAdapter());
    logger.mark(`${this.name}(${this.id}) 已连接`, this.id);
  }

  async getID() {
    return this.id;
  }

  async getNickname() {
    return this.name;
  }

  async getFriendList() {
    return new Map<string, InfoUserPersonal>().set(this.id, {
      type: "person",
      userID: this.id,
      userName: this.name,
      remark: this.name,
    });
  }

  async getFriendInfo(userID: string): Promise<InfoUserPersonal | undefined> {
    if (userID === this.id)
      return {
        type: "person",
        userID: this.id,
        userName: this.name,
        remark: this.name,
      };
    return undefined;
  }

  async getMessage(_messageID: string): Promise<Message | undefined> {
    return undefined;
  }

  async getPrivateMessageHistory(
    _userID: string,
    _startMessageID: string,
    _count: number,
  ): Promise<Message[] | undefined> {
    return undefined;
  }

  async sendPrivateMessage(message: Message) {
    logger.info(`发送消息: ${message.rawMessage}`, this.id);
    // for (let i of message.message) {
    //   let messageText;
    //   let file;
    //   if (i.file) {
    //     file = await utils.fileType(i);
    //     if (Buffer.isBuffer(file.buffer)) {
    //       file.path = `${StdioAdapter.PATH}${file.name}`;
    //       await fs.writeFile(file.path, file.buffer);
    //       file.url = `${file.url}\n路径: ${logger.cyan(file.path)}\n网址: ${logger.green(await this.bot.fileToUrl(file))}`;
    //     }
    //   }

    //   switch (i.type) {
    //     case "text":
    //       if (i.toString().match("\n")) {
    //         logger.info(`发送文本: \n${i.toString()}`, StdioAdapter.ID);
    //         break;
    //       }
    //       logger.info(`发送文本: ${i.toString()}`, StdioAdapter.ID);
    //       break;
    //     case "image":
    //       if (file?.path) await this.catimg(file.path);
    //       logger.info(`发送图片: ${file?.url}`, StdioAdapter.ID);
    //       break;
    //     case "record":
    //       logger.info(`发送音频: ${file?.url}`, StdioAdapter.ID);
    //       break;
    //     case "video":
    //       logger.info(`发送视频: ${file?.url}`, StdioAdapter.ID);
    //       break;
    //     case "file":
    //       logger.info(`发送文件: ${file?.url}`, StdioAdapter.ID);
    //       break;
    //     case "reply":
    //       break;
    //     case "at":
    //       break;
    //     case "node":
    //       this.sendForwardMsg((msg: string) => this.sendMessage(msg), i.data);
    //       break;
    //     default:
    //       logger.info(i, StdioAdapter.ID);
    //   }
    // }
    return Date.now().toString(36);
  }

  async recallMessage(messageID: string) {
    logger.info(`撤回消息: ${messageID}`, this.id);
    return true;
  }

  async sendForwardMessage(send = this.sendPrivateMessage, messages: Message[]) {
    const messageIDs = [];
    for (const message of messages) messageIDs.push(await send(message));
    return messageIDs;
  }
}

export default StdioAdapter;
