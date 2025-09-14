# 雨仔 OneBot 11 类型定义扩展

OneBot 11 类型定义扩展为雨仔机器人框架提供完整的 OneBot 11 和 go-cqhttp 协议的 TypeScript 类型定义。该扩展包含了所有标准事件、消息和 API 响应的类型定义，帮助开发者在编写适配器和插件时获得完整的类型检查和智能提示。

## 功能特性

- 完整的 OneBot 11 标准类型定义
- 扩展的 go-cqhttp 类型支持
- 详细的 TypeScript 接口和类型注释
- 包含所有消息段类型的定义
- 支持所有事件类型的类型定义

## 支持的类型

### 消息段类型

- 文本消息段 (text)
- 表情消息段 (face)
- 图片消息段 (image)
- 语音消息段 (record)
- 视频消息段 (video)
- At 消息段 (at)
- 回复消息段 (reply)
- JSON 消息段 (json)
- XML 消息段 (xml)
- 链接分享消息段 (share)
- 音乐分享消息段 (music)
- 戳一戳消息段 (poke)
- 等数十种消息段类型

### 事件类型

- 消息事件 (私聊消息、群消息)
- 通知事件 (群文件上传、群管理员变动、群成员增减等)
- 请求事件 (好友请求、群请求/邀请)
- 元事件 (生命周期、心跳事件)

## 使用方法

在代码中导入需要的类型：

```typescript
import type {
  Onebot11MessageEvent,
  Onebot11PrivateMessageEvent,
  Onebot11GroupMessageEvent,
  Onebot11TextMessageSegment,
  Onebot11ImageMessageSegment,
} from "yuzai/extensions/onebot_11_types";

// 在适配器中使用类型定义处理消息
function handleMessage(event: Onebot11MessageEvent) {
  if (event.message_type === "private") {
    // 处理私聊消息
    const privateEvent = event as Onebot11PrivateMessageEvent;
    console.log(`收到私聊消息来自用户 ${privateEvent.user_id}`);
  }
}
```
