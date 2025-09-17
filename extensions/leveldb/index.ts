import path from "node:path";

import { Level } from "level";

import { getDataDir } from "yuzai/utils";
import config, {
  checkConfigFileExists,
  copyDefaultConfigFile,
  getConfigFromFile,
} from "yuzai/config";

interface LevelDBConfig {
  readonly path: string;
}
export const _pannelConfig = [
  {
    id: "path",
    type: "string",
    label: "数据文件路径",
    description: "数据文件路径，在 data 目录下",
  },
];
if (!checkConfigFileExists("leveldb"))
  copyDefaultConfigFile("leveldb", "extensions/leveldb/config/default.toml");
const leveldbConfig = getConfigFromFile<LevelDBConfig>("leveldb");

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 数据库存储类型由调用者确定
const db = new Level<string, any>(
  leveldbConfig?.path
    ? path.resolve(config.rootDir, "data", leveldbConfig.path)
    : path.resolve(getDataDir("leveldb")),
  { valueEncoding: "json" },
);

export default db;
