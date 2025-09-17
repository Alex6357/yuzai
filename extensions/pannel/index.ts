import express from "express";
import fs from "node:fs";
import https from "node:https";

import { getConfigFromFile, checkConfigFileExists, copyDefaultConfigFile } from "yuzai/config";
import { getLogger } from "yuzai/logger";

const logger = getLogger("pannel");

interface PannelConfig {
  readonly host: string;
  readonly port: number;
  readonly https: {
    readonly enabled: boolean;
    readonly host: string;
    readonly port: number;
    readonly cert: string;
    readonly key: string;
  };
}
if (!checkConfigFileExists("pannel"))
  copyDefaultConfigFile("pannel", "extensions/pannel/config/default.toml");
const pannelConfig = getConfigFromFile<PannelConfig>("pannel") as PannelConfig;

// 创建 Express 应用
const app = express();

// 尝试加载SvelteKit构建的中间件
try {
  const svelteKitMiddleware = await import("./build/handler.js");
  app.use(svelteKitMiddleware.handler);
} catch (error) {
  logger.error(["前端面板中间件加载失败:", error]);
  // 如果中间件加载失败，提供一个简单的响应
  app.use(async (ctx) => {
    ctx.body = "面板服务器正在运行，但SvelteKit前端不可用";
  });
}

// 启动HTTP服务器
const port = pannelConfig.port || 2540;
const host = pannelConfig.host || "localhost";

app.listen(port, host, () => {
  logger.mark(`面板服务器地址：${logger.magenta(`http://${host}:${port}`)}`);
});

// 按需启动HTTPS服务器
if (pannelConfig.https?.enabled) {
  try {
    const options = {
      key: fs.readFileSync(pannelConfig.https.key),
      cert: fs.readFileSync(pannelConfig.https.cert),
    };

    const httpsServer = https.createServer(options, app);
    const httpsPort = pannelConfig.https.port || 2541;
    const httpsHost = pannelConfig.https.host || "localhost";

    httpsServer.listen(httpsPort, httpsHost, () => {
      logger.mark(`面板HTTPS服务器地址：${logger.magenta(`https://${httpsHost}:${httpsPort}`)}`);
    });
  } catch (error) {
    logger.error(["HTTPS服务器启动失败:", error]);
  }
}
