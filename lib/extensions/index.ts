import fs from "node:fs/promises";
import path from "node:path";

import logger from "../logger.ts";
import config from "../config.ts";
import {
  INSTALL_RETRY_CONFIG,
  waitForInstallation,
  installDependencies,
  getInstallStatus,
  setInstallStatus,
} from "../dependency-manager.ts";

/**
 * 按需导入模块，如果模块有依赖则先安装依赖
 * @param extensionName 插件文件夹名称
 * @param options 导入选项
 */
export async function importExtension(
  extensionName: string,
  options: {
    maxRetries?: number; // 最大重试次数
    forceReinstall?: boolean; // 是否强制重新安装
  } = {},
) {
  // 构建插件路径
  const extensionDir = path.join(config.rootDir, "lib", "extensions", extensionName);
  const modulePath = path.join(extensionDir, "index.ts");
  const resolvedPath = path.resolve(modulePath);

  const maxRetries = options.maxRetries ?? INSTALL_RETRY_CONFIG.maxRetries;
  const forceReinstall = options.forceReinstall ?? false;

  // 获取或创建安装状态
  if (!getInstallStatus(extensionDir)) {
    setInstallStatus(extensionDir, {
      installing: false,
      installed: false,
      error: false,
    });
  }

  const status = getInstallStatus(extensionDir);

  try {
    // 检查是否存在 package.json
    const packageJsonPath = path.join(extensionDir, "package.json");
    await fs.access(packageJsonPath);

    // 检查安装状态，如果没有状态直接进入安装流程
    if (status) {
      // 检查是否需要重新安装
      const shouldReinstall =
        forceReinstall ||
        (status.error && !status.installing) ||
        (status.installed &&
          status.lastInstallTime &&
          Date.now() - status.lastInstallTime > INSTALL_RETRY_CONFIG.reinstallInterval);

      // 如果正在安装，等待安装完成
      if (status.installing && !forceReinstall) {
        await waitForInstallation(extensionDir);
      }

      // 如果尚未安装或需要重新安装
      if (!status.installed || shouldReinstall) {
        await installDependencies(extensionDir, maxRetries, "ImportUtil", false);
      }
    }

    // 导入模块
    const module = await import(resolvedPath);
    return module;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 错误是任意类型
  } catch (error: any) {
    if (error.code === "ENOENT") {
      // 如果是文件不存在的错误，直接重新抛出
      throw error;
    }

    // 记录错误状态
    if (!getInstallStatus(extensionDir)) {
      setInstallStatus(extensionDir, {
        installing: false,
        installed: false,
        error: true,
      });
    } else {
      const currentStatus = getInstallStatus(extensionDir);
      if (currentStatus) {
        currentStatus.error = true;
        currentStatus.installing = false;
      }
    }

    logger.error(`插件导入失败 ${extensionName}: ${error.message}`, "ImportUtil");
    throw error;
  }
}

/**
 * 清除插件安装状态（可用于强制重新安装）
 * @param extensionName 插件文件夹名称
 */
export function clearExtensionInstallStatus(extensionName: string): void {
  const extensionDir = path.join(config.rootDir, "lib", "extensions", extensionName);

  if (getInstallStatus(extensionDir)) {
    setInstallStatus(extensionDir, {
      installing: false,
      installed: false,
      error: false,
    });
    logger.debug(`已清除插件 ${extensionDir} 的安装状态`, "ImportUtil");
  }
}

/**
 * 获取插件安装状态
 * @param extensionName 插件文件夹名称
 */
export function getExtensionInstallStatus(extensionName: string) {
  const extensionDir = path.join(config.rootDir, "lib", "extensions", extensionName);
  return getInstallStatus(extensionDir);
}
