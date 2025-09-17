import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { getLogger } from "yuzai/logger";
import config from "yuzai/config";
import { execPromise } from "yuzai/utils";

const logger = getLogger("DependencyManager");

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
  /**
   * 依赖项的哈希值
   */
  dependenciesHash?: string;
  /**
   * 是否需要构建
   */
  needBuild?: boolean;
  /**
   * 构建脚本名称
   */
  buildScript?: string;
  /**
   * 版本号
   */
  version?: string;
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
const INSTALL_STATUS_FILE = path.resolve(config.rootDir, "data", "install_status.json");

/**
 * 安装重试配置
 */
export const INSTALL_RETRY_CONFIG = {
  maxRetries: 3, // 最大重试次数
  retryDelay: 2000, // 重试间隔（毫秒）
};

async function checkPnpmAvailable() {
  try {
    await execPromise("pnpm --version");
    return true;
  } catch {
    return false;
  }
}

/**
 * 检查 pnpm 是否可用
 */
const isPnpmAvailable = await checkPnpmAvailable();

/**
 * 获取要使用的包管理器命令
 * @param needBuild 是否需要构建（如果需要构建，则不能使用--prod参数）
 */
async function getPackageManagerCommand(needBuild = false): Promise<string> {
  const isPnpm = isPnpmAvailable;

  if (isPnpm) {
    return needBuild ? "pnpm --force install" : "pnpm --force install --prod";
  } else {
    return needBuild ? "npm --force install" : "npm --force install --omit=dev";
  }
}

/**
 * 获取模块的构建和依赖信息
 */
async function getModuleInfo(moduleDir: string): Promise<{
  needBuild: boolean;
  buildScript: string;
  version: string;
  dependenciesHash: string;
}> {
  const packageJsonPath = path.join(config.rootDir, moduleDir, "package.json");

  try {
    const packageJsonContent = await fs.readFile(packageJsonPath, "utf8");
    const packageJson = JSON.parse(packageJsonContent);

    // 检查是否需要构建
    const needBuild = !!(packageJson.yuzai && packageJson.yuzai.needBuild);
    const buildScript = (packageJson.yuzai && packageJson.yuzai.buildScript) || "build";
    const version = packageJson.version || "0.0.0";

    // 提取依赖信息
    const dependencies = packageJson.dependencies || {};
    const devDependencies = packageJson.devDependencies || {};

    // 创建依赖字符串并计算哈希
    const depsString = JSON.stringify({
      dependencies,
      devDependencies: needBuild ? devDependencies : {}, // 如果需要构建，包含 devDependencies
    });

    const dependenciesHash = crypto.createHash("md5").update(depsString).digest("hex");

    return {
      needBuild,
      buildScript,
      version,
      dependenciesHash,
    };
  } catch (error) {
    logger.warn(`获取模块信息失败: ${error}`);
    return {
      needBuild: false,
      buildScript: "build",
      version: "0.0.0",
      dependenciesHash: "",
    };
  }
}

/**
 * 检查模块是否需要重新安装或构建
 */
async function checkModuleStatus(moduleDir: string): Promise<{
  needInstall: boolean;
  needBuild: boolean;
  moduleInfo: {
    needBuild: boolean;
    buildScript: string;
    version: string;
    dependenciesHash: string;
  };
}> {
  const status = getInstallStatus(moduleDir);
  const moduleInfo = await getModuleInfo(moduleDir);

  // 如果没有状态或没有安装过，需要安装
  if (!status || !status.installed) {
    return {
      needInstall: true,
      needBuild: false,
      moduleInfo,
    };
  }

  // 如果之前安装出错，需要重新安装
  if (status.error) {
    return {
      needInstall: true,
      needBuild: false,
      moduleInfo,
    };
  }

  // 检查依赖哈希是否变化
  if (moduleInfo.dependenciesHash && status.dependenciesHash !== moduleInfo.dependenciesHash) {
    return {
      needInstall: true,
      needBuild: false,
      moduleInfo,
    };
  }

  // 检查 node_modules 是否存在
  const nodeModulesPath = path.join(config.rootDir, moduleDir, "node_modules");
  try {
    await fs.access(nodeModulesPath);
    // 检查 node_modules 是否为空
    const needReinstall = fsSync.readdirSync(nodeModulesPath).length === 0;

    if (needReinstall) {
      return {
        needInstall: true,
        needBuild: false,
        moduleInfo,
      };
    }
  } catch {
    // node_modules 不存在，需要安装
    return {
      needInstall: true,
      needBuild: false,
      moduleInfo,
    };
  }

  // 检查是否需要重新构建（版本变化且需要构建）
  const needRebuild = moduleInfo.needBuild && status.version !== moduleInfo.version;

  return {
    needInstall: false,
    needBuild: needRebuild,
    moduleInfo,
  };
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
    logger.warn(`保存安装状态失败: ${error}`);
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
    logger.warn(`加载安装状态失败: ${error}`);
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
export function setInstallStatus(moduleDir: string, status: InstallStatus) {
  installStatus.set(moduleDir, { ...installStatus.get(moduleDir), ...status });
  saveInstallStatus();
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

async function runInstall(
  moduleDir: string,
  moduleInfo: {
    needBuild: boolean;
    buildScript: string;
    version: string;
    dependenciesHash: string;
  },
): Promise<void> {
  try {
    const packageManagerCommand = await getPackageManagerCommand(moduleInfo.needBuild);
    logger.mark(`正在为模块 ${path.basename(moduleDir)} 安装依赖...`);

    const status = getInstallStatus(moduleDir);
    if (!status) {
      setInstallStatus(moduleDir, {
        installing: true,
        installed: false,
        error: false,
      });
    }

    // 尝试安装依赖（带重试机制）
    let retries = 0;
    let installSuccess = false;

    while (retries < INSTALL_RETRY_CONFIG.maxRetries && !installSuccess) {
      try {
        const { stdout, stderr } = await execPromise(
          `${packageManagerCommand} --dir ${path.join(config.rootDir, moduleDir)}`,
          {
            maxBuffer: 1024 * 1024, // 增加输出缓冲区大小
          },
        );

        if (stdout) logger.debug(stdout);
        if (stderr) logger.warn(stderr);

        installSuccess = true;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 错误是任意类型
      } catch (installError: any) {
        retries++;
        logger.warn(
          `模块 ${moduleDir} 依赖安装失败 (尝试 ${retries}/${INSTALL_RETRY_CONFIG.maxRetries}): ${installError.message}`,
        );

        // 如果不是最后一次重试，等待一段时间再重试
        if (retries < INSTALL_RETRY_CONFIG.maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, INSTALL_RETRY_CONFIG.retryDelay));
        }
      }
    }

    // 如果所有重试都失败了
    if (!installSuccess) {
      throw new Error(
        `模块 ${moduleDir} 依赖安装失败，已达到最大重试次数 ${INSTALL_RETRY_CONFIG.maxRetries}`,
      );
    }

    logger.mark(`模块 ${moduleDir} 依赖安装完成`);

    setInstallStatus(moduleDir, {
      installed: true,
      installing: false,
      error: false,
      lastInstallTime: Date.now(),
      dependenciesHash: moduleInfo.dependenciesHash,
    });
  } catch (error) {
    setInstallStatus(moduleDir, {
      installed: false,
      installing: false,
      error: true,
      lastInstallTime: undefined,
      dependenciesHash: undefined,
    });

    logger.error(`模块 ${moduleDir} 依赖安装过程中出现错误: ${error}`);
    throw error;
  }
}

/**
 * 执行构建脚本
 */
async function runBuild(
  moduleDir: string,
  moduleInfo: {
    needBuild: boolean;
    buildScript: string;
    version: string;
    dependenciesHash: string;
  },
): Promise<void> {
  try {
    logger.mark(`正在为模块 ${moduleDir} 执行构建脚本: ${moduleInfo.buildScript}...`);

    setInstallStatus(moduleDir, {
      installing: true,
      installed: false,
      error: false,
      needBuild: true,
      buildScript: moduleInfo.buildScript,
    });

    const { stdout, stderr } = await execPromise(
      `${isPnpmAvailable ? "pnpm" : "npm"} --dir ${path.join(config.rootDir, moduleDir)} run ${moduleInfo.buildScript}`,
      {
        maxBuffer: 1024 * 1024 * 10, // 增加输出缓冲区大小，构建可能输出较多
      },
    );

    if (stdout) logger.debug(stdout);
    if (stderr) logger.warn(stderr);

    setInstallStatus(moduleDir, {
      installing: false,
      installed: true,
      error: false,
      version: moduleInfo.version,
    });

    logger.mark(`模块 ${moduleDir} 构建完成`);
  } catch (error) {
    setInstallStatus(moduleDir, {
      installing: false,
      installed: false,
      error: true,
      version: undefined,
    });
    logger.error(`模块 ${moduleDir} 构建失败: ${error}`);
    throw error;
  }
}

/**
 * 安装依赖
 * @param moduleDir 模块目录
 * @param maxRetries 最大重试次数
 * @param shouldSaveStatus 是否应该保存状态到文件
 */
export async function installDependencies(
  moduleDir: string,
  forceReinstall = false,
): Promise<void> {
  // 检查模块状态
  const { needInstall, needBuild, moduleInfo } = await checkModuleStatus(moduleDir);

  if (forceReinstall) {
    try {
      await runInstall(moduleDir, moduleInfo);
      if (moduleInfo.needBuild) await runBuild(moduleDir, moduleInfo);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 错误是任意类型
    } catch (error: any) {
      // 直接把 runInstall 和 runBuild 的错误抛给上层
      throw error;
    }
  }

  // 如果不需要重新安装和重新构建，直接返回
  if (!needInstall && !needBuild) {
    logger.debug(`模块 ${moduleDir} 无需安装或构建`);
    return;
  }

  // 如果需要重新构建但不需要重新安装
  if (!needInstall && needBuild && !forceReinstall) {
    logger.debug(`模块 ${moduleDir} 版本变化，需要重新构建`);
    try {
      await runBuild(moduleDir, moduleInfo);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 错误是任意类型
    } catch (error: any) {
      throw error;
    }
    return;
  }

  try {
    await runInstall(moduleDir, moduleInfo);
    if (moduleInfo.needBuild) await runBuild(moduleDir, moduleInfo);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 错误是任意类型
  } catch (error: any) {
    throw error;
  }
}

await loadInstallStatus();
