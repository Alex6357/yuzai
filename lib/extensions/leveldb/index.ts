import path from "node:path";

import { Level } from "level";

import config from "yuzai/config";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 数据库存储类型由调用者确定
const db = new Level<string, any>(
  config.system.leveldb?.path ?? path.join(config.rootDir, "data", "leveldb", "db"),
  { valueEncoding: "json" },
);

export default db;
