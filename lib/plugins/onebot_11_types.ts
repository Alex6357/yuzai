/**
 * 记录 Onebot 11 以及 go-cqhttp 标准的事件类型
 */

/** 生命周期事件 */
export interface Onebot11LifecycleEvent {
  /** 事件发生的时间戳 */
  time: number;
  /** 收到事件的机器人 QQ 号 */
  self_id: number;
  /** 上报类型 */
  post_type: "meta_event";
  /** 元事件类型 */
  meta_event_type: "lifecycle";
  /** 事件子类型，分别表示 OneBot 启用、停用、WebSocket 连接成功 */
  sub_type: "enable" | "disable" | "connect";
}

/** 心跳事件 */
export interface Onebot11HeartbeatEvent {
  /** 事件发生的时间戳 */
  time: number;
  /** 收到事件的机器人 QQ 号 */
  self_id: number;
  /** 上报类型 */
  post_type: "meta_event";
  /** 元事件类型 */
  meta_event_type: "heartbeat";
  /** 状态信息 */
  status: {
    /** 当前 QQ 在线，null 表示无法查询到在线状态 */
    online: boolean | null;
    /** 状态符合预期，意味着各模块正常运行、功能正常，且 QQ 在线 */
    good: boolean;
  } & Record<string, unknown>;
  /** 到下次心跳的间隔，单位毫秒 */
  interval: number;
}

/** 元事件 */
export type Onebot11MetaEvent = Onebot11LifecycleEvent | Onebot11HeartbeatEvent;

/** 纯文本消息段 */
export interface Onebot11TextMessageSegment {
  /** 消息段类型 */
  type: "text";
  /** 消息段数据 */
  data: {
    /** 文本内容 */
    text: string;
  };
}

/** QQ 表情消息段 */
export interface Onebot11FaceMessageSegment {
  /** 消息段类型 */
  type: "face";
  /** 消息段数据 */
  data: {
    /** 表情 ID */
    id: number;
  };
}

/** 图片消息段 */
export interface Onebot11ImageMessageSegment {
  /** 消息段类型 */
  type: "image";
  /** 消息段数据 */
  data: {
    /**
     * 图片文件名
     *
     * 发送时，file 参数除了支持使用收到的图片文件名直接发送外，还支持：
     * - 绝对路径，例如 `file:///C:\\Users\Richard\Pictures\1.png`，格式使用 file URI
     * - 网络 URL，例如 `http://i1.piimg.com/567571/fdd6e7b6d93f1ef0.jpg`
     * - Base64 编码，例如 `base64://iVBORw0KGgoAAAANSUhEUgAAABQAAAAVCAIAAADJt1n/AAAAKElEQVQ4EWPk5+RmIBcwkasRpG9UM4mhNxpgowFGMARGEwnBIEJVAAAdBgBNAZf+QAAAAABJRU5ErkJggg==`
     */
    file: string;
    /** 图片类型，flash 表示闪照，无此参数表示普通图片 */
    type?: "flash";
    /** 图片 URL，仅收信时有效 */
    url?: string;
    /** 只在通过网络 URL 发送时有效，表示是否使用已缓存的文件，默认 1 */
    cache?: 0 | 1;
    /** 只在通过网络 URL 发送时有效，表示是否通过代理下载文件（需通过环境变量或配置文件配置代理），默认 1 */
    proxy?: 0 | 1;
    /** 只在通过网络 URL 发送时有效，单位秒，表示下载网络文件的超时时间，默认不超时，这里用 undefined 表示不超时 */
    timeout?: number;
  };
}

/** 语音消息段 */
export interface Onebot11RecordMessageSegment {
  /** 消息段类型 */
  type: "record";
  /** 消息段数据 */
  data: {
    /**
     * 语音文件名
     *
     * 发送时，file 参数除了支持使用收到的语音文件名直接发送外，还支持其他形式，参考图片消息段
     * @see Onebot11ImageMessageSegment
     */
    file: string;
    /** 发送时可选，默认 0，设置为 1 表示变声 */
    magic?: 0 | 1;
    /** 语音 URL，仅收信时有效 */
    url?: string;
    /** 只在通过网络 URL 发送时有效，表示是否使用已缓存的文件，默认 1 */
    cache?: 0 | 1;
    /** 只在通过网络 URL 发送时有效，表示是否通过代理下载文件（需通过环境变量或配置文件配置代理），默认 1 */
    proxy?: 0 | 1;
    /** 只在通过网络 URL 发送时有效，单位秒，表示下载网络文件的超时时间，默认不超时，这里用 undefined 表示不超时 */
    timeout?: number;
  };
}

/** 短视频消息段 */
export interface Onebot11VideoMessageSegment {
  /** 消息段类型 */
  type: "video";
  /** 消息段数据 */
  data: {
    /**
     * 视频文件名
     *
     * 发送时，file 参数除了支持使用收到的视频文件名直接发送外，还支持其它形式，参考图片消息段
     * @see Onebot11ImageMessageSegment
     */
    file: string;
    /** 视频 URL，仅收信时有效 */
    url?: string;
    /** 只在通过网络 URL 发送时有效，表示是否使用已缓存的文件，默认 1 */
    cache?: 0 | 1;
    /** 只在通过网络 URL 发送时有效，表示是否通过代理下载文件（需通过环境变量或配置文件配置代理），默认 1 */
    proxy?: 0 | 1;
    /** 只在通过网络 URL 发送时有效，单位秒，表示下载网络文件的超时时间，默认不超时，这里用 undefined 表示不超时 */
    timeout?: number;
  };
}

/** At 某人消息段 */
export interface Onebot11AtMessageSegment {
  /** 消息段类型 */
  type: "at";
  /** 消息段数据 */
  data: {
    /** At 的 QQ 号，all 表示全体成员 */
    qq: number | "all";
  };
}

/** 猜拳魔法表情消息段 */
export interface Onebot11RpsMessageSegment {
  /** 消息段类型 */
  type: "rps";
  /** 消息段数据 */
  data: object;
}

/** 掷骰子魔法表情消息段 */
export interface Onebot11DiceMessageSegment {
  /** 消息段类型 */
  type: "dice";
  /** 消息段数据 */
  data: object;
}

/**
 * 窗口抖动（戳一戳）消息段
 *
 * 仅发送
 *
 * 相当于戳一戳最基本类型的快捷方式。
 */
export interface Onebot11ShakeMessageSegment {
  /** 消息段类型 */
  type: "shake";
  /** 消息段数据 */
  data: object;
}

/** 戳一戳消息段 */
export interface Onebot11PokeMessageSegment {
  /** 消息段类型 */
  type: "poke";
  /** 消息段数据 */
  data: {
    /** 类型，见 [Mirai 的 PokeMessage 类](https://github.com/mamoe/mirai/blob/f5eefae7ecee84d18a66afce3f89b89fe1584b78/mirai-core/src/commonMain/kotlin/net.mamoe.mirai/message/data/HummerMessage.kt#L49) */
    type: string;
    /** ID，见 [Mirai 的 PokeMessage 类](https://github.com/mamoe/mirai/blob/f5eefae7ecee84d18a66afce3f89b89fe1584b78/mirai-core/src/commonMain/kotlin/net.mamoe.mirai/message/data/HummerMessage.kt#L49) */
    id: number;
    /** 表情名，[Mirai 的 PokeMessage 类](https://github.com/mamoe/mirai/blob/f5eefae7ecee84d18a66afce3f89b89fe1584b78/mirai-core/src/commonMain/kotlin/net.mamoe.mirai/message/data/HummerMessage.kt#L49) */
    name?: string;
  };
}

/**
 * 匿名消息段
 *
 * 仅发送
 *
 * 当收到匿名消息时，需要通过 消息事件的群消息 的 `anonymous` 字段判断。
 * @see Onebot11GroupMessageEvent
 */
export interface Onebot11AnonymousMessageSegment {
  /** 消息段类型 */
  type: "anonymous";
  /** 消息段数据 */
  data: {
    /** 可选，0 或 1，表示无法匿名时是否继续发送 */
    ignore?: 0 | 1;
  };
}

/** 链接分享消息段 */
export interface Onebot11ShareMessageSegment {
  /** 消息段类型 */
  type: "share";
  /** 消息段数据 */
  data: {
    /** URL */
    url: string;
    /** 标题 */
    title: string;
    /** 发送时可选，内容描述 */
    content?: string;
    /** 发送时可选，图片 URL */
    image?: string;
  };
}

/** 推荐好友消息段 */
export interface Onebot11ContactFriendMessageSegment {
  /** 消息段类型 */
  type: "contact";
  /** 消息段数据 */
  data: {
    /** 推荐类型 */
    type: "qq";
    /** 被推荐人的 QQ 号 */
    id: number;
  };
}

/** 推荐群消息段 */
export interface Onebot11ContactGroupMessageSegment {
  /** 消息段类型 */
  type: "contact";
  /** 消息段数据 */
  data: {
    /** 推荐类型 */
    type: "group";
    /** 被推荐群的群号 */
    id: string;
  };
}

/** 位置消息段 */
export interface Onebot11LocationMessageSegment {
  /** 消息段类型 */
  type: "location";
  /** 消息段数据 */
  data: {
    /** 纬度 */
    lat: number;
    /** 经度 */
    lon: number;
    /** 发送时可选，标题 */
    title?: string;
    /** 发送时可选，内容描述 */
    content?: string;
  };
}

/** 音乐分享消息段 */
export interface Onebot11MusicShareMessageSegment {
  /** 消息段类型 */
  type: "music";
  /** 消息段数据 */
  data: {
    /** 音乐平台类型，qq 163 xm 分别表示使用 QQ 音乐、网易云音乐、虾米音乐 */
    type: "qq" | "163" | "xm";
    /** 歌曲 ID */
    id: string;
  };
}

/** 音乐自定义分享消息段 */
export interface Onebot11MusicCustomShareMessageSegment {
  /** 消息段类型 */
  type: "music";
  /** 消息段数据 */
  data: {
    /** 表示音乐自定义分享 */
    type: "custom";
    /** 点击后跳转目标 URL */
    url: string;
    /** 音乐 URL */
    audio: string;
    /** 标题 */
    title: string;
    /** 发送时可选，内容描述 */
    content?: string;
    /** 发送时可选，图片 URL */
    image?: string;
  };
}

/** 回复消息段 */
export interface Onebot11ReplyMessageSegment {
  /** 消息段类型 */
  type: "reply";
  /** 消息段数据 */
  data: {
    /** 回复时引用的消息 ID */
    id: string;
  };
}

/**
 * 合并转发消息段
 *
 * 仅收取
 */
export interface Onebot11ForwardMessageSegment {
  /** 消息段类型 */
  type: "forward";
  /** 消息段数据 */
  data: {
    /** 合并转发 ID，需通过 `get_forward_msg` API 获取具体内容 */
    id: string;
  };
}

/**
 * 合并转发节点消息段
 *
 * 仅发送
 */
export interface Onebot11NodeMessageSegment {
  /** 消息段类型 */
  type: "node";
  /** 消息段数据 */
  data: {
    /** 转发的消息 ID */
    id: string;
  };
}

/**
 * 合并转发自定义节点消息段
 *
 * 接收时，此消息段不会直接出现在消息事件的 `message` 中，需通过 `get_forward_msg` API 获取。
 */
export interface Onebot11CustomNodeMessageSegment {
  /** 消息段类型 */
  type: "node";
  /** 消息段数据 */
  data: {
    /** 发送者 QQ 号 */
    user_id: string;
    /** 发送者昵称 */
    nickname: string;
    /** 消息内容，支持发送消息时的 `message` 数据类型，见 API 的参数 */
    content: Onebot11Message;
  };
}

/** XML 消息段 */
export interface Onebot11XmlMessageSegment {
  /** 消息段类型 */
  type: "xml";
  /** 消息段数据 */
  data: {
    /** XML 内容 */
    data: string;
  };
}

/** JSON 消息段 */
export interface Onebot11JsonMessageSegment {
  /** 消息段类型 */
  type: "json";
  /** 消息段数据 */
  data: {
    /** JSON 内容 */
    data: string;
  };
}

/** 消息段 */
export type Onebot11MessageSegment =
  | Onebot11TextMessageSegment
  | Onebot11FaceMessageSegment
  | Onebot11ImageMessageSegment
  | Onebot11RecordMessageSegment
  | Onebot11VideoMessageSegment
  | Onebot11AtMessageSegment
  | Onebot11RpsMessageSegment
  | Onebot11DiceMessageSegment
  | Onebot11ShakeMessageSegment
  | Onebot11PokeMessageSegment
  | Onebot11AnonymousMessageSegment
  | Onebot11ShareMessageSegment
  | Onebot11ContactFriendMessageSegment
  | Onebot11ContactGroupMessageSegment
  | Onebot11LocationMessageSegment
  | Onebot11MusicShareMessageSegment
  | Onebot11MusicCustomShareMessageSegment
  | Onebot11ReplyMessageSegment
  | Onebot11ForwardMessageSegment
  | Onebot11NodeMessageSegment
  | Onebot11CustomNodeMessageSegment
  | Onebot11XmlMessageSegment
  | Onebot11JsonMessageSegment;

/** 消息 */
export type Onebot11Message = string | Onebot11MessageSegment[];

/** 私聊消息事件 */
export interface Onebot11PrivateMessageEvent {
  /** 事件发生的时间戳 */
  time: number;
  /** 收到事件的机器人 QQ 号 */
  self_id: number;
  /** 上报类型 */
  post_type: "message";
  /** 消息类型 */
  message_type: "person";
  /** 消息子类型，如果是好友则是 friend，如果是群临时会话则是 group */
  sub_type: "friend" | "group" | "other";
  /** 消息 ID */
  message_id: number;
  /** 发送者 QQ 号 */
  user_id: number;
  /** 消息内容 */
  message: Onebot11Message;
  /** 原始消息内容 */
  raw_message: string;
  /** 字体 */
  font: number;
  /**
   * 私聊发送者信息
   *
   * 需要注意的是，`sender` 中的各字段是尽最大努力提供的，也就是说，不保证每个字段都一定存在，也不保证存在的字段都是完全正确的（缓存可能过期）。
   */
  sender: {
    /** 发送者 QQ 号 */
    user_id?: number;
    /** 昵称 */
    nickname?: string;
    /** 性别，male 或 female 或 unknown */
    sex?: "male" | "female" | "unknown";
    /** 年龄 */
    age?: number;
  };
}

/** 群消息事件 */
export interface Onebot11GroupMessageEvent {
  /** 事件发生的时间戳 */
  time: number;
  /** 收到事件的机器人 QQ 号 */
  self_id: number;
  /** 上报类型 */
  post_type: "message";
  /** 消息类型 */
  message_type: "group";
  /** 消息子类型，正常消息是 normal，匿名消息是 anonymous，系统提示（如「管理员已禁止群内匿名聊天」）是 notice */
  sub_type: "normal" | "anonymous" | "notice";
  /** 消息 ID */
  message_id: number;
  /** 群号 */
  group_id: number;
  /** 发送者 QQ 号 */
  user_id: number;
  /** 匿名信息，如果不是匿名消息则为 null */
  anonymous?: {
    /** 匿名用户 ID */
    id: string;
    /** 匿名用户名称 */
    name: string;
    /** 匿名用户 flag，在调用禁言 API 时需要传入 */
    flag: string;
  };
  /** 消息内容 */
  message: Onebot11Message;
  /** 原始消息内容 */
  raw_message: string;
  /** 字体 */
  font: number;
  /**
   * 群聊发送者信息
   *
   * 需要注意的是，`sender` 中的各字段是尽最大努力提供的，也就是说，不保证每个字段都一定存在，也不保证存在的字段都是完全正确的（缓存可能过期）。尤其对于匿名消息，此字段不具有参考价值。
   */
  sender: {
    /** 发送者 QQ 号 */
    user_id?: number;
    /** 昵称 */
    nickname?: string;
    /** 群名片／备注 */
    card?: string;
    /** 性别，male 或 female 或 unknown */
    sex?: "male" | "female" | "unknown";
    /** 年龄 */
    age?: number;
    /** 地区 */
    area?: string;
    /** 成员等级 */
    level?: string;
    /** 角色，owner 或 admin 或 member */
    role?: "owner" | "admin" | "member";
    /** 专属头衔 */
    title?: string;
  };
}

/** 消息事件 */
export type Onebot11MessageEvent = Onebot11PrivateMessageEvent | Onebot11GroupMessageEvent;

/** 群文件上传事件 */
export interface Onebot11GroupFileUploadEvent {
  /** 事件发生的时间戳 */
  time: number;
  /** 收到事件的机器人 QQ 号 */
  self_id: number;
  /** 上报类型 */
  post_type: "notice";
  /** 通知类型 */
  notice_type: "group_upload";
  /** 群号 */
  group_id: number;
  /** 发送者 QQ 号 */
  user_id: number;
  /** 文件信息 */
  file: {
    /** 文件 ID */
    id: string;
    /** 文件名 */
    name: string;
    /** 文件大小（字节数） */
    size: number;
    /** busid（目前不清楚有什么作用） */
    busid: number;
  };
}

/** 群管理员变动事件 */
export interface Onebot11GroupAdminChangeEvent {
  /** 事件发生的时间戳 */
  time: number;
  /** 收到事件的机器人 QQ 号 */
  self_id: number;
  /** 上报类型 */
  post_type: "notice";
  /** 通知类型 */
  notice_type: "group_admin";
  /** 事件子类型，分别表示设置和取消管理员 */
  sub_type: "set" | "unset";
  /** 群号 */
  group_id: number;
  /** 管理员 QQ 号 */
  user_id: number;
}

/** 群成员减少事件 */
export interface Onebot11GroupDecreaseEvent {
  /** 事件发生的时间戳 */
  time: number;
  /** 收到事件的机器人 QQ 号 */
  self_id: number;
  /** 上报类型 */
  post_type: "notice";
  /** 通知类型 */
  notice_type: "group_decrease";
  /** 事件子类型，分别表示主动退群、成员被踢、登录号被踢 */
  sub_type: "leave" | "kick" | "kick_me";
  /** 群号 */
  group_id: number;
  /** 操作者 QQ 号（如果是主动退群，则和 user_id 相同） */
  operator_id: number;
  /** 离开者 QQ 号 */
  user_id: number;
}

/** 群成员增加事件 */
export interface Onebot11GroupIncreaseEvent {
  /** 事件发生的时间戳 */
  time: number;
  /** 收到事件的机器人 QQ 号 */
  self_id: number;
  /** 上报类型 */
  post_type: "notice";
  /** 通知类型 */
  notice_type: "group_increase";
  /** 事件子类型，分别表示管理员已同意入群、管理员邀请入群 */
  sub_type: "approve" | "invite";
  /** 群号 */
  group_id: number;
  /** 操作者 QQ 号 */
  operator_id: number;
  /** 加入者 QQ 号 */
  user_id: number;
}

/** 群禁言事件 */
export interface Onebot11GroupBanEvent {
  /** 事件发生的时间戳 */
  time: number;
  /** 收到事件的机器人 QQ 号 */
  self_id: number;
  /** 上报类型 */
  post_type: "notice";
  /** 通知类型 */
  notice_type: "group_ban";
  /** 事件子类型，分别表示禁言、解除禁言 */
  sub_type: "ban" | "lift_ban";
  /** 群号 */
  group_id: number;
  /** 操作者 QQ 号 */
  operator_id: number;
  /** 被禁言 QQ 号，全员禁言时为 0 */
  user_id: number;
  /** 禁言时长，单位秒，全员禁言时为 -1 */
  duration: number;
}

/** 好友添加事件 */
export interface Onebot11FriendAddEvent {
  /** 事件发生的时间戳 */
  time: number;
  /** 收到事件的机器人 QQ 号 */
  self_id: number;
  /** 上报类型 */
  post_type: "notice";
  /** 通知类型 */
  notice_type: "friend_add";
  /** 新添加好友 QQ 号 */
  user_id: number;
}

/** 群消息撤回事件 */
export interface Onebot11GroupRecallEvent {
  /** 事件发生的时间戳 */
  time: number;
  /** 收到事件的机器人 QQ 号 */
  self_id: number;
  /** 上报类型 */
  post_type: "notice";
  /** 通知类型 */
  notice_type: "group_recall";
  /** 群号 */
  group_id: number;
  /** 消息发送者 QQ 号 */
  user_id: number;
  /** 操作者 QQ 号 */
  operator_id: number;
  /** 被撤回的消息 ID */
  message_id: number;
}

/** 好友消息撤回事件 */
export interface Onebot11FriendRecallEvent {
  /** 事件发生的时间戳 */
  time: number;
  /** 收到事件的机器人 QQ 号 */
  self_id: number;
  /** 上报类型 */
  post_type: "notice";
  /** 通知类型 */
  notice_type: "friend_recall";
  /** 好友 QQ 号 */
  user_id: number;
  /** 被撤回的消息 ID */
  message_id: number;
}

/** 群内戳一戳事件 */
export interface Onebot11GroupPokeEvent {
  /** 事件发生的时间戳 */
  time: number;
  /** 收到事件的机器人 QQ 号 */
  self_id: number;
  /** 上报类型 */
  post_type: "notice";
  /** 消息类型 */
  notice_type: "notify";
  /** 提示类型 */
  sub_type: "poke";
  /** 群号 */
  group_id: number;
  /** 发送者 QQ 号 */
  user_id: number;
  /** 被戳者 QQ 号 */
  target_id: number;
}

/** 群红包运气王事件 */
export interface Onebot11GroupLuckyKingEvent {
  /** 事件发生的时间戳 */
  time: number;
  /** 收到事件的机器人 QQ 号 */
  self_id: number;
  /** 上报类型 */
  post_type: "notice";
  /** 消息类型 */
  notice_type: "notify";
  /** 提示类型 */
  sub_type: "lucky_king";
  /** 群号 */
  group_id: number;
  /** 红包发送者 QQ 号 */
  user_id: number;
  /** 运气王 QQ 号 */
  target_id: number;
}

/** 群成员荣誉变更事件 */
export interface Onebot11GroupHonorChangeEvent {
  /** 事件发生的时间戳 */
  time: number;
  /** 收到事件的机器人 QQ 号 */
  self_id: number;
  /** 上报类型 */
  post_type: "notice";
  /** 消息类型 */
  notice_type: "notify";
  /** 提示类型 */
  sub_type: "honor";
  /** 群号 */
  group_id: number;
  /** 荣誉类型，分别表示龙王、群聊之火、快乐源泉 */
  honor_type: "talkative" | "performer" | "emotion";
  /** 成员 QQ 号 */
  user_id: number;
}

/** 通知事件 */
export type Onebot11NoticeEvent =
  | Onebot11GroupFileUploadEvent
  | Onebot11GroupAdminChangeEvent
  | Onebot11GroupDecreaseEvent
  | Onebot11GroupIncreaseEvent
  | Onebot11GroupBanEvent
  | Onebot11FriendAddEvent
  | Onebot11GroupRecallEvent
  | Onebot11FriendRecallEvent
  | Onebot11GroupPokeEvent
  | Onebot11GroupLuckyKingEvent
  | Onebot11GroupHonorChangeEvent;

/** 加好友请求事件 */
export interface Onebot11FriendRequestEvent {
  /** 事件发生的时间戳 */
  time: number;
  /** 收到事件的机器人 QQ 号 */
  self_id: number;
  /** 上报类型 */
  post_type: "request";
  /** 请求类型 */
  request_type: "person";
  /** 发送请求的 QQ 号 */
  user_id: number;
  /** 验证信息 */
  comment: string;
  /** 请求 flag，在调用处理请求的 API 时需要传入 */
  flag: string;
}

/** 加群请求/邀请事件 */
export interface Onebot11GroupRequestEvent {
  /** 事件发生的时间戳 */
  time: number;
  /** 收到事件的机器人 QQ 号 */
  self_id: number;
  /** 上报类型 */
  post_type: "request";
  /** 请求类型 */
  request_type: "group";
  /** 请求子类型，分别表示加群请求、邀请登录号入群 */
  sub_type: "add" | "invite";
  /** 群号 */
  group_id: number;
  /** 发送请求的 QQ 号 */
  user_id: number;
  /** 验证信息 */
  comment: string;
  /** 请求 flag，在调用处理请求的 API 时需要传入 */
  flag: string;
}

/** 请求事件 */
export type Onebot11RequestEvent = Onebot11FriendRequestEvent | Onebot11GroupRequestEvent;

/** 事件 */
export type Onebot11Event =
  | Onebot11MetaEvent
  | Onebot11MessageEvent
  | Onebot11NoticeEvent
  | Onebot11RequestEvent;

// go-cqhttp 部分

/** go-cqhttp 私聊消息事件 */
export interface GoCqhttpPrivateMessageEvent extends Onebot11PrivateMessageEvent {
  /** 接收者 QQ 号 */
  target_id: number;
  /** 临时会话来源 */
  temp_source: number;
}

/** go-cqhttp 群消息事件 */
export interface GoCqhttpGroupMessageEvent extends Onebot11GroupMessageEvent {
  /** 群号 */
  group_id: number;
}

/** go-cqhttp 频道消息事件 */
export interface GoCqhttpGuildMessageEvent {
  /** 事件发生的时间戳 */
  time: number;
  /** 收到事件的机器人 QQ 号 */
  self_id: number;
  /** 收到事件的机器人 ID */
  self_tiny_id: string;
  /** 上报类型 */
  post_type: "message";
  /** 消息类型 */
  message_type: "guild";
  /** 消息子类型 */
  sub_type: "channel";
  /** 频道 ID */
  guild_id: string;
  /** 子频道 ID */
  channel_id: string;
  /** 消息发送者 ID */
  user_id: string;
  /** 消息 ID */
  message_id: number;
  /** 消息内容 */
  message: Onebot11Message;
  /** 原始消息内容 */
  raw_message: string;
  /**
   * 发送者信息
   *
   * 需要注意的是，`sender` 中的各字段是尽最大努力提供的，也就是说，不保证每个字段都一定存在，也不保证存在的字段都是完全正确的（缓存可能过期）。
   */
  sender: {
    /** 发送者 QQ 号 */
    user_id?: number;
    /** 发送者 ID */
    tiny_id?: string;
    /** 昵称 */
    nickname?: string;
    /** 性别，male 或 female 或 unknown */
    sex?: "male" | "female" | "unknown";
    /** 年龄 */
    age?: number;
  };
}

export type GoCqhttpMessageEvent =
  | GoCqhttpPrivateMessageEvent
  | GoCqhttpGroupMessageEvent
  | GoCqhttpGuildMessageEvent;

/** go-cqhttp 自身私聊消息事件 */
export interface GoCqhttpPrivateMessageSentEvent {
  /** 事件发生的时间戳 */
  time: number;
  /** 收到事件的机器人 QQ 号 */
  self_id: number;
  /** 上报类型 */
  post_type: "message_sent";
  /** 消息类型 */
  message_type: "person";
  /** 消息子类型 */
  sub_type: "friend" | "group_self";
  /** 消息 ID */
  message_id: number;
  /** 发送者 QQ 号 */
  user_id: number;
  /** 消息内容 */
  message: Onebot11Message;
  /** 原始消息内容 */
  raw_message: string;
  /** 字体 */
  font: number;
  /**
   * 私聊发送者信息
   *
   * 需要注意的是，`sender` 中的各字段是尽最大努力提供的，也就是说，不保证每个字段都一定存在，也不保证存在的字段都是完全正确的（缓存可能过期）。
   */
  sender: {
    /** 发送者 QQ 号 */
    user_id?: number;
    /** 昵称 */
    nickname?: string;
    /** 性别，male 或 female 或 unknown */
    sex?: "male" | "female" | "unknown";
    /** 年龄 */
    age?: number;
  };
}

/** go-cqhttp 自身群消息事件 */
export interface GoCqhttpGroupMessageSentEvent {
  /** 事件发生的时间戳 */
  time: number;
  /** 收到事件的机器人 QQ 号 */
  self_id: number;
  /** 上报类型 */
  post_type: "message_sent";
  /** 消息类型 */
  message_type: "group";
  /** 消息子类型，正常消息是 normal，匿名消息是 anonymous，系统提示（如「管理员已禁止群内匿名聊天」）是 notice */
  sub_type: "normal" | "anonymous" | "notice";
  /** 消息 ID */
  message_id: number;
  /** 群号 */
  group_id: number;
  /** 发送者 QQ 号 */
  user_id: number;
  /** 匿名信息，如果不是匿名消息则为 null */
  anonymous?: object;
  /** 消息内容 */
  message: Onebot11Message;
  /** 原始消息内容 */
  raw_message: string;
  /** 字体 */
  font: number;
  /**
   * 群聊发送者信息
   *
   * 需要注意的是，`sender` 中的各字段是尽最大努力提供的，也就是说，不保证每个字段都一定存在，也不保证存在的字段都是完全正确的（缓存可能过期）。尤其对于匿名消息，此字段不具有参考价值。
   */
  sender: {
    /** 发送者 QQ 号 */
    user_id?: number;
    /** 昵称 */
    nickname?: string;
    /** 群名片／备注 */
    card?: string;
    /** 性别，male 或 female 或 unknown */
    sex?: "male" | "female" | "unknown";
    /** 年龄 */
    age?: number;
    /** 地区 */
    area?: string;
    /** 成员等级 */
    level?: string;
    /** 角色，owner 或 admin 或 member */
    role?: "owner" | "admin" | "member";
    /** 专属头衔 */
    title?: string;
  };
}

/** go-cqhttp 频道自身消息事件 */
export interface GoCqhttpGuildMessageSentEvent {
  /** 事件发生的时间戳 */
  time: number;
  /** 收到事件的机器人 QQ 号 */
  self_id: number;
  /** 收到事件的机器人 ID */
  self_tiny_id: string;
  /** 上报类型 */
  post_type: "message_sent";
  /** 消息类型 */
  message_type: "guild";
  /** 消息子类型 */
  sub_type: "channel";
  /** 频道 ID */
  guild_id: string;
  /** 子频道 ID */
  channel_id: string;
  /** 消息发送者 ID */
  user_id: string;
  /** 消息 ID */
  message_id: number;
  /** 消息内容 */
  message: Onebot11Message;
  /** 原始消息内容 */
  raw_message: string;
  /**
   * 发送者信息
   *
   * 需要注意的是，`sender` 中的各字段是尽最大努力提供的，也就是说，不保证每个字段都一定存在，也不保证存在的字段都是完全正确的（缓存可能过期）。
   */
  sender: {
    /** 发送者 QQ 号 */
    user_id?: number;
    /** 发送者 ID */
    tiny_id?: string;
    /** 昵称 */
    nickname?: string;
    /** 性别，male 或 female 或 unknown */
    sex?: "male" | "female" | "unknown";
    /** 年龄 */
    age?: number;
  };
}

/** go-cqhttp 自身消息事件 */
export type GoCqhttpMessageSentEvent =
  | GoCqhttpPrivateMessageSentEvent
  | GoCqhttpGroupMessageSentEvent
  | GoCqhttpGuildMessageSentEvent;

/** go-cqhttp 好友戳一戳事件 */
export interface GoCqhttpFriendPokeEvent {
  /** 事件发生的时间戳 */
  time: number;
  /** 收到事件的机器人 QQ 号 */
  self_id: number;
  /** 上报类型 */
  post_type: "notice";
  /** 消息类型 */
  notice_type: "notify";
  /** 提示类型 */
  sub_type: "poke";
  /** 发送者 QQ 号 */
  sender_id: number;
  /** 发送者 QQ 号 */
  user_id: number;
  /** 被戳者 QQ 号 */
  target_id: number;
}

/** go-cqhttp 群成员头衔变更事件 */
export interface GoCqhttpGroupTitleChangeEvent {
  /** 事件发生的时间戳 */
  time: number;
  /** 收到事件的机器人 QQ 号 */
  self_id: number;
  /** 上报类型 */
  post_type: "notice";
  /** 消息类型 */
  notice_type: "notify";
  /** 提示类型 */
  sub_type: "title";
  /** 群号 */
  group_id: number;
  /** 成员 QQ 号 */
  user_id: number;
  /** 获得的新头衔 */
  title: string;
}

/**
 * go-cqhttp 群成员名片更新事件
 *
 * 此事件不保证时效性, 仅在收到消息时校验卡片
 */
export interface GoCqhttpGroupCardChangeEvent {
  /** 事件发生的时间戳 */
  time: number;
  /** 收到事件的机器人 QQ 号 */
  self_id: number;
  /** 上报类型 */
  post_type: "notice";
  /** 消息类型 */
  notice_type: "group_card";
  /** 群号 */
  group_id: number;
  /** 成员 QQ 号 */
  user_id: number;
  /** 新名片，当名片为空时为空字符串，并不是昵称 */
  card_new: string;
  /** 旧名片，当名片为空时为空字符串，并不是昵称 */
  card_old: string;
}

/** go-cqhttp 接收到离线文件事件 */
export interface GoCqhttpOfflineFileEvent {
  /** 事件发生的时间戳 */
  time: number;
  /** 收到事件的机器人 QQ 号 */
  self_id: number;
  /** 上报类型 */
  post_type: "notice";
  /** 消息类型 */
  notice_type: "offline_file";
  /** 发送者 QQ 号 */
  user_id: number;
  /** 文件信息 */
  file: {
    /** 文件名 */
    name: string;
    /** 文件大小 */
    size: number;
    /** 文件 URL */
    url: string;
  };
}

/** go-cqhttp 其他客户端在线状态变更事件 */
export interface GoCqhttpClientStatusChangeEvent {
  /** 上报类型 */
  post_type: "notice";
  /** 消息类型 */
  notice_type: "client_status";
  /** 客户端信息 */
  client: {
    /** 客户端 ID */
    app_id: number;
    /** 设备名称 */
    device_name: string;
    /** 设备类型 */
    device_kind: string;
  };
  /** 当前在线状态 */
  online: boolean;
}

/** go-cqhttp 群精华消息变更事件 */
export interface GoCqhttpEssenceEvent {
  /** 事件发生的时间戳 */
  time: number;
  /** 收到事件的机器人 QQ 号 */
  self_id: number;
  /** 收到事件的机器人 ID */
  self_tiny_id: string;
  /** 上报类型 */
  post_type: "notice";
  /** 消息类型 */
  notice_type: "essence";
  /** 提示类型 */
  sub_type: "add" | "delete";
  /** 群号 */
  group_id: number;
  /** 消息发送者 QQ 号 */
  sender_id: number;
  /** 操作者 QQ 号 */
  operator_id: number;
  /** 被操作的消息 ID */
  message_id: number;
}

/** go-cqhttp 频道消息表情贴更新事件 */
export interface GoCqhttpMessageReactionsUpdatedEvent {
  /** 事件发生的时间戳 */
  time: number;
  /** 收到事件的机器人 QQ 号 */
  self_id: number;
  /** 上报类型 */
  post_type: "notice";
  /** 消息类型 */
  notice_type: "message_reactions_updated";
  /** 频道 ID */
  guild_id: string;
  /** 子频道 ID */
  channel_id: string;
  /** 操作者 ID */
  user_id: string;
  /** 消息 ID */
  message_id: string;
  /** 表情贴 ID */
  current_reactions: GoCqhttpReactionInfo[];
}

/** go-cqhttp 频道消息表情贴信息 */
export interface GoCqhttpReactionInfo {
  /** 表情 ID */
  emoji_id: string;
  /** 表情对应数值 ID */
  emoji_index: number;
  /** 表情类型 */
  emoji_type: number;
  /** 表情名字 */
  emoji_name: string;
  /** 当前表情被贴数量 */
  count: number;
  /** BOT 是否点击 */
  clicked: boolean;
}

/** go-cqhttp 子频道信息更新事件 */
export interface GoCqhttpChannelUpdatedEvent {
  /** 事件发生的时间戳 */
  time: number;
  /** 收到事件的机器人 QQ 号 */
  self_id: number;
  /** 上报类型 */
  post_type: "notice";
  /** 消息类型 */
  notice_type: "channel_updated";
  /** 频道 ID */
  guild_id: string;
  /** 子频道 ID */
  channel_id: string;
  /** 操作者 ID */
  user_id: string;
  /** 操作者 ID */
  operator_id: string;
  /** 更新前的频道信息 */
  old_info: {
    /** 所属频道 ID */
    owner_guild_id: string;
    /** 子频道 ID */
    channel_id: string;
    /**
     * 子频道类型
     *
     * 1 文字频道
     * 2 语音频道
     * 5 直播频道
     * 7 主题频道
     */
    channel_type: number;
    /** 子频道名称 */
    channel_name: string;
    /** 创建时间 */
    create_time: number;
    /** 创建者 ID */
    creator_tiny_id: string;
    /** 发言权限类型 */
    talk_permission: number;
    /** 可视性类型 */
    visible_type: number;
    /** 当前启用的慢速模式 key */
    current_slow_mode: number;
    /** 频道内可用慢速模式类型列表 */
    slow_modes: {
      /** 慢速模式 key */
      slow_mode_key: number;
      /** 慢速模式说明 */
      slow_mode_text: string;
      /** 周期内发言频率限制 */
      speak_frequency: number;
      /** 单位周期时间，单位秒 */
      slow_mode_circle: number;
    }[];
  };
  /** 更新后的频道信息 */
  new_info: {
    /** 所属频道 ID */
    owner_guild_id: string;
    /** 子频道 ID */
    channel_id: string;
    /**
     * 子频道类型
     *
     * 1 文字频道
     * 2 语音频道
     * 5 直播频道
     * 7 主题频道
     */
    channel_type: number;
    /** 子频道名称 */
    channel_name: string;
    /** 创建时间 */
    create_time: number;
    /** 创建者 ID */
    creator_tiny_id: string;
    /** 发言权限类型 */
    talk_permission: number;
    /** 可视性类型 */
    visible_type: number;
    /** 当前启用的慢速模式 key */
    current_slow_mode: number;
    /** 频道内可用慢速模式类型列表 */
    slow_modes: {
      /** 慢速模式 key */
      slow_mode_key: number;
      /** 慢速模式说明 */
      slow_mode_text: string;
      /** 周期内发言频率限制 */
      speak_frequency: number;
      /** 单位周期时间，单位秒 */
      slow_mode_circle: number;
    }[];
  };
}

/** go-cqhttp 子频道创建事件 */
export interface GoCqhttpChannelCreatedEvent {
  /** 事件发生的时间戳 */
  time: number;
  /** 收到事件的机器人 QQ 号 */
  self_id: number;
  /** 收到事件的机器人 ID */
  self_tiny_id: string;
  /** 上报类型 */
  post_type: "notice";
  /** 消息类型 */
  notice_type: "channel_created";
  /** 频道 ID */
  guild_id: string;
  /** 子频道 ID */
  channel_id: string;
  /** 操作者 ID */
  user_id: string;
  /** 操作者 ID */
  operator_id: string;
  /** 频道信息 */
  channel_info: {
    /** 所属频道 ID */
    owner_guild_id: string;
    /** 子频道 ID */
    channel_id: string;
    /**
     * 子频道类型
     *
     * 1 文字频道
     * 2 语音频道
     * 5 直播频道
     * 7 主题频道
     */
    channel_type: number;
    /** 子频道名称 */
    channel_name: string;
    /** 创建时间 */
    create_time: number;
    /** 创建者 ID */
    creator_tiny_id: string;
    /** 发言权限类型 */
    talk_permission: number;
    /** 可视性类型 */
    visible_type: number;
    /** 当前启用的慢速模式 key */
    current_slow_mode: number;
    /** 频道内可用慢速模式类型列表 */
    slow_modes: {
      /** 慢速模式 key */
      slow_mode_key: number;
      /** 慢速模式说明 */
      slow_mode_text: string;
      /** 周期内发言频率限制 */
      speak_frequency: number;
      /** 单位周期时间，单位秒 */
      slow_mode_circle: number;
    }[];
  };
}

/** go-cqhttp 子频道删除事件 */
export interface GoCqhttpChannelDestroyedEvent {
  /** 事件发生的时间戳 */
  time: number;
  /** 收到事件的机器人 QQ 号 */
  self_id: number;
  /** 收到事件的机器人 ID */
  self_tiny_id: string;
  /** 上报类型 */
  post_type: "notice";
  /** 消息类型 */
  notice_type: "channel_destroyed";
  /** 频道 ID */
  guild_id: string;
  /** 子频道 ID */
  channel_id: string;
  /** 操作者 ID */
  user_id: string;
  /** 操作者 ID */
  operator_id: string;
  /** 频道信息 */
  channel_info: {
    /** 所属频道 ID */
    owner_guild_id: string;
    /** 子频道 ID */
    channel_id: string;
    /**
     * 子频道类型
     *
     * 1 文字频道
     * 2 语音频道
     * 5 直播频道
     * 7 主题频道
     */
    channel_type: number;
    /** 子频道名称 */
    channel_name: string;
    /** 创建时间 */
    create_time: number;
    /** 创建者 ID */
    creator_tiny_id: string;
    /** 发言权限类型 */
    talk_permission: number;
    /** 可视性类型 */
    visible_type: number;
    /** 当前启用的慢速模式 key */
    current_slow_mode: number;
    /** 频道内可用慢速模式类型列表 */
    slow_modes: {
      /** 慢速模式 key */
      slow_mode_key: number;
      /** 慢速模式说明 */
      slow_mode_text: string;
      /** 周期内发言频率限制 */
      speak_frequency: number;
      /** 单位周期时间，单位秒 */
      slow_mode_circle: number;
    }[];
  };
}

/** go-cqhttp 通知事件 */
export type GoCqhttpNoticeEvent =
  | GoCqhttpFriendPokeEvent
  | GoCqhttpGroupTitleChangeEvent
  | GoCqhttpGroupCardChangeEvent
  | GoCqhttpOfflineFileEvent
  | GoCqhttpClientStatusChangeEvent
  | GoCqhttpEssenceEvent
  | GoCqhttpMessageReactionsUpdatedEvent
  | GoCqhttpChannelUpdatedEvent
  | GoCqhttpChannelCreatedEvent
  | GoCqhttpChannelDestroyedEvent
  | Onebot11NoticeEvent;

/** go-cqhttp 事件 */
export type GoCqhttpEvent =
  | Onebot11MetaEvent
  | GoCqhttpMessageEvent
  | Onebot11NoticeEvent
  | Onebot11RequestEvent
  | GoCqhttpMessageSentEvent;

/** Onebot11 响应 */
export interface Onebot11Response {
  status: "ok" | "async" | "failed";
  retcode: number;
  data: Record<string, unknown>;
  echo: string;
}
