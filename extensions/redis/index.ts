import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

import { createClient, type RedisClientType } from "redis";

import { checkConfigFileExists, getConfigFromFile, copyDefaultConfigFile } from "yuzai/config";
import { getLogger } from "yuzai/logger";
import * as utils from "yuzai/utils";
import client from "yuzai/client";

const logger = getLogger("Redis");

interface RedisConfig {
  readonly path: string;
  readonly host: string;
  readonly port: number;
  readonly username: string;
  readonly password: string;
  readonly database: number;
  readonly exitOnError: boolean;
}
export const _pannelConfig = [
  {
    id: "path",
    type: "string",
    label: "文件路径",
    description: "Redis 数据库可执行文件的绝对路径",
  },
  {
    id: "host",
    type: "string",
    label: "主机地址",
    description: "Redis 服务器的主机地址",
  },
  {
    id: "port",
    type: "number",
    label: "端口号",
    description: "Redis 监听的端口号",
  },
  {
    id: "username",
    type: "string",
    label: "用户名",
    description: "Redis 用户名",
  },
  {
    id: "password",
    type: "string",
    label: "密码",
    description: "Redis 密码",
  },
  {
    id: "database",
    type: "number",
    label: "数据库索引",
    description: "Redis 数据库索引",
  },
  {
    id: "exitOnError",
    type: "boolean",
    label: "错误时退出",
    description: "Redis 连接错误时是否退出进程",
  },
];
if (!checkConfigFileExists("redis"))
  copyDefaultConfigFile("redis", "extensions/redis/config/default.toml");
const redisConfig = getConfigFromFile<RedisConfig>("redis") as RedisConfig;

// 连接状态锁
let lock = false;
// 连接错误记录
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 错误是任意类型
let error: any;

/**
 * 连接到Redis服务器
 * @param force - 是否强制连接，默认为 false
 * @returns 连接成功返回 RedisClientType 实例，否则返回 undefined
 */
async function connect(force = false): Promise<RedisClientType | undefined> {
  // 如果已经锁定且不强制连接，则直接返回
  if (lock && !force) return;
  // 锁定连接状态
  lock = true;

  try {
    // 尝试连接到Redis服务器
    await redisClient.connect();
  } catch (err) {
    // 如果连接失败，断开连接
    redisClient.destroy();
    error = err;
    // 如果不强制连接，尝试启动Redis服务器
    if (!force) return start();
    return;
  }

  // 尝试ping Redis服务器，最多重试15次
  for (let i = 0; i < 15; i++) {
    try {
      const id = Date.now().toString(36);
      // 如果ping成功，跳出循环
      if ((await redisClient.ping(id)) === id) break;
    } catch (err) {
      // 如果ping失败，记录错误
      logger.error(err);
    }
    // 等待1秒后重试
    await utils.wait(1000);
  }

  // 解锁连接状态
  lock = false;
  // 监听Redis错误事件
  return redisClient.once("error", (err) => {
    logger.error(err);
    redisClient.destroy();
    if (redisClient.process) redisClient.process.kill();
    return connect();
  });
}

/**
 * 启动Redis服务器
 * @returns 如果启动成功返回 RedisClientType 实例，否则返回 undefined
 */
async function start(): Promise<RedisClientType | undefined> {
  // 如果连接地址不是本地地址，记录错误并退出
  if (redisConfig.host !== "127.0.0.1") {
    logger.error([`连接错误，请确认连接地址正确`, error]);
    if (redisConfig.exitOnError) client.gracefulExit(1);
    return;
  }

  // 构建启动Redis服务器的命令
  const cmd = [redisConfig.path, "--port", redisConfig.port.toString(), ...(await aarch64())];

  logger.info(["正在启动", logger.cyan(cmd.join(" "))]);

  let exit = false;
  // 启动Redis服务器
  const redisProcess = spawn(cmd[0], cmd.slice(1))
    // 监听错误事件
    .on("error", (err) => {
      logger.error(["启动错误", err]);
      exit = true;
    })
    // 监听退出事件
    .on("exit", () => (exit = true));

  // 监听标准输出
  redisProcess.stdout.on("data", (data) => {
    logger.info(String(data).trim());
  });

  // 监听标准错误输出
  redisProcess.stderr.on("data", (data) => {
    logger.error(String(data).trim());
  });
  // 保存Redis进程
  redisClient.process = redisProcess;

  // 尝试连接到Redis服务器，最多重试15次
  for (let i = 0; i < 15; i++) {
    await utils.wait(1000);
    if (exit) break;
    const ret = await connect(true);
    if (ret) return ret;
  }

  // 如果连接失败，记录错误并退出
  logger.error(["连接错误", error]);
  redisProcess.kill();
  if (redisConfig.exitOnError) process.exit(1);
  return;
}

/**
 * 检查当前系统是否为ARM64架构，并根据Redis版本决定是否添加特定参数
 * @returns 如果当前系统为ARM64且Redis版本大于等于6.0，则返回包含忽略警告参数的数组，否则返回空数组
 */
const aarch64 = async () => {
  if (process.platform === "win32" || process.arch !== "arm64") return [];
  // 判断redis版本
  const v = await utils.exec("redis-server -v");
  if (v.stdout?.match) {
    const outStr = v.stdout.match(/v=(\d)./);
    // 忽略arm警告
    if (outStr && Number(outStr[1]) >= 6) return ["--ignore-warnings", "ARM64-COW-BUG"];
  }
  return [];
};

logger.info(
  `正在连接 ${logger.cyan(`redis://${redisConfig.host}:${redisConfig.port}/${redisConfig.database}`)}`,
);

// Redis 客户端实例
const redisClient: RedisClientType & {
  /** Redis 进程 */
  process?: ChildProcessWithoutNullStreams;
} = createClient({
  socket: {
    host: redisConfig.host,
    port: redisConfig.port,
  },
  username: redisConfig.username,
  password: redisConfig.password,
  database: redisConfig.database,
});

// 初始化全局redis客户端
await connect();

// 注册退出处理函数
client.registerExitHandler("Redis", async () => {
  try {
    // 断开 Redis 连接
    redisClient.destroy();
    logger.info("Redis 连接已关闭");
    // 终止子进程
    if (redisClient.process) {
      redisClient.process.kill();
      logger.info("Redis 进程已终止");
    }
  } catch (err) {
    logger.error(["关闭 Redis 连接时出错", err]);
  }
});

export default redisClient;
