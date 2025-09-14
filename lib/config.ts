import fs from "node:fs";
import toml from "toml";

import logger from "yuzai/logger";

/** 群组设置 */
interface GroupConfig {
  /** 群聊中所有指令操作冷却时间，单位毫秒,0则无限制 */
  groupCD: number;
  /** 群聊中个人操作冷却时间，单位毫秒 */
  singleCD: number;
  /** 是否只仅关注主动提及Bot的消息 0-否 1-是 2-非主人 */
  onlyReplyAt: boolean | "notMaster";
  /** 开启后则只回复提及Bot的消息及特定前缀的消息 */
  botAlias: string[];
  /** 是否限制添加消息 0-所有群员 1-群管理员 2-主人 */
  addLimit: "all" | "admin" | "master";
  /** 是否允许私聊添加 */
  addPrivate: boolean;
  /** 是否回复触发消息 */
  addReply: boolean;
  /** 是否提及触发用户 */
  addAt: boolean;
  /** 是否撤回回复消息 */
  addRecall: number;
  /** 只启用功能，配置后只有该功能才响应 */
  enable: string[];
  /** 禁用功能，功能名称,例如：十连、角色查询、体力查询、用户绑定、抽卡记录、添加表情、欢迎新人、退群通知 */
  disable: string[];
}

/** 机器人的群组配置 */
interface BotGroupConfig {
  default: GroupConfig;
  [groupID: string]: GroupConfig;
}

const DEFAULT_GROUP_CONFIG: GroupConfig = {
  groupCD: 500,
  singleCD: 2000,
  onlyReplyAt: false,
  botAlias: [],
  addLimit: "all",
  addPrivate: true,
  addReply: true,
  addAt: false,
  addRecall: 60,
  enable: [],
  disable: [],
};

/** 配置文件 */
class Config {
  // TODO 好好写介绍
  /** 根目录，index.js/ts 所在目录 */
  rootDir = "./";
  /** 系统配置项 */
  private _system: {
    log: {
      /** 日志等级 trace，debug，info，warn，fatal，mark，error，off */
      level: "info" | "warn" | "error" | "fatal" | "mark" | "debug" | "trace" | "off";
      /** 单条日志长度 */
      length: number;
      /** 对象日志格式 */
      object: boolean | object;
      /** 日志ID对齐 */
      align: string;
    };
    /** 定时任务配置项 */
    schedule: {
      /** 自动更新时间 */
      updateTime: number;
      /** 自动重启时间 */
      restartTime: number;
      /** 定时更新 cron 表达式 */
      updateCron: string;
      /** 定时重启 cron 表达式 */
      restartCron: string;
      /** 定时关机 cron 表达式 */
      stopCron: string;
      /** 定时开机 cron 表达式 */
      startCron: string;
    };
    /** Puppeteer 配置项 */
    puppeteer: {
      /** chromium 其他路径 */
      chromiumPath: string;
      /** puppeteer 接口地址 */
      puppeteerWs: string;
      /** puppeteer 截图超时时间 */
      puppeteerTimeout: number;
    };
    /** Redis 配置项 */
    redis: {
      /** Redis 命令路径 */
      path: string;
      /** Redis 地址 */
      host: string;
      /** Redis 端口 */
      port: number;
      /** Redis 用户名 */
      username: string;
      /** Redis 密码 */
      password: string;
      /** Redis 数据库 */
      db: number;
    };
    /** 服务器配置项 */
    server: {
      /** 服务器地址 */
      url: string;
      /** 服务器端口 */
      port: number;
      /** 服务器缺省跳转地址 */
      redirect: string;
      /** 服务器鉴权 */
      auth: string[];
      /** 服务器 https 配置项 */
      https: {
        /** 是否启用 https 服务器 */
        enabled: boolean;
        /** https 服务器地址 */
        url: string;
        /** https 服务器端口 */
        port: number;
        /** https 服务器证书路径 */
        key: string;
        /** https 服务器证书路径 */
        cert: string;
      };
    };
    /** 版本号 */
    version: string;
    /** 插件加载超时 */
    pluginLoadTimeout: number;
    /** 监听文件变化 */
    fileWatch: boolean;
    /** 上线推送通知的冷却时间 */
    onlineMsgExp: number;
    /** 文件保存时间 */
    fileToUrlTime: number;
    /** 文件访问次数 */
    fileToUrlTimes: number;
    /** 消息类型统计 */
    msgTypeCount: boolean;
    /** 以/开头转为# */
    slashToHash: boolean;
    /** 米游社接口代理地址，国际服用 */
    // proxyAddress: string
  } = {
    log: {
      level: "info",
      length: 10000,
      object: true,
      align: "",
    },
    schedule: {
      updateTime: 1440,
      restartTime: 0,
      updateCron: "",
      restartCron: "",
      stopCron: "",
      startCron: "",
    },
    puppeteer: {
      chromiumPath: "",
      puppeteerWs: "",
      puppeteerTimeout: -1,
    },
    redis: {
      path: "redis-server",
      host: "127.0.0.1",
      port: 6379,
      username: "",
      password: "",
      db: 0,
    },
    server: {
      url: "http://localhost:2536",
      port: 2536,
      redirect: "https://github.com/Alex6357/yuzai",
      auth: [],
      https: {
        enabled: false,
        url: "https://localhost:2537",
        port: 2537,
        key: "config/localhost.key",
        cert: "config/localhost.crt",
      },
    },
    version: "",
    pluginLoadTimeout: 60,
    fileWatch: true,
    onlineMsgExp: 1440,
    fileToUrlTime: 1,
    fileToUrlTimes: -1,
    msgTypeCount: false,
    slashToHash: true,
    // proxyAddress: "",
  };

  /** 机器人配置项 */
  private _bot: {
    /** 是否自动同意加好友 1-同意 0-不处理 */
    autoFriend: boolean;
    /** 是否自动退群人数，当被好友拉进群时，群人数小于配置值自动退出， 默认50，0则不处理 */
    autoQuit: number;
    /** 主人帐号 */
    masterQQ: string[];
    /** Bot账号:主人帐号 */
    master: string[];
    /** 解析后的Bot账号:主人帐号 */
    masterMap: Record<string, string | string[]>;
    /** 解析Bot账号:主人帐号 */
    get masters(): Record<string, string | string[]>;
    /** 机器人账号 */
    get uin(): string[];
    /** 禁用私聊功能 true：私聊只接受ck以及抽卡链接（Bot主人不受限制），false：私聊可以触发全部指令，默认false */
    disablePrivate: boolean;
    /** 禁用私聊Bot提示内容 */
    disableMsg: string;
    /** 私聊通行字符串 */
    disableAdopt: string[];
    /** 白名单群 */
    whiteGroup: string[];
    /** 白名单用户 */
    whiteUser: string[];
    /** 黑名单群 */
    blackGroup: string[];
    /** 黑名单用户 */
    blackUser: string[];
  } = {
    autoFriend: false,
    autoQuit: 50,
    masterQQ: [],
    master: [],
    masterMap: {},
    get masters() {
      if (Object.keys(this.masterMap).length !== 0) return this.masterMap;
      const masters: Record<string, string | string[]> = {};
      for (const i of this.master) {
        const l = i.split(":");
        const bot_id = String(l.shift());
        const user_id = l.join(":");
        if (Array.isArray(masters[bot_id])) {
          masters[bot_id].push(user_id);
        } else {
          masters[bot_id] = [user_id];
        }
      }
      return (this.masterMap = masters);
    },
    get uin() {
      return Object.keys(this.masters);
    },
    disablePrivate: false,
    disableMsg: "私聊功能已禁用，仅支持发送cookie，抽卡记录链接，记录日志文件",
    disableAdopt: [],
    whiteGroup: [],
    whiteUser: [],
    blackGroup: [],
    blackUser: [],
  };

  private _group: {
    default: GroupConfig;
    [botOrGroupID: string]: GroupConfig | BotGroupConfig;
  } = {
    default: DEFAULT_GROUP_CONFIG,
  };

  // watcher = {};

  /** 系统配置项 */
  get system() {
    return this._system;
  }

  /** 机器人配置项 */
  get bot() {
    return this._bot;
  }

  /** 群组配置项 */
  // get group() {
  //   return this._group;
  // }

  constructor() {
    this._system = { ...this.system, ...this.getConfigFromFile("system") };
    this._bot = { ...this.bot, ...this.getConfigFromFile("bot") };
    this._system.version = JSON.parse(fs.readFileSync("package.json", "utf8")).version;

    // TODO 有什么意义？
    // if (this.system.fileWatch === false) {
    //   class FSWatcher extends EventEmitter {
    //     constructor() {
    //       super();
    //     }
    //     on() {
    //       return this;
    //     }
    //     addListener() {
    //       return this;
    //     }
    //     start() {}
    //     close() {}
    //     ref() {
    //       return this;
    //     }
    //     unref() {
    //       return this;
    //     }
    //   }

    //   const watch = new FSWatcher();
    //   fs.watch = () => watch;
    //   chokidar.watch = () => watch;
    //   chokidar.FSWatcher = FSWatcher;

    //   for (const i in this.watcher) {
    //     this.watcher[i].close();
    //     delete this.watcher[i];
    //   }
    //   this.watch = () => {};
    // }
  }

  private getConfigFromFile(filename: string) {
    if (filename.endsWith(".toml")) {
      filename = filename.slice(0, -5);
    }

    const defaultConfigPath = `config/defaults/${filename}.toml`;
    const configPath = `config/${filename}.toml`;

    try {
      // 检查默认配置是否存在
      const defaultConfigExists = fs.existsSync(defaultConfigPath);
      const userConfigExists = fs.existsSync(configPath);

      if (!defaultConfigExists) {
        logger.error(`默认配置文件 ${defaultConfigPath} 不存在，请检查项目完整性。`, "Config");
        if (userConfigExists) {
          return toml.parse(fs.readFileSync(configPath, "utf-8"));
        }
        return {};
      }

      // 默认配置存在，用户配置不存在，返回默认配置
      if (!userConfigExists) {
        fs.copyFileSync(defaultConfigPath, configPath);
        return toml.parse(fs.readFileSync(defaultConfigPath, "utf-8"));
      }

      // 两者都存在，返回合并配置
      return {
        ...toml.parse(fs.readFileSync(defaultConfigPath, "utf-8")),
        ...toml.parse(fs.readFileSync(configPath, "utf-8")),
      };
    } catch (error) {
      logger.error(`读取配置文件 ${filename} 失败: ${error}`, "Config");
      return {};
    }
  }

  /**
   * 获取合并的群组配置
   * @param botID 机器人ID
   * @param groupID 群组ID
   * @returns 群组配置
   */
  getGroupConfig(botID: string, groupID: string): GroupConfig {
    return {
      ...this._group.default,
      ...(this._group[botID] as BotGroupConfig).default,
      ...this._group[groupID],
      ...(this._group[botID] as BotGroupConfig)[groupID],
    };
  }

  // TODO 好像很多都处理了多个机器人的情况

  /** 监听配置文件 */
  // watch(file: string, name: string, type = "default_config") {
  //   const key = `${type}.${name}`;
  //   if (this.watcher[key]) return;

  //   this.watcher[key] = chokidar.watch(file);
  //   this.watcher[key].on(
  //     "change",
  //     _.debounce(() => {
  //       delete this.config[key];
  //       if (typeof Bot !== "object") return;
  //       Bot.makeLog("mark", `[修改配置文件][${type}][${name}]`, "Config");
  //       if (`change_${name}` in this) this[`change_${name}`]();
  //     }, 5000),
  //   );
  // }
  /** 初始化配置 */
  // initCfg() {
  //   const path = "config/"
  //   const files = fs.readdirSync(path).filter(file => file.endsWith(".toml"))
  //   // TODO 这是干什么的文件夹，不应该写在这
  //   for (const i of ["data", "temp"])
  //     if (!fs.existsSync(i))
  //       fs.mkdirSync(i)
  // }
}

const config = new Config();
export default config;
