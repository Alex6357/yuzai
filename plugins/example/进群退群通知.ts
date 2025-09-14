import { MessageBuilder } from "../../lib/message.ts";
import Plugin from "../../lib/plugin.ts";
import { importExtension } from "../../lib/extensions/index.ts";

const { default: redis } = await importExtension("redis");

const helpMessage = `进退群通知插件
当有人进群或退群时，会发送一条通知消息
`;

/** 欢迎语 */
const welcomeMessage = "欢迎新人！";

/** 欢迎通知 CD，单位秒 */
const welcomeCD = 30;

/** 退群通知语 */
const quitMessage = "退群了";

const plugin = new Plugin({
  id: "example.member_join_leave_notice",
  name: "进退群通知",
  description: "当有人进群或退群时发送一条通知消息",
})
  .setHelpMessage(helpMessage)
  .addTrigger({
    name: "进群通知",
    description: "当有人进群时发送一条通知消息",
    event: "notice.group.member_join",
    handler: async (event) => {
      if (event.data.userID === event.bot.id) return;

      // 保证键值不重复
      let key = `plugins:${plugin.id}:join_notice:group_${event.data.groupID}`;
      if (await redis.get(key)) return;
      // 设置过期时间
      redis.set(key, "1", { expiration: { type: "EX", value: welcomeCD } });

      await event.bot.sendMessage(
        // TODO 进一步简化消息构建
        // TODO 实现 Notice event 的 reply
        new MessageBuilder()
          .addAtBlock(event.data.userID)
          // 添加一个空格，保持跟 QQ 的默认行为一致
          .addTextBlock(" " + welcomeMessage)
          .build(),
        {
          groupID: event.data.groupID,
        },
      );
    },
  })
  .addTrigger({
    name: "退群通知",
    description: "当有人退群时发送一条通知消息",
    event: "notice.group.member_leave",
    handler: async (event) => {
      if (event.data.userID === event.bot.id) return;

      const name = event.platform?.member_card ?? event.platform?.member_nickname ?? "";
      const message = (name ? `${name}(${event.data.userID})` : event.data.userID) + quitMessage;

      await event.bot.sendMessage(message, {
        groupID: event.data.groupID,
      });
    },
  });

export default plugin;
