# Yuzai 管理面板扩展

Yuzai 机器人框架的可视化管理面板扩展，提供基于 Web 的管理界面。

## 功能特点

- 基于 Express.js 和 SvelteKit 构建
- 提供 HTTP 和 HTTPS 两种访问方式
- 可视化管理界面，便于监控和配置机器人
- 显示已安装的扩展列表

## 安装与配置

该扩展默认已包含在 Yuzai 项目中，且默认启用。

### 配置文件

配置文件位于 `config/pannel.toml`，如果不存在，系统会自动从 `extensions/pannel/config/default.toml` 复制默认配置。

## 启动参数说明

- `host`: 服务器监听地址
- `port`: HTTP 服务器端口
- `https.enabled`: 是否启用 HTTPS 服务器
- `https.host`: HTTPS 服务器监听地址
- `https.port`: HTTPS 服务器端口
- `https.key`: HTTPS 私钥路径
- `https.cert`: HTTPS 证书路径

## 使用方法

1. 启动 Yuzai 机器人框架
2. 管理面板会自动启动
3. 在浏览器中访问 `http://localhost:2540` (默认地址)
4. 如启用 HTTPS，也可通过 `https://localhost:2541` 访问

## 开发

### 前端开发

管理面板前端使用 SvelteKit 构建，相关文件位于 `src/` 目录中。

```bash

# 开发模式

pnpm dev

# 构建生产版本

pnpm build

# 预览生产构建

pnpm preview
```

## 目录结构

```text
build/ # SvelteKit 构建输出目录
config/ # 默认配置文件
src/ # 前端源代码
lib/ # 共享库文件
routes/ # 页面路由
```

## 许可证

本项目采用 GPL-3.0-or-later 许可证。
