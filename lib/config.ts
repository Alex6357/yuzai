import fsSync from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import toml from "toml";
import _ from "lodash";

import { getLogger } from "yuzai/logger";
import client from "yuzai/client";

const logger = getLogger("Config");

interface SystemConfig {
  /** 版本号 */
  readonly version: string;
  /** 插件加载超时 */
  readonly pluginLoadTimeout: number;
  /** 监听文件变化 */
  readonly fileWatch: boolean;
  /** 上线推送通知的冷却时间 */
  readonly onlineMsgExp: number;
  /** 文件保存时间 */
  readonly fileToUrlTime: number;
  /** 文件访问次数 */
  readonly fileToUrlTimes: number;
  /** 消息类型统计 */
  readonly msgTypeCount: boolean;
  /** 以/开头转为# */
  readonly slashToHash: boolean;
  /** 米游社接口代理地址，国际服用 */
  // proxyAddress: string
  readonly log: {
    /** 日志等级 trace，debug，info，warn，fatal，mark，error，off */
    readonly level: "info" | "warn" | "error" | "fatal" | "mark" | "debug" | "trace" | "off";
    /** 单条日志长度 */
    readonly length: number;
    /** 对象日志格式 */
    readonly object: boolean | object;
    /** 日志ID对齐 */
    readonly align: string;
  };
  /** 定时任务配置项 */
  readonly schedule: {
    /** 自动更新时间 */
    readonly updateTime: number;
    /** 自动重启时间 */
    readonly restartTime: number;
    /** 定时更新 cron 表达式 */
    readonly updateCron: string;
    /** 定时重启 cron 表达式 */
    readonly restartCron: string;
    /** 定时关机 cron 表达式 */
    readonly stopCron: string;
    /** 定时开机 cron 表达式 */
    readonly startCron: string;
  };
}

/** 群组设置 */
interface GroupConfig {
  /** 群聊中所有指令操作冷却时间，单位毫秒,0则无限制 */
  readonly groupCD: number;
  /** 群聊中个人操作冷却时间，单位毫秒 */
  readonly singleCD: number;
  /** 是否只仅关注主动提及Bot的消息 0-否 1-是 2-非主人 */
  readonly onlyReplyAt: boolean | "notMaster";
  /** 开启后则只回复提及Bot的消息及特定前缀的消息 */
  readonly botAlias: string[];
  /** 是否限制添加消息 0-所有群员 1-群管理员 2-主人 */
  readonly addLimit: "all" | "admin" | "master";
  /** 是否允许私聊添加 */
  readonly addPrivate: boolean;
  /** 是否回复触发消息 */
  readonly addReply: boolean;
  /** 是否提及触发用户 */
  readonly addAt: boolean;
  /** 是否撤回回复消息 */
  readonly addRecall: number;
  /** 只启用功能，配置后只有该功能才响应 */
  readonly enable: string[];
  /** 禁用功能，功能名称,例如：十连、角色查询、体力查询、用户绑定、抽卡记录、添加表情、欢迎新人、退群通知 */
  readonly disable: string[];
}

/** 机器人的群组配置 */
interface BotGroupConfig {
  readonly default: GroupConfig;
  readonly [key: string]:
    | GroupConfig
    | {
        readonly default: GroupConfig;
        readonly [key: string]: GroupConfig;
      };
}

/** 机器人配置项 */
interface BotConfig {
  /** 是否自动同意加好友 1-同意 0-不处理 */
  readonly autoFriend: boolean;
  /** 是否自动退群人数，当被好友拉进群时，群人数小于配置值自动退出， 默认50，0则不处理 */
  readonly autoQuit: number;
  /** 解析Bot账号:主人帐号 */
  readonly masters: Record<string, string[]>;
  /** 禁用私聊功能 true：私聊只接受ck以及抽卡链接（Bot主人不受限制），false：私聊可以触发全部指令，默认false */
  readonly disablePrivate: boolean;
  /** 禁用私聊Bot提示内容 */
  readonly disableMsg: string;
  /** 私聊通行字符串 */
  readonly disableAdopt: string[];
  /** 白名单群 */
  readonly whiteGroup: string[];
  /** 白名单用户 */
  readonly whiteUser: string[];
  /** 黑名单群 */
  readonly blackGroup: string[];
  /** 黑名单用户 */
  readonly blackUser: string[];
  /** 群配置 */
  getGroupConfig(botID: string, groupID: string): GroupConfig;
}

export function checkConfigFileExists(filename: string) {
  if (filename.endsWith(".toml")) {
    filename = filename.slice(0, -5);
  }
  const configPath = path.resolve(configDir, `${filename}.toml`);
  return fsSync.existsSync(configPath);
}

export function getConfigFromFile<T>(filename: string) {
  if (filename.endsWith(".toml")) {
    filename = filename.slice(0, -5);
  }

  const configFilePath = path.resolve(configDir, `${filename}.toml`);

  try {
    if (!checkConfigFileExists(filename)) {
      logger.warn(`配置文件 ${configFilePath} 不存在，已返回 undefined`);
      return undefined;
    }
    return toml.parse(fsSync.readFileSync(configFilePath, "utf-8")) as T;
  } catch (error) {
    logger.error(`读取配置文件 ${filename} 失败: ${error}`);
    return undefined;
  }
}

export function copyDefaultConfigFile(filename: string, defaultConfigFilePath: string) {
  if (filename.endsWith(".toml")) {
    filename = filename.slice(0, -5);
  }

  if (!path.isAbsolute(defaultConfigFilePath))
    defaultConfigFilePath = path.resolve(rootDir, defaultConfigFilePath);
  if (!fsSync.existsSync(defaultConfigFilePath))
    logger.error(`复制默认配置文件 ${defaultConfigFilePath} 失败，源文件不存在`);

  try {
    fsSync.cpSync(defaultConfigFilePath, path.resolve(configDir, `${filename}.toml`));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 错误是任意类型
  } catch (error: any) {
    logger.error([
      `复制默认配置文件 ${defaultConfigFilePath} ${path.resolve(configDir, `${filename}.toml`)} 失败：`,
      error,
    ]);
  }
}

// TODO 好好写介绍
/** 根目录，index.js/ts 所在目录 */
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configDir = path.resolve(rootDir, "config");

if (!fsSync.existsSync(path.resolve(configDir, "system.toml")))
  copyDefaultConfigFile("system", "config/defaults/system.toml");
if (!fsSync.existsSync(path.resolve(configDir, "bot.toml")))
  copyDefaultConfigFile("bot", "config/defaults/bot.toml");
if (!fsSync.existsSync(path.resolve(configDir, "groups.toml")))
  copyDefaultConfigFile("groups", "config/defaults/groups.toml");

const systemConfig = _.merge(getConfigFromFile<SystemConfig>("system"), {
  version: JSON.parse(fsSync.readFileSync(path.resolve(rootDir, "package.json"), "utf8")).version,
}) as SystemConfig;
if (!systemConfig) {
  logger.error("系统配置文件 system.toml 读取失败，请检查配置文件或手动复制系统配置文件");
  client.gracefulExit(1);
}

const botConfig = getConfigFromFile<BotConfig>("bot") as BotConfig;
if (!botConfig) {
  logger.error("机器人配置文件 bot.toml 读取失败，请检查配置文件或手动复制机器人配置文件");
  client.gracefulExit(1);
}

// 合并主人配置
Object.keys(botConfig.masters).forEach((key) => {
  if (key === "all") return;
  botConfig.masters[key] = [
    ...new Set(botConfig.masters[key].concat(botConfig.masters["all"] || [])),
  ];
});
delete botConfig.masters["all"];

const groupConfig = getConfigFromFile<BotGroupConfig>("groups") as BotGroupConfig;
if (!groupConfig) {
  logger.error("群组配置文件 groups.toml 读取失败，请检查配置文件或手动复制群组配置文件");
  client.gracefulExit(1);
}

// 实现 getGroupConfig 方法
botConfig.getGroupConfig = (botID, groupID) => {
  return {
    ...groupConfig.default,
    ...(
      groupConfig[botID] as {
        readonly default: GroupConfig;
        readonly [key: string]: GroupConfig;
      }
    ).default,
    ...groupConfig[groupID],
    ...(
      groupConfig[botID] as {
        readonly default: GroupConfig;
        readonly [key: string]: GroupConfig;
      }
    )[groupID],
  };
};

export default {
  rootDir: rootDir,
  system: systemConfig,
  bot: botConfig,
} as const;
