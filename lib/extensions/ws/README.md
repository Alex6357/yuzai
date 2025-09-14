# 雨仔 WebSocket 扩展

正常来说，Yuzai 不关心 Adapter 的具体实现，因此 Adapter 应该自己维护 WebSocket 服务器。
但鉴于反向 WebSocket 在各种协议中非常常见，以及出于兼容性考虑，这里以扩展的形式提供一个反向 WebSocket 服务器。
适配器注册的流程为：

1. 调用 `WS.addPath(path, onConnectHandler)`，注册一个 WebSocket 路径和连接处理函数。
2. WebSocketServer 会在收到 WebSocket 升级请求时调用 `onConnectHandler`，并传递 WebSocket 实例，适配器应保存该实例。
3. `onConnectHandler` 应返回一个处理函数 `wsHandler`，WS 会在收到消息时调用该函数，并传递消息和 WebSocket 实例。
4. 适配器可以在 wsHandler 中处理消息，并通过 WebSocket 实例的 `sendMessage()` 方法发送消息。

相关方法类型注释如下：

```typescript
type wsHandler = (
  message: WebSocket.RawData,
  ws: WebSocket & { sendMessage: (data: object) => void },
) => void;
type onConnectHandler = (
  ws: WebSocket & { sendMessage: (data: object) => void },
  path: string,
) => wsHandler;
type addPath = (path: string, onConnectHandler: onConnectHandler) => void;
```

传递给适配器的 WebSocket 实例包含包装日志后的 `sendMessage()` 方法，建议用此发送消息。

可以参考 `adapters/OneBotv11.ts` 中的实现。
