import { type AddressInfo, Socket } from "node:net";
import http from "node:http";
import https from "node:https";
import fs from "node:fs/promises";

import Koa from "koa";
import bodyParser from "koa-bodyparser";
import WebSocket, { WebSocketServer } from "ws";

import legacyLogger, { getLogger } from "yuzai/logger";
import * as utils from "yuzai/utils";
import client from "yuzai/client";
import { getConfigFromFile, checkConfigFileExists, copyDefaultConfigFile } from "yuzai/config";
import type { ParsedUrlQuery } from "node:querystring";

const logger = getLogger("WebSocket");

interface WSConfig {
  readonly url: string;
  readonly port: number;
  readonly redirect: string;
  readonly auth: string;
  readonly https: {
    readonly enabled: boolean;
    readonly url: string;
    readonly port: string;
    readonly key: string;
    readonly cert: string;
  };
}
if (!checkConfigFileExists("ws")) copyDefaultConfigFile("ws", "extensions/ws/config/default.toml");
const config = getConfigFromFile<WSConfig>("ws") as WSConfig;

type WsHandler = (
  message: WebSocket.RawData,
  ws: WebSocket & { sendMessage: (data: object) => void },
) => void;

// 服务器状态
let serverListenTime = 0;
let serverUrl = "";

// Koa应用
const koaApp = new Koa();
// 设置中间件
koaApp.use(bodyParser());
koaApp.use(serverAuthWrapper);
koaApp.use(serverHandle);

// 重定向中间件
koaApp.use(async (ctx) => {
  ctx.redirect(config.redirect);
});

// WebSocket处理程序映射
const wsHandlers = new Map<
  string,
  {
    onConnectHandler: (ws: WebSocket & { sendMessage: (data: object) => void }) => WsHandler;
    wsHandler?: WsHandler | undefined;
  }
>();

// 跳过认证的路径
const skipAuthPaths: string[] = [];
// 静默日志路径
const quietPaths: string[] = [];

// HTTP服务器
const httpServer = http
  .createServer(koaApp.callback())
  .on("error", handleError)
  .on("upgrade", handleUpgrade);

// HTTPS服务器
let httpsServer: https.Server | undefined;

// WebSocket服务器
const wss = new WebSocketServer({ noServer: true });

// 服务器认证包装器
async function serverAuthWrapper(ctx: Koa.Context, next: Koa.Next) {
  if (await serverAuth(ctx)) {
    await next();
  } else {
    ctx.status = 401;
  }
}

// 服务器认证
async function serverAuth(ctx: Koa.Context): Promise<boolean> {
  // 设置远程ID和服务器ID
  ctx.remoteID = ctx.remoteID || `${ctx.ip}:${ctx.socket.remotePort}`;
  ctx.serverID =
    ctx.serverID || `${ctx.protocol}://${ctx.hostname}:${ctx.socket.localPort}${ctx.originalUrl}`;

  // 如果没有配置认证，直接通过
  if (!config.auth) return true;

  // 检查是否在跳过认证的路径中
  for (const path of skipAuthPaths) {
    if (ctx.originalUrl.startsWith(path)) return true;
  }

  // 检查认证信息
  if (ctx.headers["Authorization"] === config.auth) return true;

  // 认证失败，记录请求头
  const msg: {
    headers: http.IncomingHttpHeaders;
  } = { headers: ctx.headers };

  legacyLogger.error(
    ["HTTP", ctx.method, "请求鉴权失败", msg],
    `${ctx.serverID} <≠ ${ctx.remoteID}`,
  );

  return false;
}

// 服务器处理中间件
async function serverHandle(ctx: Koa.Context, next: Koa.Next) {
  let quiet = false;
  for (const path of quietPaths) {
    if (ctx.originalUrl.startsWith(path)) {
      quiet = true;
      break;
    }
  }

  const message: { headers: http.IncomingHttpHeaders; query?: ParsedUrlQuery; body?: unknown } = {
    headers: ctx.headers,
  };

  if (Object.keys(ctx.query).length) message.query = ctx.query;
  if (ctx.request.body && Object.keys(ctx.request.body).length) message.body = ctx.request.body;

  if (quiet) {
    legacyLogger.debug(["HTTP", ctx.method, "请求", message], `${ctx.serverID} <= ${ctx.remoteID}`);
  } else {
    legacyLogger.mark(["HTTP", ctx.method, "请求", message], `${ctx.serverID} <= ${ctx.remoteID}`);
  }

  await next();
}

// WebSocket连接处理
async function handleUpgrade(req: http.IncomingMessage, socket: Socket, head: Buffer) {
  const ctx = koaApp.createContext(req, new http.ServerResponse(req));

  // 设置远程ID和服务器ID
  const remoteID = `${req.socket.remoteAddress}:${req.socket.remotePort}-${req.headers["sec-websocket-key"]}`;
  const host =
    req.headers["x-forwarded-host"] ||
    req.headers["host"] ||
    `${req.socket.localAddress}:${req.socket.localPort}`;
  const serverID = `ws://${host}${req.url}`;

  // 解析查询参数
  const url = new URL(serverID);
  const query = Object.fromEntries(url.searchParams.entries());

  // 设置上下文属性
  ctx.remoteID = remoteID;
  ctx.serverID = serverID;
  ctx.query = query;

  // 认证检查
  if (!(await serverAuth(ctx))) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    return socket.destroy();
  }

  const message: { headers: http.IncomingHttpHeaders; query?: ParsedUrlQuery } = {
    headers: req.headers,
  };
  if (Object.keys(ctx.query).length) message.query = ctx.query;

  const path = req.url?.split("/")[1] || "";
  if (!wsHandlers.has(path)) {
    legacyLogger.error(
      ["WebSocket 处理器", path, "不存在", message],
      `${serverID} <≠> ${remoteID}`,
    );
    socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
    return socket.destroy();
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    Object.assign(ws, {
      sendMessage: (message: object) => {
        const rawMessage = JSON.stringify(message);
        legacyLogger.debug(["消息", message], `${serverID} => ${remoteID}`);
        return ws.send(rawMessage);
      },
    });

    const handler = wsHandlers.get(path);
    if (handler) {
      handler.wsHandler = handler.onConnectHandler(
        ws as WebSocket & { sendMessage: (data: object) => void },
      );
    }

    legacyLogger.mark(["建立连接", message], `${serverID} <=> ${remoteID}`);

    ws.on("error", (...args) => legacyLogger.error(args, `${serverID} <=> ${remoteID}`));

    ws.on("close", () => legacyLogger.mark("断开连接", `${serverID} <≠> ${remoteID}`));

    ws.on("message", (message) => {
      legacyLogger.debug(["消息", message], `${serverID} <= ${remoteID}`);

      const handler = wsHandlers.get(path);
      if (handler && handler.wsHandler) {
        handler.wsHandler(message, ws as WebSocket & { sendMessage: (data: object) => void });
      }
    });
  });
}

// 服务器错误处理
function handleError(err: NodeJS.ErrnoException) {
  switch (err.code as string) {
    case "EADDRINUSE":
      return serverEADDRINUSE(err, config.https.enabled);
    default:
      logger.error(err);
  }
}

// 处理EADDRINUSE错误
async function serverEADDRINUSE(err: NodeJS.ErrnoException, httpsEnabled: boolean) {
  const port = httpsEnabled ? config.https.port : config.port;
  logger.error(["监听端口", port, "错误", err]);

  if (httpsEnabled) return;

  try {
    const headers = new Headers();
    if (config.auth) {
      for (const [key, value] of Object.entries(config.auth)) {
        headers.set(key, value as string);
      }
    }

    await fetch(`http://localhost:${config.port}/exit`, {
      headers,
    });
  } catch {
    // 忽略错误
  }

  serverListenTime += 1;
  await utils.sleep(serverListenTime * 1000);
  httpServer.listen(config.port);
}

// 创建HTTPS服务器
async function createHttpsServer() {
  try {
    const [key, cert] = await Promise.all([
      fs.readFile(config.https.key),
      fs.readFile(config.https.cert),
    ]);

    const server = https
      .createServer(
        {
          key,
          cert,
        },
        koaApp.callback(),
      )
      .on("error", handleError)
      .on("upgrade", handleUpgrade);

    httpsServer = server;
    return true;
  } catch (err) {
    logger.error(["创建 https 服务器错误", err]);
    return false;
  }
}

// 加载服务器
async function loadServer(serverType: "http" | "https" = "http") {
  const server = serverType === "https" ? httpsServer : httpServer;
  if (!server) return false;

  const port = serverType === "https" ? config.https.port : config.port;

  return new Promise<boolean>((resolve) => {
    server.listen(port);

    server.once("listening", () => {
      const address = server.address() as AddressInfo;
      logger.mark([
        `启动 ${serverType} 服务器`,
        legacyLogger.green(`${serverType}://[${address.address}]:${address.port}`),
      ]);

      serverUrl = serverType === "https" && config.https.url ? config.https.url : config.url;

      resolve(true);
    });

    server.once("error", (err) => {
      logger.error([`${serverType} 服务器启动失败`, err.stack]);
      resolve(false);
    });
  });
}

// 添加WebSocket路径
function addWsPath(
  path: string,
  onConnectHandler: (ws: WebSocket & { sendMessage: (data: object) => void }) => WsHandler,
) {
  if (!wsHandlers.has(path)) {
    wsHandlers.set(path, { onConnectHandler });
  } else {
    logger.warn(`WebSocket ${path} 已存在`);
  }
}

// 初始化服务器
async function initServer() {
  // 加载HTTP服务器
  const httpSuccess = await loadServer("http");

  // 加载HTTPS服务器（如果启用）
  let httpsSuccess = false;
  if (config.https.enabled && config.https.key && config.https.cert) {
    const created = await createHttpsServer();
    if (created) {
      httpsSuccess = await loadServer("https");
    }
  }

  // 注册客户端就绪处理程序
  client.registerOnReadyHandler("WS", async () => {
    if (httpSuccess || httpsSuccess) {
      legacyLogger.info(
        `连接地址：${legacyLogger.blue(`${serverUrl.replace(/^http/, "ws")}/`)}${legacyLogger.cyan(`[${Array.from(wsHandlers.keys())}]`)}`,
        "WebSocket",
      );
    }
  });

  return httpSuccess || httpsSuccess;
}

await initServer();

// 导出API
export { addWsPath };
