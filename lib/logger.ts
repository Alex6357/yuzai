/* eslint-disable @typescript-eslint/no-explicit-any -- message 只要能转换成字符串 */
import fs from "node:fs";
import util from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

import toml from "toml";
import log4js from "log4js";
import chalk, { type ChalkInstance } from "chalk";

// 手动加载配置文件
// config 中使用了 logger，如果从 config 中加载，由于循环引用的初始化顺序会导致错误
const currentDir = path.dirname(fileURLToPath(import.meta.url));
if (!fs.existsSync(path.resolve(currentDir, "..", "logs")))
  fs.mkdirSync(path.resolve(currentDir, "..", "logs"));

function loadSystemConfig() {
  const configPath = path.resolve(currentDir, "..", "config", "system.toml");
  const defaultConfigPath = path.resolve(currentDir, "..", "config", "defaults", "system.toml");

  if (fs.existsSync(configPath)) {
    return toml.parse(fs.readFileSync(configPath, "utf-8"));
  } else if (fs.existsSync(defaultConfigPath)) {
    return toml.parse(fs.readFileSync(defaultConfigPath, "utf-8"));
  } else {
    throw new Error("无法找到 system.toml 配置文件，请检查项目完整性");
  }
}

const config = {
  system: loadSystemConfig(),
};

// 设置日志样式
log4js.configure({
  appenders: {
    console: {
      type: "console",
      layout: {
        type: "pattern",
        pattern: "%[[%d{hh:mm:ss.SSS}][%4.4p]%]%m",
      },
    },
    file: {
      type: "dateFile",
      filename: "logs/log",
      pattern: "yyyy-MM-dd.log",
      numBackups: 15,
      alwaysIncludePattern: true,
      layout: {
        type: "pattern",
        pattern: "[%d{hh:mm:ss.SSS}][%4.4p]%m",
        tokens: {
          message: (logEvent) => logEvent.data[0].replace(/\x1B\[\d+m/g, ""),
        },
      },
    },
    error: {
      type: "file",
      filename: "logs/error.log",
      alwaysIncludePattern: true,
      layout: {
        type: "pattern",
        pattern: "[%d{hh:mm:ss.SSS}][%4.4p]%m",
        tokens: {
          message: (logEvent) => logEvent.data[0].replace(/\x1B\[\d+m/g, ""),
        },
      },
    },
  },
  categories: {
    default: { appenders: ["console"], level: config.system.log.level },
    file: { appenders: ["console", "file"], level: "warn" },
    error: { appenders: ["console", "file", "error"], level: "error" },
  },
});

// 创建 log4js logger 实例
const consoleLogger = log4js.getLogger("default");
const fileLogger = log4js.getLogger("file");
const errorLogger = log4js.getLogger("error");

// 工具函数 - 对象转字符串
function objectToString(data: any, utilInspectOpts = config.system.log.object): string {
  if (typeof data === "string") {
    // 不做任何预处理
  } else if (!utilInspectOpts) {
    if (typeof data === "object" && typeof data.toString !== "function") {
      data = "[object null]";
    } else {
      data = String(data);
    }
  } else {
    if (typeof utilInspectOpts === "boolean") utilInspectOpts = {};
    data = util.inspect(data, {
      depth: 10,
      colors: true,
      showHidden: true,
      showProxy: true,
      getters: true,
      breakLength: 100,
      maxArrayLength: 100,
      maxStringLength: 1000,
      ...utilInspectOpts,
    });
  }

  const length = config.system.log.length;
  if (data.length > length) {
    data = `${data.slice(0, length)}${chalk.gray(`... ${data.length - length} more characters`)}`;
  }
  return data;
}

// 工具函数 - 生成日志消息
function makeLog(message: any, loggerName: string): string {
  const messages: string[] = [];
  messages.push(chalk.blue(`[${loggerName}]`));

  for (const item of Array.isArray(message) ? message : [message]) {
    messages.push(objectToString(item));
  }

  return messages.join(" ");
}

// 日志级别函数
function trace(message: any, loggerName: string): void {
  consoleLogger.trace(makeLog(message, loggerName));
}

function debug(message: any, loggerName: string): void {
  consoleLogger.debug(makeLog(message, loggerName));
}

function info(message: any, loggerName: string): void {
  consoleLogger.info(makeLog(message, loggerName));
}

function warn(message: any, loggerName: string): void {
  fileLogger.warn(makeLog(message, loggerName));
}

function error(message: any, loggerName: string): void {
  errorLogger.error(makeLog(message, loggerName));
}

function fatal(message: any, loggerName: string): void {
  errorLogger.fatal(makeLog(message, loggerName));
}

function mark(message: any, loggerName: string): void {
  fileLogger.mark(makeLog(message, loggerName));
}

// 通用日志函数
function log(
  type: "trace" | "debug" | "info" | "warn" | "error" | "fatal" | "mark",

  message: any,
  loggerName: string,
): void {
  const logFunction = {
    trace,
    debug,
    info,
    warn,
    error,
    fatal,
    mark,
  }[type];

  logFunction(message, loggerName);
}

// 定义 Logger 接口，扩展 Chalk 的方法
interface Logger {
  trace(message: any): void;
  debug(message: any): void;
  info(message: any): void;
  warn(message: any): void;
  error(message: any): void;
  fatal(message: any): void;
  mark(message: any): void;
  log(type: "trace" | "debug" | "info" | "warn" | "error" | "fatal" | "mark", message: any): void;
}

// 创建 logger 实例的工厂函数
function createLogger(loggerName?: string): Logger & ChalkInstance {
  const name = loggerName || "Yuzai";

  // 创建基础 logger 对象
  const baseLogger = {
    trace: (message: any) => trace(message, name),
    debug: (message: any) => debug(message, name),
    info: (message: any) => info(message, name),
    warn: (message: any) => warn(message, name),
    error: (message: any) => error(message, name),
    fatal: (message: any) => fatal(message, name),
    mark: (message: any) => mark(message, name),
    log: (type: "trace" | "debug" | "info" | "warn" | "error" | "fatal" | "mark", message: any) =>
      log(type, message, name),
  };

  // 创建 Proxy 来代理 chalk 方法
  const loggerProxy = new Proxy(baseLogger, {
    get(target, prop, receiver) {
      // 首先检查 baseLogger 是否有该属性
      if (prop in target) {
        return Reflect.get(target, prop, receiver);
      }

      // 如果没有，则从 chalk 中获取
      const chalkProp = (chalk as any)[prop];
      if (chalkProp !== undefined) {
        return typeof chalkProp === "function"
          ? (...args: any[]) => {
              const result = chalkProp.apply(chalk, args);
              return result;
            }
          : chalkProp;
      }

      // 如果 chalk 中也没有，返回 undefined
      return undefined;
    },
  }) as Logger & ChalkInstance;

  return loggerProxy;
}

// 缓存已创建的 logger 实例
const loggerCache = new Map<string, ReturnType<typeof createLogger>>();

// 主导出函数 - 获取或创建指定名称的 logger
export function getLogger(loggerName?: string) {
  const name = loggerName || "Yuzai";

  if (loggerCache.has(name)) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- 必存在
    return loggerCache.get(name)!;
  }

  const logger = createLogger(name);
  loggerCache.set(name, logger);
  return logger;
}

const logger = {
  trace: (message: any, loggerName = "Yuzai") => trace(message, loggerName),
  debug: (message: any, loggerName = "Yuzai") => debug(message, loggerName),
  info: (message: any, loggerName = "Yuzai") => info(message, loggerName),
  warn: (message: any, loggerName = "Yuzai") => warn(message, loggerName),
  error: (message: any, loggerName = "Yuzai") => error(message, loggerName),
  fatal: (message: any, loggerName = "Yuzai") => fatal(message, loggerName),
  mark: (message: any, loggerName = "Yuzai") => mark(message, loggerName),
  log: (
    type: "trace" | "debug" | "info" | "warn" | "error" | "fatal" | "mark",
    message: any,
    loggerName = "Yuzai",
  ) => log(type, message, loggerName),
};

const loggerProxy = new Proxy(logger, {
  get(target, prop, receiver) {
    if (prop in target) {
      return Reflect.get(target, prop, receiver);
    }
    const chalkProp = (chalk as any)[prop];
    if (chalkProp !== undefined) {
      return typeof chalkProp === "function"
        ? (...args: any[]) => {
            const result = chalkProp.apply(chalk, args);
            return result;
          }
        : chalkProp;
    }
    return undefined;
  },
}) as typeof logger & ChalkInstance;

export default loggerProxy;
