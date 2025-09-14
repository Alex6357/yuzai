// 处理几种情况：run，start、stop、restart
// 这里先只处理 run
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import client from "yuzai/client";
import config from "yuzai/config";

// 设置进程标题
process.title = `雨仔 v${config.system.version} by Alex11`;

// 设置时区
// TODO 理论上说应该按当地时间设置时区？
process.env.TZ = "Asia/Shanghai";

// 设置根目录
config.rootDir = dirname(fileURLToPath(import.meta.url));

client.run();
