import fs from "node:fs/promises";
import fsSync from "node:fs";
// import path from "node:path";
// import util from "node:util";
import {
  exec as childProcessExec,
  execFile as childProcessExecFile,
  type ExecOptions,
} from "node:child_process";
import { promisify } from "node:util";

import chokidar, { FSWatcher } from "chokidar";
// import { fileTypeFromBuffer } from "file-type";
// import md5 from "md5";
// import { ulid } from "ulid";

// import config from "./config.ts";
import logger from "./logger.ts";

export const execPromise = promisify(childProcessExec);
export const execFilePromise = promisify(childProcessExecFile);

// -------------------- 等待事件 --------------------

/** 超时 Symbol */
export const waitTimeout = Symbol("timeout");
/**
 * 等待事件进行
 * @param timeMs 超时时间（毫秒）
 * @param promise 等待事件
 * @returns 等待事件 Promise 或默认事件
 */

export async function wait<T>(
  timeMs: number,
  promise?: Promise<T>,
): Promise<T | typeof waitTimeout> {
  if (promise) return Promise.race([promise, wait<T>(timeMs)]);
  return new Promise((resolve) => setTimeout(() => resolve(waitTimeout), timeMs));
}

/**
 * 等待一段时间
 *
 * 是 wait 的别名，但不能传入 promise
 * @param timeMs 等待时间（毫秒）
 * @returns resolved 后的 Promise
 */
export async function sleep(timeMs: number) {
  return wait(timeMs);
}

// -------------------- 文件监听功能 --------------------
// TODO 考虑放到本体插件中，或者如果必须用到，直接放到 lib 中

/** 文件监听器表 */
export const fileWatcher = new Map<string, FSWatcher>();
/**
 * 监听文件更新
 * @param path 文件路径
 * @returns 文件更新监听器
 */
export function watchFile(path: string) {
  if (!fsSync.statSync(path).isFile()) return;
  if (fileWatcher.has(path)) return fileWatcher.get(path);

  const watcher = chokidar.watch(path);
  fileWatcher.set(path, watcher);
  return watcher;
}

/** 监听文件夹更新 */
// watchDir(dirName) {
//   if (this.watcher[dirName]) return;
//   const watcher = chokidar.watch(
//     `./${PluginLoader.pluginDirname}/${dirName}/`
//   );
//   /** 热更新 */
//   Bot.once("online", () => {
//     /** 新增文件 */
//     watcher.on(
//       "add",
//       lodash.debounce(async (PluPath) => {
//         const appName = path.basename(PluPath);
//         if (!appName.endsWith(".js")) return;
//         Bot.makeLog(
//           "mark",
//           `[新增插件][${dirName}][${appName}]`,
//           "PluginLoader"
//         );
//         const key = `${dirName}/${appName}`;
//         await this.importPlugin({
//           name: key,
//           path: `../../${PluginLoader.pluginDirname}/${key}?${moment().format("X")}`,
//         });
//         /** 优先级排序 */
//         this.priority = lodash.orderBy(this.priority, ["priority"], ["asc"]);
//         this.watch(dirName, appName);
//       }, 5000)
//     );
//   });
//   this.watcher[dirName] = watcher;
// }

// -------------------- 时间戳 --------------------

/**
 * 获取两个时间戳之间的时间差
 * @param fromTimestampMs 起始时间戳（毫秒）
 * @param toTimestampMs 结束时间戳（毫秒），默认为当前时间
 * @returns 时间差字符串，格式为 `X天X时X分X秒`，秒数保留三位小数
 */
export function getTimeDiff(fromTimestampMs: number, toTimestampMs = Date.now()) {
  const time = (toTimestampMs - fromTimestampMs) / 1000;
  let ret = "";
  const day = Math.floor(time / 3600 / 24);
  if (day) ret += `${day}天`;
  const hour = Math.floor((time / 3600) % 24);
  if (hour) ret += `${hour}时`;
  const min = Math.floor((time / 60) % 60);
  if (min) ret += `${min}分`;
  const sec = (time % 60).toFixed(3);
  if (sec) ret += `${sec}秒`;
  return ret || "0秒";
}

// -------------------- 文件系统相关 --------------------
/**
 * 创建文件夹
 * @param dir 文件夹路径
 * @param opts 传递给 fs.mkdir的参数，默认指定 recursive: true
 * @returns 是否成功
 */
export async function mkdir(dir: string, opts?: fsSync.MakeDirectoryOptions) {
  try {
    await fs.mkdir(dir, { recursive: true, ...opts });
    return true;
  } catch (err) {
    logger.error(["创建", dir, "错误", err]);
    return false;
  }
}

/**
 * 将文件转换为可访问的 URL 地址
 * @param file - 要处理的文件，可以是 Buffer、对象或文件路径
 * @param opts - 转换选项配置:
 *   @param opts.name - 自定义文件名（会自动进行 URI 编码）
 *   @param opts.time - 文件缓存时间（毫秒），默认使用系统配置
 *   @param opts.times - 文件最大访问次数，默认使用系统配置
 * @returns 返回格式为 `${this.url}/File/${encodedFileName}` 的可访问 URL
 */
// async fileToUrl(
//   file: any,
//   opts: {
//     name?: string;
//     time?: number;
//     times?: number;
//   } = {
//     time: config.system.fileToUrlTime * 60000,
//     times: config.system.fileToUrlTimes,
//   }
// ) {
//   // 处理文件对象：如果是非 Buffer 对象则浅拷贝，否则通过 fileType 检测文件类型
//   file =
//     (typeof file === "object" && !Buffer.isBuffer(file) && { ...file }) ||
//     (await utils.fileType(
//       { file: file, name: opts.name ? opts.name : "" },
//       { http: true }
//     ));

//   // 如果已经是 URL 直接返回（例如经过 fileType 处理后的远程文件）
//   if (!Buffer.isBuffer(file.buffer)) return file.buffer;

//   // 生成唯一文件名：优先使用提供的名称，否则生成 ULID
//   file.name = file.name ? encodeURIComponent(file.name) : ulid();

//   // 设置访问次数限制
//   if (typeof opts.times === "number") file.times = opts.times;

//   // 将文件存入缓存
//   this.fs[file.name] = file;

//   // 设置自动清理定时器（到达指定时间后替换为 timeout 标识）
//   if (opts.time)
//     setTimeout(() => (this.fs[file.name] = this.fs.timeout), opts.time);
//   return `${this.url}/File/${file.name}`;
// } /**
//  * 将文件转换为可访问的 URL 地址
//  * @param file - 要处理的文件，可以是 Buffer、对象或文件路径
//  * @param opts - 转换选项配置:
//  *   @param opts.name - 自定义文件名（会自动进行 URI 编码）
//  *   @param opts.time - 文件缓存时间（毫秒），默认使用系统配置
//  *   @param opts.times - 文件最大访问次数，默认使用系统配置
//  * @returns 返回格式为 `${this.url}/File/${encodedFileName}` 的可访问 URL
//  */
// async fileToUrl(
//   file: any,
//   opts: {
//     name?: string;
//     time?: number;
//     times?: number;
//   } = {
//     time: config.system.fileToUrlTime * 60000,
//     times: config.system.fileToUrlTimes,
//   }
// ) {
//   // 处理文件对象：如果是非 Buffer 对象则浅拷贝，否则通过 fileType 检测文件类型
//   file =
//     (typeof file === "object" && !Buffer.isBuffer(file) && { ...file }) ||
//     (await utils.fileType(
//       { file: file, name: opts.name ? opts.name : "" },
//       { http: true }
//     ));

//   // 如果已经是 URL 直接返回（例如经过 fileType 处理后的远程文件）
//   if (!Buffer.isBuffer(file.buffer)) return file.buffer;

//   // 生成唯一文件名：优先使用提供的名称，否则生成 ULID
//   file.name = file.name ? encodeURIComponent(file.name) : ulid();

//   // 设置访问次数限制
//   if (typeof opts.times === "number") file.times = opts.times;

//   // 将文件存入缓存
//   this.fs[file.name] = file;

//   // 设置自动清理定时器（到达指定时间后替换为 timeout 标识）
//   if (opts.time)
//     setTimeout(() => (this.fs[file.name] = this.fs.timeout), opts.time);
//   return `${this.url}/File/${file.name}`;
// }

// /**
//  * 查询文件状态
//  * @param path 文件路径
//  * @param opts 传递给 fs.stat 的参数
//  * @returns 文件状态对象，如果获取失败返回 undefined
//  */
// async fsStat(path: string, opts?: object) {
//   try {
//     return await fs.stat(path, opts);
//   } catch (err) {
//     logger.trace(["获取", path, "状态错误", err]);
//   }
// }

// /**
//  * 删除文件（夹）
//  * @param file 文件（夹）路径
//  * @param opts 传递给 fs.rm 的参数，默认指定 force: true，recursive: true
//  * @returns 是否成功
//  */
// async rm(file: string, opts?: object) {
//   try {
//     await fs.rm(file, { force: true, recursive: true, ...opts });
//     return true;
//   } catch (err) {
//     logger.error(["删除", file, "错误", err]);
//     return false;
//   }
// }

//   /**
//    *
//    * @param path 匹配的 pattern
//    * @param opts 传递给 fs.glob 的参数，以及是否有 force: true，默认为 false
//    * @returns 匹配到的文件（夹）路径数组
//    */
//   async glob(path, opts?: object) {
//     if (!opts.force && (await this.fsStat(path))) return [path];
//     if (!fs.glob) return [];
//     const array = [];
//     try {
//       for await (const i of fs.glob(path, opts)) array.push(i);
//     } catch (err) {
//       this.makeLog("error", ["匹配", path, "错误", err]);
//     }
//     return array;
//   }

// async download(url: string, file: string, opts?: object) {
//   let buffer;
//   let stat;
//   if (!file || !(stat = await this.fsStat(file)) || stat.isDirectory()) {
//     const type = await this.fileType({ file: url }, opts);
//     file = file ? path.join(file, type.name) : type.name;
//     buffer = type.buffer;
//   } else {
//     await this.mkdir(path.dirname(file));
//     buffer = await this.Buffer(url, opts);
//   }
//   await fs.writeFile(file, buffer);
//   return { url, file, buffer };
// }

// makeMap(parent_map, parent_key, map) {
//   const save = async () => {
//     try {
//       await parent_map.db.put(parent_key, { map_array: Array.from(map) });
//     } catch (err) {
//       logger.error([
//         "写入",
//         parent_map.db.location,
//         parent_key,
//         "错误",
//         map,
//         err,
//       ]);
//     }
//   };

//   const set = map.set.bind(map);
//   Object.defineProperty(map, "set", {
//     value: async (key, value) => {
//       if (JSON.stringify(map.get(key)) !== JSON.stringify(value)) {
//         set(key, value);
//         await save();
//       }
//       return map;
//     },
//   });
//   const del = map.delete.bind(map);
//   Object.defineProperty(map, "delete", {
//     value: async (key) => {
//       if (!del(key)) return false;
//       await save();
//       return true;
//     },
//   });
//   return map;
// }

// async setMap(map, set, key, value) {
//   try {
//     if (value instanceof Map) {
//       set(key, this.makeMap(map, key, value));
//       await map.db.put(key, { map_array: Array.from(value) });
//     } else if (JSON.stringify(map.get(key)) !== JSON.stringify(value)) {
//       set(key, value);
//       await map.db.put(key, value);
//     }
//   } catch (err) {
//     logger.error(["写入", map.db.location, key, "错误", value, err]);
//   }
//   return map;
// }

// async delMap(map, del, key) {
//   if (!del(key)) return false;
//   try {
//     await map.db.del(key);
//   } catch (err) {
//     logger.error(["删除", map.db.location, key, "错误", err]);
//   }
//   return true;
// }

// async importMap(dir, map) {
//   for (const i of await fs.readdir(dir)) {
//     const path = `${dir}/${i}`;
//     try {
//       await map.set(
//         i,
//         (await this.fsStat(path)).isDirectory()
//           ? await this.importMap(path, new Map())
//           : JSON.parse(await fs.readFile(path, "utf8"))
//       );
//     } catch (err) {
//       logger.error(["读取", path, "错误", err]);
//     }
//     await this.rm(path);
//   }
//   await this.rm(dir);
//   return map;
// }

// async getMap(dir) {
//   const map = new Map();
//   const db = new (await import("level")).Level(`${dir}-leveldb`, {
//     valueEncoding: "json",
//   });
//   try {
//     await db.open();
//     for await (let [key, value] of db.iterator()) {
//       if (typeof value === "object" && value.map_array)
//         value = this.makeMap(map, key, new Map(value.map_array));
//       map.set(key, value);
//     }
//   } catch (err) {
//     logger.error(["打开", dir, "数据库错误", err]);
//     return map;
//   }

//   Object.defineProperty(map, "db", { value: db });
//   const set = map.set.bind(map);
//   Object.defineProperty(map, "set", {
//     value: (key, value) => this.setMap(map, set, key, value),
//   });
//   const del = map.delete.bind(map);
//   Object.defineProperty(map, "delete", {
//     value: (key) => this.delMap(map, del, key),
//   });

//   if (await this.fsStat(dir)) await this.importMap(dir, map);
//   return map;
// }

// StringOrNull(data) {
//   if (typeof data === "object" && typeof data.toString !== "function")
//     return "[object null]";
//   return String(data);
// }

// StringOrBuffer(data, base64) {
//   const string = String(data);
//   return string.includes("\ufffd") || string.includes("\u0000")
//     ? base64
//       ? `base64://${data.toString("base64")}`
//       : data
//     : string;
// }

// getCircularReplacer() {
//   const _this_ = this,
//     ancestors = [];
//   return function (key, value) {
//     switch (typeof value) {
//       case "function":
//       case "bigint":
//         return String(value);
//       case "object":
//         if (value === null) return null;
//         if (value instanceof Map || value instanceof Set)
//           return Array.from(value);
//         if (value instanceof Error) return value.stack;
//         if (value.type === "Buffer" && Array.isArray(value.data))
//           try {
//             return _this_.StringOrBuffer(Buffer.from(value), true);
//           } catch {}
//         break;
//       default:
//         return value;
//     }
//     while (ancestors.length > 0 && ancestors.at(-1) !== this) ancestors.pop();
//     if (ancestors.includes(value))
//       return `[Circular ${_this_.StringOrNull(value)}]`;
//     ancestors.push(value);
//     return value;
//   };
// }

// /**
//  * 将数据转换为字符串
//  * @param data 要转换的数据
//  * @param opts 传递给 JSON.stringify 的参数
//  * @returns 转换后的字符串
//  */
// // TODO 写好 data 和 opts 类型
// String(data: any, opts?: any) {
//   // 根据数据类型进行不同的处理
//   switch (typeof data) {
//     // 如果数据是字符串类型，直接返回
//     case "string":
//       return data;
//     // 如果数据是函数类型，调用 String 函数将其转换为字符串并返回
//     case "function":
//       return String(data);
//     // 如果数据是对象类型，进一步检查
//     case "object":
//       // 如果数据是 Error 类型的实例，返回其堆栈信息
//       if (data instanceof Error) return data.stack;
//       // 如果数据是 Buffer 类型，调用 StringOrBuffer 方法将其转换为字符串并返回
//       if (Buffer.isBuffer(data)) return this.StringOrBuffer(data, true);
//   }

//   try {
//     // 尝试将数据转换为 JSON 字符串
//     return (
//       JSON.stringify(data, this.getCircularReplacer(), opts) ||
//       // 如果转换失败，调用 StringOrNull 方法将数据转换为字符串或 null 并返回
//       this.StringOrNull(data)
//     );
//   } catch (err) {
//     // 如果转换过程中发生错误，调用 StringOrNull 方法将数据转换为字符串或 null 并返回
//     return this.StringOrNull(data);
//   }
// }

// async Buffer(data, opts = {}) {
//   if (!Buffer.isBuffer(data)) {
//     data = this.String(data);
//     if (data.startsWith("base64://")) {
//       data = Buffer.from(data.replace("base64://", ""), "base64");
//     } else if (data.match(/^https?:\/\//)) {
//       if (opts.http) return data;
//       data = Buffer.from(await (await fetch(data, opts)).arrayBuffer());
//     } else {
//       const file = data.replace(/^file:\/\//, "");
//       if (await this.fsStat(file)) {
//         if (opts.file) return `file://${path.resolve(file)}`;
//         const buffer = await fs.readFile(file);
//         if (typeof opts.size === "number" && buffer.length > opts.size)
//           return `file://${path.resolve(file)}`;
//         return buffer;
//       }
//     }
//   }

//   if (typeof opts.size === "number" && data.length > opts.size) {
//     const file = path.join("temp", ulid());
//     await fs.writeFile(file, data);
//     data = `file://${path.resolve(file)}`;
//   }
//   return data;
// }

// /**
//  * 根据文件数据获取文件类型信息
//  * @param data - 包含文件名称和文件内容的对象
//  * @param opts - 可选的配置对象
//  * @returns 包含文件类型信息的对象
//  */
// // TODO 有什么用？
// async fileType(data: { name: string; file: string | Buffer }, opts = {}) {
//   // 初始化 file 对象，用于存储文件的相关信息
//   const file: {
//     name: string;
//     url: string;
//     buffer: Buffer | string;
//     type: object;
//     path: string;
//     md5: string;
//   } = {
//     name: data.name,
//     url: "",
//     buffer: "",
//     type: {},
//     path: "",
//     md5: "",
//   };
//   try {
//     // 判断 data.file 是否为 Buffer 类型
//     if (Buffer.isBuffer(data.file)) {
//       // 如果是 Buffer 类型，设置文件的 url 和 buffer
//       file.url = data.name || "Buffer";
//       file.buffer = data.file;
//     } else {
//       // 如果不是 Buffer 类型，处理 base64 格式的文件
//       file.url = data.file.replace(/^base64:\/\/.*/, "base64://...");
//       file.buffer = await this.Buffer(data.file, {
//         ...opts,
//         size: undefined,
//       });
//     }
//     // 判断 file.buffer 是否为 Buffer 类型
//     if (Buffer.isBuffer(file.buffer)) {
//       // 如果是 Buffer 类型，获取文件的类型信息
//       file.type = (await fileTypeFromBuffer(file.buffer)) || {};
//       // 计算文件的 md5 值
//       file.md5 = md5(file.buffer);
//       // 如果文件名称为空，生成一个新的文件名称
//       file.name ??= `${Date.now().toString(36)}.${file.md5.slice(0, 8)}.${file.type.ext}`;
//       // 如果配置中指定了文件大小限制，并且文件大小超过限制，重新处理文件
//       if (
//         "size" in opts &&
//         typeof opts.size === "number" &&
//         file.buffer.length > opts.size
//       )
//         file.buffer = await this.Buffer(data.file, opts);
//     }
//   } catch (err) {
//     // 捕获异常并记录错误日志
//     logger.error(["文件类型检测错误", file, err]);
//   }
//   // 如果文件名称仍然为空，生成一个新的文件名称
//   file.name ??= `${Date.now().toString(36)}-${path.basename(file.url)}`;
//   // 返回包含文件类型信息的对象
//   return file;
// }

export async function exec(cmd: string | string[], opts: ExecOptions & { quiet?: boolean } = {}) {
  // TODO 这个函数需要重写
  const start_time = Date.now();
  const name = logger.cyan(Array.isArray(cmd) ? cmd.join(" ") : cmd);

  // 记录命令开始日志
  logger.log(opts.quiet ? "debug" : "mark", name, "Command");

  // 设置默认编码
  opts.encoding ??= "buffer";

  try {
    let result;
    if (Array.isArray(cmd)) {
      result = await execFilePromise(cmd[0], cmd.slice(1), opts);
    } else {
      result = await execPromise(cmd, opts);
    }

    const stdout: string = String(result.stdout).trim();
    const stderr: string = String(result.stderr).trim();
    const raw: { stdout: string | Buffer; stderr: string | Buffer } = {
      stdout: result.stdout,
      stderr: result.stderr,
    };

    // 记录命令完成日志
    logger.log(
      opts.quiet ? "debug" : "mark",
      `${name} ${logger.green(`[完成${getTimeDiff(start_time)}]`)} ${stdout ? `\n${stdout}` : ""}${stderr ? logger.red(`\n${stderr}`) : ""}`,
      "Command",
    );

    return { error: undefined, stdout, stderr, raw };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 错误是任意类型
  } catch (error: any) {
    const stdout = String(error.stdout || "").trim();
    const stderr = String(error.stderr || "").trim();
    const raw = { stdout: error.stdout || "", stderr: error.stderr || "" };

    // 记录错误日志
    logger.log(opts.quiet ? "debug" : "error", error, "Command");

    return { error, stdout, stderr, raw };
  }
}

// async cmdPath(cmd, opts = {}) {
//   const ret = await this.exec(
//     `${process.platform === "win32" ? "where" : "command -v"} "${cmd}"`,
//     { quiet: true, ...opts }
//   );
//   return ret.error ? false : ret.stdout;
// }

// debounceTime = Symbol("debounceTime");
// debounce(func, time = 5000) {
//   const debounceTime = this.debounceTime;
//   let promise = false;
//   function ret(...args) {
//     if (promise) {
//       if (promise.start)
//         return (async () => {
//           try {
//             await promise.promise;
//           } finally {
//             return ret.apply(
//               Object.assign({ [debounceTime]: time }, this),
//               args
//             );
//           }
//         })();
//       else clearTimeout(promise.timeout);
//     } else {
//       promise = {};
//       promise.promise = new Promise((...args) => {
//         promise.resolve = args[0];
//         promise.reject = args[1];
//       });
//     }

//     promise.timeout = setTimeout(async () => {
//       try {
//         promise.start = true;
//         promise.resolve(await func.apply(this, args));
//       } catch (err) {
//         promise.reject(err);
//       } finally {
//         promise = false;
//       }
//     }, this?.[debounceTime] ?? 0);
//     return promise.promise;
//   }
//   return ret;
// }
