import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";

import logger from "./logger.ts";
import config from "./config.ts";
import { execPromise } from "./utils.ts";

export interface InstallStatus {
  /**
   * 是否正在安装
   */
  installing: boolean;
  /**
   * 是否已安装
   */
  installed: boolean;
  /**
   * 是否出错
   */
  error: boolean;
  /**
   * 最后一次安装时间
   */
  lastInstallTime?: number;
}

/**
 * 存储模块安装状态的 Map
 * key: 模块路径
 * value: 安装状态对象
 */
const installStatus = new Map<string, InstallStatus>();

/**
 * 安装状态持久化文件路径
 */
const INSTALL_STATUS_FILE = path.join(config.rootDir, "data", "install_status.json");

/**
 * 安装重试配置
 */
export const INSTALL_RETRY_CONFIG = {
  maxRetries: 3, // 最大重试次数
  retryDelay: 2000, // 重试间隔（毫秒）
  reinstallInterval: 300000, // 重新安装间隔（5分钟，毫秒）
};

/**
 * 检查 pnpm 是否可用
 */
async function isPnpmAvailable(): Promise<boolean> {
  try {
    await execPromise("pnpm --version");
    return true;
  } catch {
    return false;
  }
}

/**
 * 获取要使用的包管理器命令
 */
async function getPackageManagerCommand(): Promise<string> {
  return (await isPnpmAvailable()) ? "pnpm install --prod" : "npm install --omit=dev";
}

/**
 * 保存安装状态到文件
 */
async function saveInstallStatus() {
  try {
    // 确保 data 目录存在
    const dataDir = path.join(config.rootDir, "data");
    if (!fsSync.existsSync(dataDir)) {
      fsSync.mkdirSync(dataDir, { recursive: true });
    }

    // 将 Map 转换为普通对象以便序列化
    const statusObj: Record<string, InstallStatus> = {};
    for (const [key, value] of installStatus.entries()) {
      statusObj[key] = value;
    }

    // 写入文件
    await fs.writeFile(INSTALL_STATUS_FILE, JSON.stringify(statusObj, null, 2), "utf8");
  } catch (error) {
    logger.warn(`保存安装状态失败: ${error}`, "DependencyManager");
  }
}

/**
 * 从文件加载安装状态
 */
async function loadInstallStatus() {
  try {
    // 检查状态文件是否存在
    if (!fsSync.existsSync(INSTALL_STATUS_FILE)) {
      return;
    }

    // 读取文件内容
    const data = await fs.readFile(INSTALL_STATUS_FILE, "utf8");
    const statusObj = JSON.parse(data);

    // 将普通对象转换回 Map
    installStatus.clear();
    for (const [key, value] of Object.entries(statusObj)) {
      installStatus.set(key, value as InstallStatus);
    }
  } catch (error) {
    logger.warn(`加载安装状态失败: ${error}`, "DependencyManager");
  }
}

/**
 * 等待模块安装完成
 * @param moduleDir 模块目录
 */
export async function waitForInstallation(moduleDir: string): Promise<void> {
  const status = installStatus.get(moduleDir);

  // 如果没有状态或没有在安装，直接返回
  if (!status || !status.installing) {
    return;
  }

  // 等待安装完成，最多等待30秒
  let waited = 0;
  const maxWait = 30000;
  const checkInterval = 100;

  while (status.installing && waited < maxWait) {
    await new Promise((resolve) => setTimeout(resolve, checkInterval));
    waited += checkInterval;
  }

  if (status.installing) {
    throw new Error(`模块 ${moduleDir} 安装超时`);
  }
}

/**
 * 安装依赖
 * @param moduleDir 模块目录
 * @param maxRetries 最大重试次数
 * @param logContext 日志上下文
 * @param shouldSaveStatus 是否应该保存状态到文件
 */
export async function installDependencies(
  moduleDir: string,
  maxRetries: number,
  logContext: string,
  shouldSaveStatus = false,
): Promise<void> {
  const status = installStatus.get(moduleDir);

  // 如果没有状态，创建一个新的
  if (!status) {
    installStatus.set(moduleDir, {
      installing: true,
      installed: false,
      error: false,
    });
  } else {
    // 标记为正在安装
    status.installing = true;
    status.error = false;
  }

  // 保存状态到文件
  if (shouldSaveStatus) {
    await saveInstallStatus();
  }

  const currentStatus = installStatus.get(moduleDir);
  if (!currentStatus) {
    throw new Error(`无法获取模块 ${moduleDir} 的状态`);
  }

  try {
    // 检查 node_modules 是否存在
    const nodeModulesPath = path.join(moduleDir, "node_modules");
    let needInstall = true;

    try {
      await fs.access(nodeModulesPath);
      needInstall = false;
    } catch {
      // node_modules 不存在，需要安装依赖
    }

    // 如果需要安装依赖或强制重新安装
    if (needInstall || currentStatus.error) {
      const packageManagerCommand = await getPackageManagerCommand();
      logger.mark(`正在为模块 ${path.basename(moduleDir)} 安装依赖...`, logContext);

      // 尝试安装依赖（带重试机制）
      let retries = 0;
      let installSuccess = false;

      while (retries < maxRetries && !installSuccess) {
        try {
          const { stdout, stderr } = await execPromise(packageManagerCommand, {
            cwd: moduleDir,
            maxBuffer: 1024 * 1024, // 增加输出缓冲区大小
          });

          if (stdout) logger.debug(stdout, logContext);
          if (stderr) logger.warn(stderr, logContext);

          installSuccess = true;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 错误是任意类型
        } catch (installError: any) {
          retries++;
          logger.warn(
            `模块 ${path.basename(moduleDir)} 依赖安装失败 (尝试 ${retries}/${maxRetries}): ${installError.message}`,
            logContext,
          );

          // 如果不是最后一次重试，等待一段时间再重试
          if (retries < maxRetries) {
            await new Promise((resolve) => setTimeout(resolve, INSTALL_RETRY_CONFIG.retryDelay));
          }
        }
      }

      // 如果所有重试都失败了
      if (!installSuccess) {
        throw new Error(
          `模块 ${path.basename(moduleDir)} 依赖安装失败，已达到最大重试次数 ${maxRetries}`,
        );
      }

      logger.mark(`模块 ${path.basename(moduleDir)} 依赖安装完成`, logContext);
    }

    // 更新状态
    currentStatus.installed = true;
    currentStatus.installing = false;
    currentStatus.error = false;
    currentStatus.lastInstallTime = Date.now();

    // 保存状态到文件
    if (shouldSaveStatus) {
      await saveInstallStatus();
    }
  } catch (error) {
    // 更新错误状态
    currentStatus.installing = false;
    currentStatus.error = true;
    currentStatus.lastInstallTime = Date.now();

    // 保存状态到文件
    if (shouldSaveStatus) {
      await saveInstallStatus();
    }

    logger.error(`模块 ${path.basename(moduleDir)} 依赖安装过程中出现错误: ${error}`, logContext);
    throw error;
  }
}

/**
 * 获取模块安装状态
 * @param moduleDir 模块目录
 */
export function getInstallStatus(moduleDir: string) {
  return installStatus.get(moduleDir);
}

/**
 * 设置模块安装状态
 * @param moduleDir 模块目录
 * @param status 状态对象
 */
export function setInstallStatus(
  moduleDir: string,
  status: { installing: boolean; installed: boolean; error: boolean; lastInstallTime?: number },
) {
  installStatus.set(moduleDir, status);
}

/**
 * 加载持久化的安装状态
 */
export async function loadPersistentInstallStatus(): Promise<void> {
  await loadInstallStatus();
}
