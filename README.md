# 雨仔

基于 TRSS-Yunzai 重新设计，使用 TypeScript 实现，与企鹅与米家游戏解耦，兼容 Yunzai 适配器和插件。

## 环境要求

- Nodejs >=22.6.0,<22.18.0 或 >=23.0.0,<23.6.0，使用 `npm run app:old` 启动
- Nodejs >=22.18.0,<23.0.0 或 >=23.6.0，使用 `npm run app` 启动
- 不支持其他更旧版本的 Nodejs

建议使用当前 LTS 的 Nodejs >=22.18.0。等 Nodejs 24 进入 LTS 后，再升级到 Nodejs 24。

## 使用方法

1. 克隆项目

   ```bash
   git clone https://github.com/Alex6357/yuzai.git
   ```

2. 安装依赖

   ```bash
   cd yuzai
   npm install --production
   ```

3. 启动项目

   ```bash
   npm run app
   # 或 npm run app:old，根据 Nodejs 版本选择启动方式
   ```

## 开发进度

- [x] 设计架构
- [x] 实现消息类、插件与适配器系统
- [ ] 实现 Notice 事件
- [ ] 完成 OneBotv11 适配器迁移
- [ ] 实现 Guild-Channel 支持
- [ ] 撰写文档
- [ ] 迁移现有插件
- [ ] 迁移其他适配器
- [ ] 实现对 Yunzai 的兼容
