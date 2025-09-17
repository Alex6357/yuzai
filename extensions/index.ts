import path from "node:path";
import { pathToFileURL } from "node:url";
import fs from "node:fs/promises";

import { getLogger } from "yuzai/logger";
import config from "yuzai/config";
import {
  waitForInstallation,
  installDependencies,
  getInstallStatus,
  setInstallStatus,
} from "yuzai/dependency-manager";
import client from "yuzai/client";

const logger = getLogger("ImportUtil");

/**
 * 模块导入缓存
 * key: 模块路径
 * value: 导入的模块
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 导入模块类型为 any
const moduleCache = new Map<string, any>();

/**
 * 按需导入模块，如果模块有依赖则先安装依赖
 * @param extensionName 插件文件夹名称
 * @param options 导入选项
 */
export async function importExtension(
  extensionName: string,
  forceReinstall = false, // 是否强制重新安装
) {
  // 构建插件路径
  const extensionDir = path.join("extensions", extensionName);

  // 检查缓存
  if (moduleCache.has(extensionDir)) {
    return moduleCache.get(extensionDir);
  }

  const status = getInstallStatus(extensionDir);

  try {
    if (status) {
      // 如果正在安装，等待安装完成
      if (status.installing) {
        await waitForInstallation(extensionDir);
      }
    }

    await installDependencies(extensionDir, forceReinstall);

    // 导入模块
    const module = await import(
      pathToFileURL(path.resolve(config.rootDir, extensionDir, "index.ts")).toString()
    );

    // 缓存模块
    moduleCache.set(extensionDir, module);

    return module;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 错误是任意类型
  } catch (error: any) {
    logger.fatal(`插件导入失败 ${extensionName}: ${error.message}`);
    client.gracefulExit(1);
  }
}

/**
 * 清除插件安装状态（可用于强制重新安装）
 * @param extensionName 插件文件夹名称
 */
export function clearExtensionInstallStatus(extensionName: string): void {
  const extensionDir = path.join("extensions", extensionName);

  if (getInstallStatus(extensionDir)) {
    setInstallStatus(extensionDir, {
      installing: false,
      installed: false,
      error: false,
    });
    logger.debug(`已清除插件 ${extensionDir} 的安装状态`);
  }
}

/**
 * 获取插件安装状态
 * @param extensionName 插件文件夹名称
 */
export function getExtensionInstallStatus(extensionName: string) {
  const extensionDir = path.resolve(config.rootDir, "extensions", extensionName);
  return getInstallStatus(extensionDir);
}

/**
 * 清除模块缓存
 * @param extensionName 可选，指定要清除的扩展名
 */
export function clearModuleCache(extensionName?: string): void {
  if (extensionName) {
    const extensionDir = path.join("extensions", extensionName);
    const modulePath = path.resolve(config.rootDir, extensionDir);

    moduleCache.delete(modulePath);
    logger.debug(`已清除插件 ${extensionName} 的模块缓存`);
  } else {
    moduleCache.clear();
    logger.debug("已清除所有模块缓存");
  }
}

export async function autoImportExtensions(): Promise<void> {
  const extensionsDir = path.resolve(config.rootDir, "extensions");

  try {
    const extensionDirs = await fs.readdir(extensionsDir);

    for (const extensionName of extensionDirs) {
      // 跳过index.ts文件
      if (extensionName === "index.ts") continue;

      const extensionPath = path.join(extensionsDir, extensionName);
      const stat = await fs.stat(extensionPath);

      // 确保是一个目录
      if (!stat.isDirectory()) continue;

      const packageJsonPath = path.join(extensionPath, "package.json");

      try {
        // 检查package.json是否存在
        const packageJsonStat = await fs.stat(packageJsonPath);
        if (!packageJsonStat.isFile()) continue;

        // 读取package.json
        const packageJsonContent = await fs.readFile(packageJsonPath, "utf-8");
        const packageJson = JSON.parse(packageJsonContent);

        // 检查yuzai:autoImport是否为true
        if (packageJson.yuzai?.autoImport === true) {
          logger.info(`自动导入扩展: ${extensionName}`);
          await importExtension(extensionName);
        }
      } catch (error) {
        // 如果读取或解析package.json出错，继续处理下一个扩展
        logger.warn([`读取扩展 ${extensionName} 的 package.json 时出错:`, error]);
        continue;
      }
    }
  } catch (error) {
    logger.error(["自动导入扩展时出错:", error]);
  }
}

export function getExtensions() {
  return new Map(moduleCache);
}
