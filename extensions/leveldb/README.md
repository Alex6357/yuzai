# 雨仔 LevelDB 扩展

LevelDB 扩展为雨仔机器人框架提供基于 LevelDB 的键值对数据库支持。该扩展封装了 LevelDB 数据库操作，提供简单易用的 API 接口。

## 功能特性

- 基于 LevelDB 的高性能键值对存储
- 支持 JSON 格式数据存储
- 可配置的数据库存储路径

## 配置

- [path](file://e:\Develop\github\yunzai-ts\extensions\leveldb\index.ts#L12-L12): 数据库文件存储路径 (默认: "leveldb")

默认配置文件位于 `extensions/leveldb/config/default.toml`，实际配置文件位于 `config/leveldb.toml`

## 使用方法

在代码中直接导入即可使用：

```typescript
import { importExtension } from "yuzai/extensions";
const { default: db } = await importExtension("leveldb");

// 存储数据
await db.put("key", { name: "test", value: 123 });

// 获取数据
const value = await db.get("key");

// 删除数据
await db.del("key");

// 批量操作
await db.batch([
  { type: "put", key: "key1", value: "value1" },
  { type: "put", key: "key2", value: "value2" },
  { type: "del", key: "key3" },
]);
```
