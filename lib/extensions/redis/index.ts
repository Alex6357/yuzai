import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

import { createClient, type RedisClientType } from "redis";

import config from "../../config.ts";
import logger from "../../logger.ts";
import * as utils from "../../utils.ts";
import client from "../../client.ts";

interface RedisOpts {
  socket: {
    host: string;
    port: number;
  };
  username: string;
  password: string;
  database: number;
}

class Redis {
  /** Redis 连接配置 */
  private _opts: RedisOpts;
  /** Redis 客户端实例 */
  private _redis: RedisClientType & {
    /** Redis 进程 */
    process?: ChildProcessWithoutNullStreams;
  };
  /** 是否在连接错误时退出程序 */
  private _exit_on_error: boolean;
  /** 连接状态锁 */
  private _lock = false;
  /** 连接错误记录 */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 错误是任意类型
  private _err: any;

  /** Redis 客户端实例 */
  get redis() {
    return this._redis;
  }

  /**
   * 初始化 Redis
   * @param opts Redis 连接配置
   * @param exit_on_error 是否在连接错误时退出程序
   */
  constructor(opts: RedisOpts, exit_on_error = true) {
    logger.info(
      `正在连接 ${logger.cyan(`redis://${opts.socket.host}:${opts.socket.port}/${opts.database}`)}`,
      "Redis",
    );
    this._opts = opts;
    this._redis = createClient(opts);
    this._exit_on_error = exit_on_error;
  }

  /**
   * 连接到Redis服务器
   * @param force - 是否强制连接，默认为 false
   * @returns 连接成功返回 RedisClientType 实例，否则返回 undefined
   */
  async connect(force = false): Promise<RedisClientType | undefined> {
    // 如果已经锁定且不强制连接，则直接返回
    if (this._lock && !force) return;
    // 锁定连接状态
    this._lock = true;

    try {
      // 尝试连接到Redis服务器
      await this._redis.connect();
    } catch (err) {
      // 如果连接失败，断开连接
      this._redis.destroy();
      this._err = err;
      // 如果不强制连接，尝试启动Redis服务器
      if (!force) return this.start();
      return;
    }

    // 尝试ping Redis服务器，最多重试15次
    for (let i = 0; i < 15; i++) {
      try {
        const id = Date.now().toString(36);
        // 如果ping成功，跳出循环
        if ((await this._redis.ping(id)) === id) break;
      } catch (err) {
        // 如果ping失败，记录错误
        logger.error(err, "Redis");
      }
      // 等待1秒后重试
      await utils.wait(1000);
    }

    // 解锁连接状态
    this._lock = false;
    // 监听Redis错误事件
    return this._redis.once("error", this.onerror);
  }

  /**
   * 启动Redis服务器
   * @returns 如果启动成功返回 RedisClientType 实例，否则返回 undefined
   */
  async start(): Promise<RedisClientType | undefined> {
    // 如果连接地址不是本地地址，记录错误并退出
    if (this._opts.socket.host !== "127.0.0.1") {
      logger.error([`连接错误，请确认连接地址正确`, this._err], "Redis");
      if (this._exit_on_error) client.gracefulExit(1);
      return;
    }

    // 构建启动Redis服务器的命令
    const cmd = [
      config.system.redis.path,
      "--port",
      String(this._opts.socket.port),
      ...(await this.aarch64()),
    ];

    logger.info(["正在启动", logger.cyan(cmd.join(" "))], "Redis");

    let exit = false;
    // 启动Redis服务器
    const redisProcess = spawn(cmd[0], cmd.slice(1))
      // 监听错误事件
      .on("error", (err) => {
        logger.error(["启动错误", err], "Redis");
        exit = true;
      })
      // 监听退出事件
      .on("exit", () => (exit = true));

    // 监听标准输出
    redisProcess.stdout.on("data", (data) => {
      logger.info(String(data).trim(), "Redis");
    });

    // 监听标准错误输出
    redisProcess.stderr.on("data", (data) => {
      logger.error(String(data).trim(), "Redis");
    });
    // 保存Redis进程
    this._redis.process = redisProcess;

    // 尝试连接到Redis服务器，最多重试15次
    for (let i = 0; i < 15; i++) {
      await utils.wait(1000);
      if (exit) break;
      const ret = await this.connect(true);
      if (ret) return ret;
    }

    // 如果连接失败，记录错误并退出
    logger.error(["连接错误", this._err], "Redis");
    redisProcess.kill();
    if (this._exit_on_error) process.exit(1);
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 错误是任意类型
  private onerror = async (err: any) => {
    logger.error(err, "Redis");
    this._redis.destroy();
    if (this._redis.process) this._redis.process.kill();
    return this.connect();
  };

  /**
   * 检查当前系统是否为ARM64架构，并根据Redis版本决定是否添加特定参数
   * @returns 如果当前系统为ARM64且Redis版本大于等于6.0，则返回包含忽略警告参数的数组，否则返回空数组
   */
  private async aarch64() {
    if (process.platform === "win32" || process.arch !== "arm64") return [];
    // 判断redis版本
    const v = await utils.exec("redis-server -v");
    if (v.stdout?.match) {
      const outStr = v.stdout.match(/v=(\d)./);
      // 忽略arm警告
      if (outStr && Number(outStr[1]) >= 6) return ["--ignore-warnings", "ARM64-COW-BUG"];
    }
    return [];
  }
}

// 初始化全局redis客户端
const rc = config.system.redis;
const redis = new Redis({
  socket: {
    host: rc.host,
    port: rc.port,
  },
  username: rc.username,
  password: rc.password,
  database: rc.db,
});
await redis.connect();

// 注册退出处理函数
client.registerExitHandler("Redis", async () => {
  try {
    // 断开 Redis 连接
    redisClient.destroy();
    logger.info("Redis 连接已关闭", "Redis");
    // 终止子进程
    if (redisClient.process) {
      redisClient.process.kill();
      logger.info("Redis 进程已终止", "Redis");
    }
  } catch (err) {
    logger.error(["关闭 Redis 连接时出错", err], "Redis");
  }
});

const redisClient = redis?.redis;
export default redisClient;
