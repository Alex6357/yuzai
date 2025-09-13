/**
 * 正常来说，Yuzai 不关心 Adapter 的具体实现，因此 Adapter 应该自己维护 WebSocket 服务器。\
 * 但鉴于反向 WebSocket 在各种协议中非常常见，以及出于兼容性考虑，这里以本体插件的形式提供一个反向 WebSocket 服务器。
 *
 * 适配器注册的流程为：
 * 1. 调用 `WS.addPath(path, onConnectHandler)`，注册一个 WebSocket 路径和连接处理函数。
 * 2. WebSocketServer 会在收到 WebSocket 升级请求时调用 `onConnectHandler`，并传递 WebSocket 实例，适配器应保存该实例。
 * 3. `onConnectHandler` 应返回一个处理函数 `wsHandler`，WS 会在收到消息时调用该函数，并传递消息和 WebSocket 实例。
 * 4. 适配器可以在 wsHandler 中处理消息，并通过 WebSocket 实例的 `sendMessage()` 方法发送消息。
 *
 * 相关方法类型注释如下：
 * ```typescript
 * type wsHandler = (message: WebSocket.RawData, ws: WebSocket & { sendMessage: (data: object) => void }) => void;
 * type onConnectHandler = (ws: WebSocket & { sendMessage: (data: object) => void }, path: string) => wsHandler;
 * type addPath = (path: string, onConnectHandler: onConnectHandler) => void;
 * ```
 * 传递给适配器的 WebSocket 实例包含包装日志后的 `sendMessage()` 方法，建议用此发送消息。
 *
 * 可以参考 `src/adapters/OneBotv11.ts` 中的实现。
 */

import { type AddressInfo, Socket } from "node:net";
import express, { type Request } from "express";
import http from "node:http";
import fs from "node:fs/promises";

import WebSocket, { WebSocketServer } from "ws";

import logger from "../logger.ts";
import config from "../config.ts";
import * as utils from "../utils.ts";
import client from "../client.ts";

type wsHandler = (
  message: WebSocket.RawData,
  ws: WebSocket & { sendMessage: (data: object) => void },
) => void;

class WS {
  /** 服务器尝试监听的次数 */
  protected _serverListenTime = 0;
  /** 服务器尝试监听的次数 */
  get serverListenTime() {
    return this._serverListenTime;
  }

  /** 服务器地址 */
  protected _url = "";
  /** 服务器地址 */
  get url() {
    return this._url;
  }

  /** express Web 应用框架，添加一系列中间件 */
  protected readonly expressApp = Object.assign(express(), {
    skipAuth: [] as string[],
    quiet: [] as string[],
  })
    .use(this.serverAuthWrapper)
    .use("/status", this.serverStatus)
    .use(express.urlencoded({ extended: false }))
    .use(express.json())
    .use(express.raw())
    .use(express.text())
    .use(this.serverHandle)
    .use("/exit", this.serverExit)
    .use("/File", this.fileSend)
    .use((req) => req.res?.redirect(config.system.server.redirect));

  /** http 服务器 */
  protected readonly httpServer: http.Server = http
    .createServer(this.expressApp)
    .on("error", this.serverErrorHandler.bind(this))
    .on("upgrade", this.wsConnect.bind(this));

  /** https 服务器 */
  protected _httpsServer?: http.Server;
  /** https 服务器 */
  protected get httpsServer() {
    return this._httpsServer;
  }

  /** WebSocketServer */
  protected readonly wss = new WebSocketServer({ noServer: true });

  /**
   * 存储由 Adapter 注册的 WebSocket 处理函数
   *
   * key: 监听的 ws 路径\
   * value: 处理函数
   */
  protected _wsHandlers = new Map<
    string,
    {
      onConnectHandler: (ws: WebSocket & { sendMessage: (data: object) => void }) => wsHandler;
      wsHandler?: wsHandler | undefined;
    }
  >();
  /**
   * 存储由 Adapter 注册的 WebSocket 处理函数
   *
   * key: 监听的 ws 路径\
   * value: 处理函数
   */
  protected get wsHandlers() {
    return this._wsHandlers;
  }

  /**
   * 初始化服务器
   */
  async init() {
    await this.loadServer("http");
    if (
      config.system.server.https.enabled &&
      config.system.server.https.key &&
      config.system.server.https.cert
    ) {
      await this.createHttpsServer();
      await this.loadServer("https");
    }
    client.registerOnReadyHandler("WS", async () => {
      logger.info(
        `连接地址：${logger.blue(`${this.url.replace(/^http/, "ws")}/`)}${logger.cyan(`[${Array.from(this.wsHandlers.keys())}]`)}`,
        "WebSocket",
      );
    });
  }

  /**
   * 创建 https 服务器
   */
  protected async createHttpsServer() {
    try {
      // 读取 https 证书和密钥文件
      const key = await fs.readFile(config.system.server.https.key);
      const cert = await fs.readFile(config.system.server.https.cert);
      // 创建 https 服务器
      const server = (await import("node:https"))
        .createServer(
          {
            key,
            cert,
          },
          this.expressApp,
        )
        // 监听服务器错误事件
        .on("error", this.serverErrorHandler)
        // 监听 WebSocket 升级事件
        .on("upgrade", this.wsConnect);
      // 加载 https 服务器
      this.loadServer("https");
      this._httpsServer = server;
    } catch (err) {
      // 记录创建 https 服务器错误日志
      logger.error(["创建 https 服务器错误", err], "Server");
    }
  }

  /**
   * 加载 http 服务器
   * @param serverType - 加载的服务器类型，默认为 "http"
   */
  protected async loadServer(serverType: "http" | "https" = "http") {
    // 根据是否启用HTTPS选择服务器类型
    const server = serverType === "https" ? this.httpsServer : this.httpServer;
    if (!server) return;
    // 启动服务器并监听指定端口
    server.listen(
      serverType === "https" ? config.system.server.https.port : config.system.server.port,
    );
    try {
      // 等待服务器监听事件或错误事件
      await new Promise<void>((resolve, reject) => {
        server.once("listening", resolve);
        server.once("error", reject);
        return () => {
          server.off("listening", resolve);
          server.off("error", reject);
        };
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 错误是任意类型
    } catch (error: any) {
      logger.error([`${serverType} 服务器启动失败`, error.stack], "Server");
      // 如果发生错误，返回
      return;
    }
    // 获取服务器地址和端口
    const { address, port } = server.address() as AddressInfo;
    // 记录服务器启动信息
    logger.mark(
      [`启动 ${serverType} 服务器`, logger.green(`${serverType}://[${address}]:${port}`)],
      "Server",
    );
    // 设置服务器URL
    this._url =
      (serverType === "https" && config.system.server.https.url) || config.system.server.url;
  }

  /**
   * 由于 wsConnect 中用到了 serverAuth，需要返回 boolean，而中间件不应该返回任何东西，因此用此函数包装 serverAuth
   * @param req express 请求对象与额外信息 @see wsHandler
   */
  protected serverAuthWrapper(
    req: Request & {
      remoteID?: string;
      serverID?: string;
    },
  ) {
    if (this.serverAuth(req)) {
      req.next?.();
    }
  }

  /**
   * 服务器认证中间件
   * @param req - Express 请求对象与额外信息 @see wsHandler
   * @returns 是否认证成功
   */
  protected serverAuth(
    req: Request & {
      remoteID?: string;
      serverID?: string;
    },
  ) {
    // 如果请求中没有 remoteID，则生成一个
    req.remoteID ??= `${req.ip}:${req.socket.remotePort}`;
    // 如果请求中没有 serverID，则生成一个
    req.serverID ??= `${req.protocol}://${req.hostname}:${req.socket.localPort}${req.originalUrl}`;
    // 如果没有配置认证或者认证配置为空，则直接调用下一个中间件
    if (!config.system.server.auth || !Object.keys(config.system.server.auth).length) return true;
    // 检查请求的 URL 是否在 skipAuth 列表中，如果是，则直接调用下一个中间件
    for (const i of this.expressApp.skipAuth || []) if (req.originalUrl.startsWith(i)) return true;
    // 遍历认证配置，检查请求头或查询参数中是否包含认证信息
    for (const i in config.system.server.auth) {
      // 如果请求头或查询参数中的认证信息与配置中的一致，则继续下一个认证项
      if (
        req.headers[i.toLowerCase()] === config.system.server.auth[i] ||
        req.query[i] === config.system.server.auth[i]
      )
        continue;
      // 如果认证失败，返回 401 状态码
      req.res?.sendStatus(401);
      // 构建错误信息对象
      const msg: {
        headers: http.IncomingHttpHeaders;
        query?: typeof req.query;
      } = { headers: req.headers };
      // 如果请求中有查询参数，则添加到错误信息对象中
      if (Object.keys(req.query).length) msg.query = req.query;
      // 记录错误日志
      logger.error(
        ["HTTP", req.method, "请求", i, "鉴权失败", msg],
        `${req.serverID} <≠ ${req.remoteID}`,
        true,
      );
      // 返回，认证失败
      return false;
    }
    // 如果所有认证项都通过，则调用下一个中间件
    return true;
  }

  /**
   * 服务器状态中间件
   * @param req - Express 请求对象与额外信息 @see wsHandler
   */
  protected serverStatus(
    req: Request & {
      remoteID?: string;
      serverID?: string;
    },
  ) {
    req.res?.type("json");
    req.res?.send(
      JSON.stringify({
        ...process,
        memory: process.memoryUsage(),
      }).replace(
        /(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)/g,
        "[IPv4]",
      ),
    );
  }

  /**
   * 服务器请求中间件
   * @param req - Express 请求对象与额外信息 @see wsHandler
   */
  protected serverHandle(
    req: Request & {
      remoteID?: string;
      serverID?: string;
    },
  ) {
    let quiet = false;
    for (const i of this.expressApp.quiet)
      if (req.originalUrl.startsWith(i)) {
        quiet = true;
        break;
      }
    const msg: {
      headers: http.IncomingHttpHeaders;
      query?: typeof req.query;
      body?: typeof req.body;
    } = { headers: req.headers };
    if (Object.keys(req.query).length) msg.query = req.query;
    if (Object.keys(req.body).length) msg.body = req.body;
    // TODO 感觉不应该在这判断
    if (quiet) {
      logger.debug(["HTTP", req.method, "请求", msg], `${req.serverID} <= ${req.remoteID}`, true);
    } else {
      logger.mark(["HTTP", req.method, "请求", msg], `${req.serverID} <= ${req.remoteID}`, true);
    }
    req.next?.();
  }

  /**
   * 退出服务器中间件
   * @param req - Express 请求对象与额外信息 @see wsHandler
   */
  protected async serverExit(
    req: Request & {
      rid?: string;
      sid?: string;
    },
  ) {
    if (req.ip !== "::1" && req.ip !== "::ffff:127.0.0.1" && req.hostname !== "localhost") return;
    if (process.env.app_type === "pm2") await utils.exec("pnpm stop");
    client.gracefulExit(1);
  }

  /* TODO
   * 这里涉及到原版 Yuzai 对文件的处理，由 fileToUrl 创建一个临时的 file 的 Buffer，通过 fs[fileName].buffer 获取
   * 这里暂时对这个请求发送 404
   */
  //   protected _fs: any = new Object();

  //   protected fileSend(
  //     req: Request & {
  //       remoteID?: string;
  //       serverID?: string;
  //     }
  //   ) {
  //     const url = req.url.replace(/^\//, "");
  //     let file = this._fs[url] || this._fs[404];
  //     if (typeof file.times === "number") {
  //       if (file.times > 0) file.times--;
  //       else file = this._fs.timeout;
  //     }
  //     if (file.type?.mime) req.res?.setHeader("Content-Type", file.type.mime);
  //     logger.mark(
  //       `发送文件：${file.name}(${file.url} ${(file.buffer.length / 1024).toFixed(2)}KB)`,
  //       `${req.serverID} => ${req.remoteID}`,
  //       true
  //     );
  //     req.res?.send(file.buffer);
  //   }
  /**
   * 发送文件的中间件
   * @param req - Express 请求对象与额外信息 @see wsHandler
   */
  protected fileSend(
    req: Request & {
      remoteID?: string;
      serverID?: string;
    },
  ) {
    fs.readFile(config.rootDir + "/404.jpg").then((buffer) => {
      req.res?.setHeader("Content-Type", "image/jpeg");
      logger.info(
        `发送文件：404.jpg (404.jpg ${(buffer.length / 1024).toFixed(2)}KB)`,
        `${req.serverID} => ${req.remoteID}`,
        true,
      );
      req.res?.send(buffer);
    });
  }

  /**
   * 处理 WebSocket 连接
   * @param req - Express 请求对象与额外信息 @see wsHandler
   * @param socket - 客户端 Socket 对象
   * @param head - 客户端请求头
   */
  protected wsConnect(
    req: Request & {
      remoteID?: string;
      serverID?: string;
    },
    socket: Socket,
    head: Buffer,
  ) {
    req.remoteID = `${req.socket.remoteAddress}:${req.socket.remotePort}-${req.headers["sec-websocket-key"]}`;
    req.serverID = `ws://${req.headers["x-forwarded-host"] || req.headers["host"] || `${req.socket.localAddress}:${req.socket.localPort}`}${req.url}`;
    req.query = Object.fromEntries(new URL(req.serverID).searchParams.entries());
    if (this.serverAuth(req) === false) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      return socket.destroy();
    }
    const message: {
      headers: http.IncomingHttpHeaders;
      query?: typeof req.query;
    } = { headers: req.headers };
    if (Object.keys(req.query).length) message.query = req.query;
    const path = req.url.split("/")[1];
    if (!this.wsHandlers.has(path)) {
      logger.error(
        ["WebSocket 处理器", path, "不存在", message],
        `${req.serverID} <≠> ${req.remoteID}`,
        true,
      );
      socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
      return socket.destroy();
    }
    this.wss.handleUpgrade(req, socket, head, (ws) => {
      Object.assign(ws, {
        sendMessage: (message: object) => {
          const rawMessage = JSON.stringify(message);
          logger.debug(["消息", message], `${req.serverID} => ${req.remoteID}`, true);
          return ws.send(rawMessage);
        },
      });
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- 必然存在
      this.wsHandlers.get(path)!.wsHandler = this.wsHandlers
        .get(path)
        ?.onConnectHandler?.(ws as WebSocket & { sendMessage: (data: object) => void });
      logger.mark(["建立连接", message], `${req.serverID} <=> ${req.remoteID}`, true);
      ws.on("error", (...args) => logger.error(args, `${req.serverID} <=> ${req.remoteID}`, true));
      ws.on("close", () => logger.mark("断开连接", `${req.serverID} <≠> ${req.remoteID}`, true));
      ws.on("message", (message) => {
        logger.debug(["消息", message], `${req.serverID} <= ${req.remoteID}`, true);
        this.wsHandlers
          .get(path)
          ?.wsHandler?.(message, ws as WebSocket & { sendMessage: (data: object) => void });
      });
    });
  }

  /**
   * 添加 WebSocket 路径和连接处理函数
   * @param path WebSocket 路径
   * @param onConnectHandler 连接处理函数
   */
  addPath(
    path: string,
    onConnectHandler: (ws: WebSocket & { sendMessage: (data: object) => void }) => wsHandler,
  ) {
    if (!this.wsHandlers.has(path)) {
      this.wsHandlers.set(path, { onConnectHandler });
    } else {
      logger.warn(`WebSocket ${path} 已存在`, "Server");
    }
  }

  /**
   * 处理服务器错误
   * @param err 错误信息
   */

  protected serverErrorHandler(err: NodeJS.ErrnoException) {
    // TODO 只能是 any 吗
    switch (err.code as string) {
      case "EADDRINUSE":
        return this.serverEADDRINUSE(err, config.system.server.https.enabled);
      default:
        logger.error(err, "Server");
    }
  }

  /**
   * 处理 EADDRINUSE 错误
   * @param err 错误信息
   * @param https 是否启用 HTTPS 服务器
   */
  protected async serverEADDRINUSE(err: NodeJS.ErrnoException, https: boolean) {
    logger.error(
      [
        "监听端口",
        https ? config.system.server.https.port : config.system.server.port,
        "错误",
        err,
      ],
      "Server",
    );
    if (https) return;
    try {
      const headers = new Headers();
      if (config.system.server.auth) {
        for (const header of config.system.server.auth) {
          const [key, value] = header.split(":");
          if (key && value) {
            headers.set(key.trim(), value.trim());
          }
        }
      }
      await fetch(`http://localhost:${config.system.server.port}/exit`, {
        headers: headers,
      });
    } catch {
      // 不进行操作
    }
    this._serverListenTime += 1;
    await utils.sleep(this._serverListenTime * 1000);
    this.httpServer.listen(config.system.server.port);
  }
}

const ws = new WS();
await ws.init();
export default ws;
