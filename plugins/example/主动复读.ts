import Plugin from "../../lib/plugin.ts";

const helpMessage = `复读插件
复读用户发送的内容，然后撤回
命令：#复读
`;

const repeatPlugin = new Plugin({
  id: "example.repeat",
  name: "复读",
  description: "复读用户发送的内容，然后撤回",
})
  .setHelpMessage(helpMessage)
  .addTrigger({
    name: "复读",
    description: "复读用户发送的内容，然后撤回",
    event: "message",

    regex: /^#复读$/,

    handler: async (event) => {
      repeatPlugin.startInteract(event, async (event) => {
        // 结束上下文
        repeatPlugin.finishInteract(event);
        // 复读内容
        event.reply(event.message, false, 5);
      });
    },
  });

export default repeatPlugin;
