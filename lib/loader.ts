import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { type UUID, randomUUID } from "node:crypto";

import schedule from "node-schedule";
import lodash from "lodash";

import logger from "./logger.ts";
import config from "./config.ts";
import * as utils from "./utils.ts";
import Plugin from "./plugin.ts";
import Adapter from "./adapter.ts";

/** 插件目录名："plugins" */
const pluginDirname = "plugins";

/** 插件目录绝对路径 */
export function getPluginDir() {
  return path.join(config.rootDir, pluginDirname);
}

/** 插件列表，id 为键，插件对象为值 */
const plugins = new Map<string, Plugin>();

/** 插件加载错误列表 */
const packageError: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 错误是任意类型
  error: any;
  file: string;
}[] = [];

/** 定时任务列表 */
const schedules = new Map<
  UUID,
  {
    /** 定时任务ID */
    id: UUID;
    /** 插件ID */
    from: string;
    /** 定时任务名称 */
    name: string;
    /** cron表达式 */
    cron: string;
    /** Schedule.Job 对象 */
    job?: schedule.Job;
    /** 定时任务处理函数 */
    handler: () => Promise<void>;
  }
>();

/** 适配器目录名："adapters" */
const adapterDirname = "adapters";

/** 适配器目录绝对路径 */
export function getAdapterDir() {
  return path.join(config.rootDir, adapterDirname);
}

/** 适配器列表，id 为键，适配器对象为值 */
const adapters = new Map<string, typeof Adapter>();

/**
 * 加载全部插件
 * @param reload 是否全部重新加载
 */
export async function loadPlugins(reload = false) {
  if (reload) plugins.clear();
  if (plugins.size) return;

  logger.info("-----------", "Loader");
  logger.info("加载插件中...", "Loader");

  const pluginFiles = await scanPlugins();

  await Promise.allSettled(
    pluginFiles.map(async (file) => {
      if (
        (await utils.wait(config.system.pluginLoadTimeout * 1000, loadPlugin(file))) ===
        utils.waitTimeout
      )
        logger.error(`插件加载超时 ${logger.red(file)}`, "Loader");
    }),
  );

  logger.info(`加载定时任务[${schedules.size}个]`, "Loader");
  logger.info(`加载插件[${plugins.size}个]`, "Loader");

  return plugins;
}

/**
 * 扫描插件
 *
 * 以下内容视为单个插件：
 * - plugins 中所有 js/ts 文件
 * - plugins 中含有 index.js/ts 的文件夹
 * - plugins 中不含有 index.js/ts 的文件夹中的所有 js/ts 文件
 *
 * @returns 插件文件列表，内容示例：`["plugin1.js", "plugin2/index.ts", "somedir/plugin3.js"]`
 */
async function scanPlugins() {
  return scanFiles(getPluginDir());
}

/**
 * 通用文件扫描函数
 *
 * 以下内容视为单个文件实体：
 * - 指定目录中所有 js/ts 文件
 * - 指定目录中含有 index.js/ts 的文件夹
 * - 指定目录中不含有 index.js/ts 的文件夹中的所有 js/ts 文件
 *
 * @param dir 要扫描的目录绝对路径
 * @returns 文件列表，内容示例：`["file1.js", "dir/index.ts", "somedir/file3.js"]`
 * @param isAdapter 是否扫描适配器，若为 true 则返回对象数组，否则返回字符串数组
 */
async function scanFiles(dir: string) {
  const filesList: string[] = [];
  // 读取指定目录下的所有文件和文件夹
  const files = await fs.readdir(dir, {
    withFileTypes: true,
  });

  // 遍历指定目录下的每个文件或文件夹
  for (const entry of files) {
    // 如果当前项是文件
    if (entry.isFile()) {
      // 若文件不是以 .js/ts 结尾，则跳过该文件
      if (!entry.name.endsWith(".js") && !entry.name.endsWith(".ts")) continue;
      // 添加记录
      filesList.push(entry.name);
      continue;
    }

    // 如果当前项是文件夹
    try {
      // 尝试获取当前文件夹下 index.js/ts 文件的状态信息
      for (const ext of [".js", ".ts"]) {
        const stat = await fs.stat(path.join(dir, entry.name, `index${ext}`));
        // 若 index.js/ts 是文件，则使用 `文件夹名/index.js(ts)` 记录
        if (stat.isFile()) {
          filesList.push(`${entry.name}/index${ext}`);
          continue;
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 错误是任意类型
    } catch (error: any) {
      // 若错误码不是文件不存在的错误码，则记录警告日志
      if (error.code !== "ENOENT") {
        logger.warn(error);
      }
    }

    // 读取当前文件夹下的所有文件和文件夹
    const subFiles = await fs.readdir(path.join(dir, entry.name), {
      withFileTypes: true,
    });
    // 遍历当前文件夹下的每个文件或文件夹
    for (const file of subFiles) {
      // 若当前项不是文件，则跳过
      if (!file.isFile()) continue;
      // 若文件不是以 .js/ts 结尾，则跳过
      if (!file.name.endsWith(".js") && !file.name.endsWith(".ts")) continue;
      filesList.push(`${entry.name}/${file.name}`);
    }
  }
  return filesList;
}

/**
 * 加载单个插件
 * @param file 要加载的插件文件，从插件目录开始的相对路径
 * @param packageError 插件加载过程中遇到的 "Cannot find package" 错误的列表，
 * 内容为 `{ error: error, file: filePath }`
 */
async function loadPlugin(file: string, reload = false) {
  // 检查插件是否存在
  try {
    await fs.stat(path.join(getPluginDir(), file));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 错误是任意类型
  } catch (error: any) {
    if (error.code === "ENOENT") {
      logger.error(`插件 ${logger.red(file)} 不存在`, "Loader");
      return;
    }
    throw error;
  }

  /** 记录加载耗时 */
  const loadTime = new Map<string, number>();
  /** 开始加载时间 */
  const startTime = Date.now();
  let plugin: Plugin | Plugin[];

  try {
    const module = await import(pathToFileURL(path.join(getPluginDir(), file)).toString());
    plugin = module.default || module;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 错误是任意类型
  } catch (error: any) {
    // 处理导入错误
    if (error.stack.includes("Cannot find package")) {
      // 如果是包缺失错误，收集到错误列表
      packageError.push({ error: error, file: path.join(getPluginDir(), file) });
    } else {
      // 其他错误直接记录日志
      logger.error([`插件加载错误 (${logger.red(file)})`, error], "Loader", true);
    }
    return;
  }

  let isSingleFile = false;
  // 如果插件不是数组形式，说明是单文件插件
  if (!Array.isArray(plugin)) {
    isSingleFile = true;
    plugin = [plugin];
  }

  for (const i of plugin) {
    if (plugins.has(i.id) && !reload) {
      logger.fatal(
        `插件 ${logger.red(i.name)} 与插件 ${logger.red(plugins.get(i.id)?.name)} 的 ID ${logger.red(i.id)} 重复，已跳过加载新插件`,
        "Loader",
      );
      return;
    } else {
      // 如果是重新加载插件，先删掉旧插件
      plugins.delete(i.id);
    }

    if (isSingleFile) {
      // 单文件插件可以直接监听文件变化，多文件插件应由插件自己的 index.js/ts 监听
      utils
        .watchFile(path.join(getPluginDir(), file))
        ?.on(
          "change",
          lodash.debounce(async () => {
            logger.mark(`[修改插件][${file}]`, "Loader");
            await loadPlugin(file, true);
          }, 5000),
        )
        .on(
          "unlink",
          lodash.debounce(async () => {
            logger.mark(`[卸载插件][${file}]`, "Loader");
            // 删除监听
            utils.fileWatcher
              .get(path.join(getPluginDir(), file))
              ?.removeAllListeners("change")
              .removeAllListeners("unlink");
            utils.fileWatcher.delete(path.join(getPluginDir(), file));
            // 删除插件
            plugins.delete(file);
          }, 5000),
        );
    }

    plugins.set(i.id, i);
    createSchedules(i, reload);
  }
  loadTime.set(file, Date.now() - startTime);
}

/**
 * 输出安装依赖的提示
 */
export function packageTips() {
  if (packageError.length === 0) return;
  logger.error("--------- 插件或适配器加载错误 ---------", "Loader");
  for (const i of packageError) {
    const pack = i.error.stack.match(/'(.+?)'/g)[0].replace(/'/g, "");
    logger.error(`${logger.cyan(i.file)} 缺少依赖 ${logger.red(pack)}`, "Loader");
  }
  packageError.length = 0;
  logger.error(`安装插件或适配器后请 ${logger.red("pnpm i")} 安装依赖`, "Loader");
  logger.error(`仍报错${logger.red("进入插件或适配器目录")} pnpm add 依赖`, "Loader");
  logger.error("--------------------------------", "Loader");
}

/**
 * 创建或更新定时任务
 * @param plugin - 需要创建定时任务的插件
 * @param reload - 是否重新创建定时任务
 */
function createSchedules(plugin: Plugin, reload = false) {
  // 检查任务是否已经被创建
  let isCreated = false;
  for (const task of schedules.values()) {
    if (task.from === plugin.id) {
      isCreated = true;
      break;
    }
  }
  if (isCreated && reload === false) return;

  // 删除已经存在的插件任务
  if (isCreated) {
    for (const task of schedules.values()) {
      if (task.from === plugin.id) {
        task.job?.cancel();
        schedules.delete(task.id);
      }
    }
  }

  for (const trigger of plugin.schedules) {
    const uuid = randomUUID();
    // 格式化任务名称用于日志
    const name = `${logger.blue(`[${trigger.name}(${trigger.cron})]`)}`;
    logger.debug(`加载定时任务 ${name}`, "Loader");

    schedules.set(uuid, {
      id: uuid,
      from: plugin.id,
      name: trigger.name,
      cron: trigger.cron,
      job: schedule.scheduleJob(
        // 标准化 cron 表达式（取前6个空格分隔的部分）
        trigger.cron.split(/\s+/).slice(0, 6).join(" "),
        async () => {
          try {
            const startTime = Date.now();
            logger.mark(`${name}${logger.yellow("[开始处理]")}`, undefined, false);
            await trigger.handle(); // 执行任务处理函数
            logger.mark(
              `${name}${logger.green(`[完成${utils.getTimeDiff(startTime)}]`)}`,
              undefined,
              false,
            );
          } catch (err) {
            logger.error([name, err], undefined, false);
          }
        },
      ),
      handler: trigger.handle,
    });
  }
}

// ==================== 适配器加载部分 ====================
/**
 * 加载全部适配器
 *
 * 视为单个适配器的文件：
 * - adapters 中的所有 js/ts 文件
 * - adapters 中含有 index.js/ts 的文件夹
 * - adapters 中不含有 index.js/ts 的文件夹中的所有 js/ts 文件
 *
 * @param reload 是否全部重新加载
 * @return 适配器列表，id 为键，适配器类为值
 */
export async function loadAdapters(
  reload = false,
): Promise<Map<string, typeof Adapter> | undefined> {
  if (reload) adapters.clear();
  if (adapters.size) return;

  logger.info("加载适配器中...", "Loader");

  const files = await scanAdapters();

  await Promise.allSettled(
    files.map(async (file) => {
      if (
        (await utils.wait(config.system.pluginLoadTimeout * 1000, loadAdapter(file))) ===
        utils.waitTimeout
      )
        logger.error(`适配器加载超时 ${logger.red(file)}`, "Loader");
    }),
  );

  logger.info(`加载适配器[${adapters.size}个]`, "Loader");

  return adapters;
}

/**
 * 扫描适配器
 *
 * 以下内容视为单个适配器：
 * - adapters 中所有 js/ts 文件
 * - adapters 中含有 index.js/ts 的文件夹
 * - adapters 中不含有 index.js/ts 的文件夹中的所有 js/ts 文件
 *
 * @returns 适配器文件列表，内容示例：`["OneBotv11.ts", "go-cqhttp/index.js"]`
 */
async function scanAdapters() {
  return scanFiles(getAdapterDir());
}

/**
 * 加载单个适配器
 * @param file 要加载的适配器文件，从适配器目录开始的相对路径
 * @param reload 是否重新加载适配器
 */
async function loadAdapter(file: string, reload = false) {
  // 检查适配器是否存在
  try {
    await fs.stat(path.join(getAdapterDir(), file));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 错误是任意类型
  } catch (error: any) {
    if (error.code === "ENOENT") {
      logger.error(`适配器 ${logger.red(file)} 不存在`, "Loader");
      return;
    }
    throw error;
  }

  /** 记录加载耗时 */
  const loadTime = new Map<string, number>();
  /** 开始加载时间 */
  const startTime = Date.now();
  let adapter: typeof Adapter;

  try {
    const module = await import(pathToFileURL(path.join(getAdapterDir(), file)).toString());
    adapter = module.default || module;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 错误是任意类型
  } catch (error: any) {
    // 处理导入错误
    if (error.stack.includes("Cannot find package")) {
      packageError.push({ error: error, file: path.join(getAdapterDir(), file) });
    } else {
      // 其他错误直接记录日志
      logger.error([`适配器加载错误 (${logger.red(file)})`, error], "Loader", true);
    }
    return;
  }

  if (adapters.has(adapter.id) && !reload) {
    logger.fatal(
      `适配器 ${logger.red(adapter.name)} 与适配器 ${logger.red(adapters.get(adapter.id)?.name)} 的 ID ${logger.red(adapter.id)} 重复，已跳过加载新适配器`,
      "Loader",
    );
    return;
  } else {
    // 如果是重新加载插件，先删掉旧插件
    adapters.delete(adapter.id);
  }

  try {
    await adapter.init();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 错误是任意类型
  } catch (error: any) {
    logger.error([`适配器 ${adapter.name} 初始化错误 (${logger.red(file)})`, error], "Loader");
    return;
  }

  // 监听适配器文件变化
  utils
    .watchFile(path.join(getAdapterDir(), file))
    ?.on(
      "change",
      lodash.debounce(async () => {
        logger.mark(`[修改适配器][${file}]`, "Loader");
        await loadAdapter(file, true);
      }, 5000),
    )
    .on(
      "unlink",
      lodash.debounce(async () => {
        logger.mark(`[卸载适配器][${file}]`, "Loader");
        // 删除监听
        utils.fileWatcher
          .get(path.join(getAdapterDir(), file))
          ?.removeAllListeners("change")
          .removeAllListeners("unlink");
        utils.fileWatcher.delete(path.join(getAdapterDir(), file));
        // 删除适配器
        adapters.delete(file);
      }, 5000),
    );

  adapters.set(adapter.id, adapter);

  loadTime.set(file + " (adapter)", Date.now() - startTime);
}
