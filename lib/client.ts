/**
 * @description 客户端，用来维护多个 bot 实例
 */
import { randomUUID, type UUID } from "crypto";
import { EventEmitter } from "events";

import Bot from "yuzai/bot";
import Adapter from "yuzai/adapter";
import Plugin from "yuzai/plugin";
import { loadPlugins, loadAdapters, packageTips } from "yuzai/loader";
import * as utils from "yuzai/utils";
import { getLogger } from "yuzai/logger";
import config from "yuzai/config";
import { autoImportExtensions } from "yuzai/extensions";

const logger = getLogger();

class Client extends EventEmitter {
  /** 所有 Bot 实例 */
  private _bots = new Map<UUID, Bot>();

  /** 适配器列表 */
  // @ts-expect-error TS6133 用于存储适配器
  private _adapters = new Map<string, typeof Adapter>();

  /** 插件列表 */
  private _plugins = new Map<string, Plugin>();

  /** 启动时间 */
  private _startTime?: number;

  /** 用于错误追踪的调用栈 */
  private _stack?: string;

  /** 就绪处理函数列表 */
  private _onReadyHandlers: { from: string; onReady: () => Promise<void> }[] = [];

  /** 注册就绪处理函数 */
  registerOnReadyHandler(from: string, onReady: () => Promise<void>) {
    this._onReadyHandlers.push({ from, onReady });
  }

  /** 需要等待退出的模块列表 */
  private _exitHandlers: { from: string; onExit: () => Promise<void> }[] = [];

  /**
   * 注册退出处理函数
   * @param from 需要等待退出的模块名称
   * @param onExit 退出处理函数
   */
  registerExitHandler(from: string, onExit: () => Promise<void>) {
    this._exitHandlers.push({ from, onExit });
  }

  /** 是否正在退出 */
  private _exiting = false;

  /** 保持客户端活跃的定时器 */
  private _keepAliveTimer?: NodeJS.Timeout;

  /**
   * 启动客户端
   */
  async run() {
    // 记录启动时间
    this._startTime = Date.now();
    // 监听 SIGHUP 和 SIGTERM 信号，退出进程
    for (const i of ["SIGHUP", "SIGTERM"]) process.on(i, () => client.gracefulExit());

    // 捕获未处理的错误
    for (const i of ["uncaughtException", "unhandledRejection"]) {
      process.on(i, (e) => {
        try {
          getLogger(i).error(e);
        } catch (err) {
          console.error(i, e, err);
          client.gracefulExit(process.exitCode);
        }
      });
    }

    // 退出事件
    process.on("exit", (code) => {
      const logger = getLogger("Exit");
      logger.mark(
        logger.magenta(
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- 启动时间一定存在
          `雨仔已停止运行，本次运行时长：${utils.getTimeDiff(this._startTime!)} (${code})`,
        ),
      );
      logger.trace(this._stack || Error().stack);
    });

    // 开始运行
    logger.mark("----^_^----");
    logger.mark(logger.yellow(`雨仔 v${config.system.version} 启动中...`));
    logger.mark(logger.cyan("https://github.com/Alex6357/yuzai"));

    Promise.allSettled([
      (this._plugins = (await loadPlugins()) || new Map()),
      (this._adapters = (await loadAdapters()) || new Map()),
      await autoImportExtensions(),
      packageTips(),
    ]).then(() => {
      for (const handler of this._onReadyHandlers) {
        handler.onReady();
      }
      logger.mark("全部加载完成！");
    });

    this.keepAlive();
  }

  /**
   * 优雅退出
   * @param code 退出码，可以是字符串或数字
   */
  gracefulExit(code?: string | number) {
    // 记录当前调用栈用于错误追踪
    this._stack = Error().stack;

    if (this._exiting) return;
    this._exiting = true;

    // 等待所有退出处理函数执行完毕
    Promise.allSettled(this._exitHandlers.map((handler) => handler.onExit())).then(() => {
      process.exit(code || 0);
    });

    // 设置 10 秒超时作为最后的退出保障
    // TODO 从配置文件读取
    utils.wait(10000).then(() => {
      clearInterval(this._keepAliveTimer);
      process.exit(code || 0);
    });
  }

  /**
   * 创建新的 Bot 实例
   * @param adapter 适配器实例
   */
  newBot(adapter: Adapter) {
    const UID = randomUUID();
    this._bots.set(UID, new Bot(UID, this._plugins, adapter));
  }

  /**
   * 保持客户端运行
   */
  private keepAlive() {
    this._keepAliveTimer = setInterval(() => {
      try {
        // 空操作
      } catch (err) {
        getLogger("KeepAliveTimer").error(err);
      }
    }, 0x7fffffff);
  }
}

const client = new Client();
export default client;
