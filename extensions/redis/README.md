# 雨仔 Redis 扩展

Redis 扩展为雨仔机器人框架提供 Redis 数据库支持。该扩展自动处理 Redis 连接的建立、维护和错误恢复。

## 功能特性

- 自动连接到 Redis 服务器
- 连接失败时自动重试
- 支持本地 Redis 服务器自动启动
- 优雅的错误处理和连接恢复机制
- 程序退出时自动关闭连接

## 配置

Redis 扩展使用 `config.system.redis` 中的配置项：

- `host`: Redis 服务器地址 (默认: "127.0.0.1")
- `port`: Redis 服务器端口 (默认: 6379)
- [username](file://e:\Develop\github\yunzai-ts\lib\plugins\redis.ts#L14-L14): Redis 用户名 (可选)
- [password](file://e:\Develop\github\yunzai-ts\lib\plugins\redis.ts#L15-L15): Redis 密码 (可选)
- `db`: Redis 数据库编号 (默认: 0)
- `path`: Redis 服务器可执行文件路径 (用于自动启动)

## 使用方法

在代码中直接导入即可使用：

```typescript
import { importExtension } from "yuzai/extensions";
const redisClient = importExtension("redis");

// 使用 redisClient 进行操作
await redisClient.set("key", "value");
const value = await redisClient.get("key");
```
