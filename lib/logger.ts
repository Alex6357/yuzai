import fs from "node:fs";
import util from "node:util";

import log4js from "log4js";
import chalk from "chalk";

import config from "yuzai/config";

if (!fs.existsSync("logs")) fs.mkdirSync("logs");

// 设置日志样式
log4js.configure({
  /**
   * appenders 定义日志的输出方式，也就是输出到哪里
   * console：控制台输出
   * file：输出到 logs 文件夹
   * error：输出到 logs/error.log 文件
   */
  appenders: {
    console: {
      type: "console",
      layout: {
        type: "pattern",
        pattern: "%[[%d{hh:mm:ss.SSS}][%4.4p]%]%m",
      },
    },
    file: {
      type: "dateFile", // 可以是console,dateFile,file,Logstash等
      filename: "logs/log", // 将会按照filename和pattern拼接文件名
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
  /**
   * categories 定义了日志的分类，指定了日志的输出方式和日志的等级
   * default：默认日志，输出到 console，最小级别从配置文件读取
   * file：命令日志，输出到 console 和 file，最小级别是 warn
   * error：错误日志，输出到 console、file 和 error，最小级别是 error
   */
  categories: {
    default: { appenders: ["console"], level: config.system.log.level },
    file: { appenders: ["console", "file"], level: "warn" },
    error: { appenders: ["console", "file", "error"], level: "error" },
  },
});

class Logger {
  // consoleLogger 输出到 console
  // fileLogger 输出到 file 和 console
  // errorLogger 输出到 error，file 和 console
  private consoleLogger;
  private fileLogger;
  private errorLogger;

  // chalk
  rgb = chalk.rgb;
  hex = chalk.hex;
  ansi256 = chalk.ansi256;
  bgRgb = chalk.bgRgb;
  bgHex = chalk.bgHex;
  bgAnsi256 = chalk.bgAnsi256;
  readonly reset = chalk.reset;
  readonly bold = chalk.bold;
  readonly dim = chalk.dim;
  readonly italic = chalk.italic;
  readonly underline = chalk.underline;
  readonly overline = chalk.overline;
  readonly inverse = chalk.inverse;
  readonly hidden = chalk.hidden;
  readonly strikethrough = chalk.strikethrough;
  readonly visible = chalk.visible;
  readonly black = chalk.black;
  readonly red = chalk.red;
  readonly green = chalk.green;
  readonly yellow = chalk.yellow;
  readonly blue = chalk.blue;
  readonly magenta = chalk.magenta;
  readonly cyan = chalk.cyan;
  readonly white = chalk.white;
  readonly gray = chalk.gray;
  readonly grey = chalk.grey;
  readonly blackBright = chalk.blackBright;
  readonly redBright = chalk.redBright;
  readonly greenBright = chalk.greenBright;
  readonly yellowBright = chalk.yellowBright;
  readonly blueBright = chalk.blueBright;
  readonly magentaBright = chalk.magentaBright;
  readonly cyanBright = chalk.cyanBright;
  readonly whiteBright = chalk.whiteBright;
  readonly bgBlack = chalk.bgBlack;
  readonly bgRed = chalk.bgRed;
  readonly bgGreen = chalk.bgGreen;
  readonly bgYellow = chalk.bgYellow;
  readonly bgBlue = chalk.bgBlue;
  readonly bgMagenta = chalk.bgMagenta;
  readonly bgCyan = chalk.bgCyan;
  readonly bgWhite = chalk.bgWhite;
  readonly bgGray = chalk.bgGray;
  readonly bgGrey = chalk.bgGrey;
  readonly bgBlackBright = chalk.bgBlackBright;
  readonly bgRedBright = chalk.bgRedBright;
  readonly bgGreenBright = chalk.bgGreenBright;
  readonly bgYellowBright = chalk.bgYellowBright;
  readonly bgBlueBright = chalk.bgBlueBright;
  readonly bgMagentaBright = chalk.bgMagentaBright;
  readonly bgCyanBright = chalk.bgCyanBright;
  readonly bgWhiteBright = chalk.bgWhiteBright;

  constructor() {
    this.consoleLogger = log4js.getLogger("default");
    this.fileLogger = log4js.getLogger("file");
    this.errorLogger = log4js.getLogger("error");
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- message 只要可以转换成字符串
  private makeLog(message: any, logger?: string, force?: boolean) {
    const messages = [];
    messages.push(this.blue(`[${force ? logger : this.makeLoggerName(logger)}]`));
    for (const i of Array.isArray(message) ? message : [message])
      messages.push(this.objectToString(i));
    return messages.join(" ");
  }

  private makeLoggerName(logger?: string) {
    // 几种情况：
    // 没有指定 logger 但设置了 config.system.log.align，返回 config.system.log.align
    // 没有指定 logger 且没有设置 config.system.log.align，返回 Yuzai
    // 指定 logger，但没有设置 config.system.log.align，直接返回 logger
    // 指定 logger 且设置了 config.system.log.align：
    // 如果 logger 长度小于 config.system.log.align，在两边加上空格，使长度等于 config.system.log.align
    // 如果 logger 长度大于 config.system.log.align，截断 logger 并在右边加上 .，使长度等于 config.system.log.align
    if (!logger) return config.system.log.align || "Yuzai";
    if (!config.system.log.align) return logger;
    const length = (config.system.log.align.length - logger.length) / 2;
    if (length > 0)
      logger = `${" ".repeat(Math.floor(length))}${logger}${" ".repeat(Math.ceil(length))}`;
    else if (length < 0) logger = logger.slice(0, config.system.log.align.length - 1) + ".";
    return logger;
  }

  /**
   * 将对象转化成字符串
   * @param data 要转化成字符串的对象
   * @param utilInspectOpts 传递给 util.inspect 的选项，如果为 false 则不使用 util.inspect
   * @returns 转化后的字符串
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- message 只要可以转换成字符串
  private objectToString(data: any, utilInspectOpts = config.system.log.object) {
    if (typeof data === "string") {
      // 如果 data 是字符串，不做任何预处理
    } else if (!utilInspectOpts) {
      // 如果 data 不是字符串且 opts 为 false，直接调用 toString 方法
      if (typeof data === "object" && typeof data.toString !== "function") {
        data = "[object null]";
      } else {
        data = String(data);
      }
    } else {
      // 否则，调用 util.inspect 方法，并传入选项
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

    // 处理过长的日志
    const length = config.system.log.length;
    if (data.length > length)
      data = `${data.slice(0, length)}${this.gray(`... ${data.length - length} more characters`)}`;
    return data;
  }

  // 这样写就可以用一个统一的 logger 来记录日志，并把不同级别的日志输出到不同的地方
  /**
   * trace 日志
   * @param message 日志信息，多条信息使用数组
   * @param logger logger 名称
   * @param forceName 是否强制直接使用 logger 名，而不是进行对齐
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- message 只要可以转换成字符串
  trace(message: any, logger?: string, forceName?: boolean) {
    this.consoleLogger.trace(this.makeLog(message, logger, forceName));
  }

  /**
   * debug 日志
   * @param message 日志信息，多条信息使用数组
   * @param logger logger 名称
   * @param forceName 是否强制直接使用 logger 名，而不是进行对齐
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- message 只要可以转换成字符串
  debug(message: any, logger?: string, forceName?: boolean) {
    this.consoleLogger.debug(this.makeLog(message, logger, forceName));
  }

  /**
   * info 日志
   * @param message 日志信息，多条信息使用数组
   * @param logger logger 名称
   * @param forceName 是否强制直接使用 logger 名，而不是进行对齐
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- message 只要可以转换成字符串
  info(message: any, logger?: string, forceName?: boolean) {
    this.consoleLogger.info(this.makeLog(message, logger, forceName));
  }

  /**
   * warn 日志
   * @param message 日志信息，多条信息使用数组
   * @param logger logger 名称
   * @param forceName 是否强制直接使用 logger 名，而不是进行对齐
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- message 只要可以转换成字符串
  warn(message: any, logger?: string, forceName?: boolean) {
    this.fileLogger.warn(this.makeLog(message, logger, forceName));
  }

  /**
   * error 日志
   * @param message 日志信息，多条信息使用数组
   * @param logger logger 名称
   * @param forceName 是否强制直接使用 logger 名，而不是进行对齐
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- message 只要可以转换成字符串
  error(message: any, logger?: string, forceName?: boolean) {
    this.errorLogger.error(this.makeLog(message, logger, forceName));
  }

  /**
   * fatal 日志
   * @param message 日志信息，多条信息使用数组
   * @param logger logger 名称
   * @param forceName 是否强制直接使用 logger 名，而不是进行对齐
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- message 只要可以转换成字符串
  fatal(message: any, logger?: string, forceName?: boolean) {
    this.errorLogger.fatal(this.makeLog(message, logger, forceName));
  }

  /**
   * mark 日志
   * @param message 日志信息，多条信息使用数组
   * @param logger logger 名称
   * @param forceName 是否强制直接使用 logger 名，而不是进行对齐
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- message 只要可以转换成字符串
  mark(message: any, logger?: string, forceName?: boolean) {
    this.fileLogger.mark(this.makeLog(message, logger, forceName));
  }

  /**
   * 记录日志
   *
   * 方便动态调整类型
   * @param type 日志类型
   * @param message 日志信息，多条信息使用数组
   * @param logger logger 名称
   * @param forceName 是否强制直接使用 logger 名，而不是进行对齐
   */
  log(
    type: "trace" | "debug" | "info" | "warn" | "error" | "fatal" | "mark",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- message 只要可以转换成字符串
    message: any,
    logger?: string,
    forceName?: boolean,
  ) {
    this[type](message, logger, forceName);
  }
}

const logger = new Logger();
export default logger;
