import EventEmitter from "node:events";

import { CronExpressionParser } from "cron-parser";

import { ConnectEvent, MessageEvent, NoticeEvent } from "./event.ts";
import type { EventIDs, MessageEventIDs, NoticeEventIDs } from "./event.ts";
import logger from "./logger.ts";

type InteractionKey =
  | `private:${string}`
  | `group:${string}:${string}`
  | `guild:${string}:${string}:${string}`;

abstract class Trigger<T> {
  readonly name: string;
  readonly description: string;
  readonly events: Set<EventIDs> = new Set<EventIDs>();

  protected _priority = 0;
  get priority() {
    return this._priority;
  }

  protected _abort = true;
  get break() {
    return this._abort;
  }

  protected _wait = true;
  get wait() {
    return this._wait;
  }

  protected handler: (event: T) => Promise<void>;

  protected constructor({
    name,
    description,
    priority,
    abort,
    wait,
    handler,
  }: {
    name: string;
    description: string;
    priority?: number;
    abort?: boolean;
    wait?: boolean;
    handler: (event: T) => Promise<void>;
  }) {
    this.name = name;
    this.description = description;
    if (priority) this._priority = priority;
    if (abort) this._abort = abort;
    if (wait) this._wait = wait;
    this.handler = handler;
  }
}

class MessageTrigger extends Trigger<MessageEvent> {
  readonly events = new Set<MessageEventIDs>();
  private readonly _regex: RegExp;
  get regex() {
    return this._regex;
  }

  constructor({
    name,
    description,
    event,
    events,
    command,
    regex,
    priority,
    handler,
    abort,
    wait,
    filter,
  }: {
    name: string;
    description: string;
    event?: MessageEventIDs;
    events?: MessageEventIDs[];
    command?: string;
    regex?: RegExp;
    priority?: number;
    handler: (event: MessageEvent) => Promise<void>;
    abort?: boolean;
    wait?: boolean;
    filter?: (event: MessageEvent) => boolean;
  }) {
    super({ name, description, handler, abort, wait });
    if (event) this.events.add(event);
    if (events) events.forEach((e) => this.events.add(e));
    if (this.events.size === 0) this.events.add("message");
    if (regex) this._regex = new RegExp(regex);
    else if (command) this._regex = new RegExp(`^#${command}($|\\s+.*)`);
    else this._regex = new RegExp(`^#${name}($|\\s+.*)`);
    if (priority) this._priority = priority;
    if (filter) this.filter = filter;
  }

  filter(event: MessageEvent): boolean {
    return this.regex.test(event.message.toString());
  }

  private filterType(event: MessageEvent): boolean {
    if (this.events.has("message")) return true;
    switch (event.message.target?.type) {
      case "person":
        if (!this.events.has("message.private")) return false;
        break;
      case "group":
        if (!this.events.has("message.group")) return false;
        break;
      case "guild":
        if (!this.events.has("message.guild")) return false;
        break;
      default:
        return false;
    }
    return true;
  }

  async handle(event: MessageEvent): Promise<boolean> {
    if (!this.filterType(event)) return false;
    if (this.filter(event)) {
      if (this._wait) {
        await this.handler(event);
      } else {
        this.handler(event);
      }
      if (this._abort) return true;
    }
    return false;
  }
}

class ConnectTrigger extends Trigger<ConnectEvent> {
  readonly events: Set<"connect"> = new Set<"connect">().add("connect");

  constructor({
    name,
    description,
    handler,
  }: {
    name: string;
    description: string;
    handler: (event: ConnectEvent) => Promise<void>;
  }) {
    super({ name, description, handler });
  }

  async handle(event: ConnectEvent) {
    await this.handler(event);
  }
}

class NoticeTrigger extends Trigger<NoticeEvent> {
  readonly events: Set<NoticeEventIDs> = new Set<NoticeEventIDs>();

  constructor({
    name,
    description,
    event,
    events,
    handler,
  }: {
    name: string;
    description: string;
    event?: NoticeEventIDs;
    events?: NoticeEventIDs[];
    handler: (event: NoticeEvent) => Promise<void>;
  }) {
    super({ name, description, handler });
    if (event) this.events.add(event);
    if (events) events.forEach((e) => this.events.add(e));
  }

  private filterType(event: NoticeEvent): boolean {
    return this.events.has("notice") || this.events.has(event.type);
  }

  async handle(event: NoticeEvent): Promise<boolean> {
    if (!this.filterType(event)) return false;
    if (this._wait) {
      await this.handler(event);
    } else {
      // noinspection ES6MissingAwait
      this.handler(event);
    }
    return this._abort;
  }
}

class ScheduleTrigger extends Trigger<void> {
  readonly events: Set<"schedule"> = new Set<"schedule">().add("schedule");
  readonly cron: string;

  constructor({
    name,
    description,
    cron,
    handler,
  }: {
    name: string;
    description: string;
    cron: string;
    handler: () => Promise<void>;
  }) {
    super({ name, description, handler });
    this.cron = cron;
  }

  async handle() {
    await this.handler();
  }
}

class Plugin extends EventEmitter {
  readonly id;
  readonly name;
  readonly description;
  protected _help = "";
  get help() {
    return this._help;
  }
  set help(help: string) {
    this._help = help;
  }
  setHelpMessage(help: string) {
    this.help = help;
    return this;
  }

  protected _priority = 0;
  get priority() {
    return this._priority;
  }
  set priority(priority: number) {
    this._priority = priority;
  }

  protected _messageTriggers: MessageTrigger[] = [];
  get messageTriggers() {
    return this._messageTriggers;
  }

  protected _connectTriggers: ConnectTrigger[] = [];
  get connectTriggers() {
    return this._connectTriggers;
  }

  protected _noticeTriggers: NoticeTrigger[] = [];
  get noticeTriggers() {
    return this._noticeTriggers;
  }

  protected _schedules: ScheduleTrigger[] = [];
  get schedules() {
    return this._schedules;
  }

  protected _interactions = new Map<
    InteractionKey,
    {
      handler: (event: MessageEvent) => Promise<void>;
      timeout?: NodeJS.Timeout;
    }
  >();
  get interactions() {
    return this._interactions;
  }

  constructor({
    id,
    name,
    description,
    priority,
  }: {
    id: string;
    name: string;
    description: string;
    priority?: number;
  }) {
    super();
    /** 插件ID */
    this.id = id;
    /** 插件名称 */
    this.name = name;
    /** 插件描述 */
    this.description = description;
    /** 优先级 */
    if (priority) this.priority = priority;
  }

  async onMessage(messageEvent: MessageEvent) {
    const interactKey = this.getInteractKey(messageEvent);
    if (interactKey) {
      if (this.interactions.has(interactKey)) {
        this.interactions.get(interactKey)?.handler(messageEvent);
        return true;
      }
    }
    this._messageTriggers.sort((a, b) => b.priority - a.priority);
    for (const trigger of this._messageTriggers) {
      if (await trigger.handle(messageEvent)) return true;
    }
    return false;
  }

  async onConnect(connectEvent: ConnectEvent) {
    for (const trigger of this._connectTriggers) {
      // noinspection ES6MissingAwait
      trigger.handle(connectEvent);
    }
  }

  async onNotice(event: NoticeEvent) {
    this._noticeTriggers.sort((a, b) => b.priority - a.priority);
    for (const trigger of this._noticeTriggers) {
      if (await trigger.handle(event)) return true;
    }
    return false;
  }

  /**
   * 添加 Bot 连接触发器
   * @param name 触发器名称
   * @param description 触发器描述
   * @param event 触发器事件，为 `connect`
   * @param priority 触发器优先级，默认为 0，值越大优先级越高
   * @param handler 触发器处理函数
   */
  addTrigger({
    name,
    description,
    event,
    priority,
    handler,
  }: {
    name: string;
    description: string;
    event: "connect";
    priority?: number;
    handler: (event: ConnectEvent) => Promise<void>;
  }): this;

  /**
   * 添加 Bot 消息触发器
   *
   * `event` 与 `events` 可任选其一或同时指定，同时指定时取并集。如果都不指定，则默认为 `message`。
   *
   * `regex` 的优先级高于 `command`，如果同时指定，则只会使用 `regex`。
   * 如果不指定 `regex` 而指定 `command`，则生成的正则表达式为 `^#${command}($|\\s+.*)`。
   * 如果都不指定，则生成的正则表达式为 `^#${name}($|\\s+.*)`。
   *
   * 如果 `abort` 为 true，则如果当前触发器触发，后续触发器不会被执行。
   *
   * 如果 `wait` 为 true，则当前触发器会等待 `handler` 执行完成后再执行后续触发器。
   *
   * `filter` 方法用于过滤消息，返回 true 时触发，返回 false 时不触发。
   * 默认情况下，`filter` 方法会用正则表达式过滤消息的字符串形式。
   * 你可以重写 `filter` 方法来实现自定义的过滤逻辑。
   * @param name 触发器名称
   * @param description 触发器描述
   * @param event 触发器事件，可以为 `message`、`message.private`、`message.group`、`message.guild`
   * @param events 触发器事件列表
   * @param command 触发器命令
   * @param regex 触发器正则表达式
   * @param priority 触发器优先级，默认为 0，值越大优先级越高
   * @param handler 触发器处理函数
   * @param abort 是否终止后续触发器，默认为 true
   * @param wait 是否等待触发器处理完成，默认为 true
   * @param filter 触发器过滤函数
   */
  addTrigger({
    name,
    description,
    event,
    events,
    command,
    regex,
    priority,
    handler,
    abort,
    wait,
    filter,
  }: {
    name: string;
    description: string;
    event?: "message" | "message.private" | "message.group" | "message.guild";
    events?: ("message" | "message.private" | "message.group" | "message.guild")[];
    command?: string;
    regex?: RegExp;
    priority?: number;
    handler: (event: MessageEvent) => Promise<void>;
    abort?: boolean;
    wait?: boolean;
    filter?: (event: MessageEvent) => boolean;
  }): this;

  /**
   * 添加 Bot 计划任务触发器
   * @param name 触发器名称
   * @param description 触发器描述
   * @param cron 触发器 cron 表达式
   * @param handler 触发器处理函数
   */
  addTrigger({
    name,
    description,
    cron,
    handler,
  }: {
    name: string;
    description: string;
    cron: string;
    handler: () => Promise<void>;
  }): this;

  addTrigger({
    name,
    description,
    event,
    events,
    command,
    regex,
    cron,
    priority,
    handler,
    abort,
    wait,
    filter,
  }: {
    name: string;
    description: string;
    event?: EventIDs;
    events?: EventIDs[];
    command?: string;
    regex?: RegExp;
    cron?: string;
    priority?: number;
    handler:
      | ((event: MessageEvent) => Promise<void>)
      | ((event: ConnectEvent) => Promise<void>)
      | ((event: NoticeEvent) => Promise<void>)
      | (() => Promise<void>);
    abort?: boolean;
    wait?: boolean;
    filter?:
      | ((event: MessageEvent) => boolean)
      | ((event: ConnectEvent) => boolean)
      | ((event: NoticeEvent) => boolean);
  }) {
    if (cron) {
      try {
        CronExpressionParser.parse(cron);
      } catch (e) {
        logger.error(
          `插件 ${this.name} 的计划任务 ${name} 的 cron 表达式 "${cron}" 解析失败：${e}，已跳过`,
          "Plugin",
          true,
        );
        return this;
      }
      this._schedules.push(
        new ScheduleTrigger({ name, description, cron, handler: handler as () => Promise<void> }),
      );
      return this;
    } else if (event === "connect") {
      this._connectTriggers.push(
        new ConnectTrigger({
          name,
          description,
          handler: handler as (event: ConnectEvent) => Promise<void>,
        }),
      );
      return this;
    } else {
      this._messageTriggers.push(
        new MessageTrigger({
          name,
          description,
          event: event as MessageEventIDs,
          events: events as MessageEventIDs[],
          command,
          regex,
          priority,
          handler: handler as (event: MessageEvent) => Promise<void>,
          abort,
          wait,
          filter: filter as (event: MessageEvent) => boolean,
        }),
      );
    }
    return this;
  }

  getInteractKey(event: MessageEvent): InteractionKey | undefined {
    const target = event.message.target;
    if (!target) {
      logger.error("获取消息 Interact Key 失败，消息目标为空", this.name);
      return undefined;
    }
    switch (target.type) {
      case "person":
        return `private:${event.message.senderID}`;
      case "group":
        return `group:${event.message.senderID}:${target.groupID}`;
      case "guild":
        return `guild:${event.message.senderID}:${target.guildID}:${target.channelID}`;
    }
  }

  startInteract(
    event: MessageEvent,
    handler: (e: MessageEvent) => Promise<void>,
    timeoutSeconds?: number,
    timeoutMessage = "操作超时已取消",
  ) {
    const key = this.getInteractKey(event);
    if (key) {
      this.interactions.set(key, {
        handler,
        timeout: timeoutSeconds
          ? setTimeout(() => {
              this.interactions.delete(key);
              event.reply(timeoutMessage, true);
            }, timeoutSeconds * 1000)
          : undefined,
      });
    } else {
      logger.error("建立交互失败", this.name);
    }
  }

  getInteract(event: MessageEvent):
    | {
        handler: (e: MessageEvent) => Promise<void>;
        timeout?: NodeJS.Timeout;
      }
    | undefined;
  getInteract(interactionKey: InteractionKey):
    | {
        handler: (e: MessageEvent) => Promise<void>;
        timeout?: NodeJS.Timeout;
      }
    | undefined;
  getInteract(event: MessageEvent | InteractionKey) {
    if (event instanceof MessageEvent) {
      const key = this.getInteractKey(event);
      if (!key) {
        logger.error("获取消息 Interact Key 失败，消息目标为空", this.name);
        return undefined;
      }
      return this.interactions.get(key);
    }
    return this.interactions.get(event);
  }

  finishInteract(event: MessageEvent) {
    const key = this.getInteractKey(event);
    if (!key) return;
    const interaction = this.interactions.get(key);
    if (interaction) {
      clearTimeout(interaction.timeout);
      this.interactions.delete(key);
    }
  }
}

export default Plugin;
