// noinspection JSUnusedGlobalSymbols

import type { UUID } from "node:crypto";
import { EventEmitter } from "node:events";

import Adapter from "yuzai/adapter";
import { getLogger } from "yuzai/logger";
import Plugin from "yuzai/plugin";
import Message, { MessageBuilder } from "yuzai/message";
import {
  MessageEvent,
  ConnectEvent,
  NoticeEvent,
  type NoticeEventIDs,
  type NoticeEventData,
} from "yuzai/event";
import { PlatformInfo } from "yuzai/types";
import type { InfoGroup, InfoGuild, InfoUserGroup, InfoUserPersonal, Target } from "yuzai/types";

// noinspection JSUnusedGlobalSymbols
class Bot extends EventEmitter {
  get logger() {
    return getLogger(`Bot ${this.id ?? this.UUID}`);
  }

  /** 机器人的唯一标识符 */
  readonly UUID: UUID;

  /** 机器人使用的适配器 */
  protected _adapter?: Adapter;
  /** 机器人使用的适配器 */
  get adapter(): Adapter {
    return this._adapter as Adapter;
  }

  /** 机器人的 ID */
  _id?: string;
  /**
   * 机器人的 ID
   *
   * 可能未初始化，如果未初始化，会返回空字符串，同时异步调用 updateID() 方法
   *
   * 如果要保证获取到 ID，请使用 getID() 方法，或者在使用前先调用 updateID() 方法
   */
  get id(): string {
    if (this._id) {
      return this._id;
    } else {
      this.updateID();
      this.logger.error("Bot ID 未初始化，返回空字符串");
      return "";
    }
  }
  /**
   * 更新机器人的 ID
   */
  async updateID() {
    this._id = await this.adapter.getID();
  }
  /**
   * 获取机器人的 ID
   *
   * 总是会从适配器中获取最新的，不会使用缓存
   */
  async getID() {
    await this.updateID();
    return this._id;
  }

  /** 机器人的昵称 */
  _nickname?: string;
  /**
   * 机器人的昵称
   *
   * 可能未初始化，如果未初始化，会返回空字符串，同时异步调用 updateNickname() 方法
   *
   * 如果要保证获取到昵称，请使用 getNickname() 方法，或者在使用前先调用 updateNickname() 方法
   */
  get nickname(): string {
    if (this._nickname) {
      return this._nickname;
    } else {
      this.updateNickname();
      this.logger.warn("Bot 昵称未初始化，返回空字符串");
      return "";
    }
  }
  /**
   * 更新机器人的昵称
   */
  async updateNickname() {
    this._nickname = await this.adapter.getNickname();
  }
  /**
   * 获取并更新机器人的昵称
   *
   * 总是会从适配器中获取最新的，不会使用缓存
   */
  async getNickname() {
    await this.updateNickname();
    return this._nickname;
  }

  protected _platform?: PlatformInfo;
  get platform(): PlatformInfo {
    if (!this._platform) this._platform = new PlatformInfo();
    return this._platform;
  }

  /** 机器人的好友列表 */
  protected _friendList = new Map<string, InfoUserPersonal>();
  /**
   * 机器人的好友列表
   *
   * 可能未初始化，如果未初始化，会返回空 Map，同时异步调用 updateFriendList() 方法
   *
   * 如果要保证获取到好友列表，请使用 getFriendList() 方法，或者在使用前先调用 updateFriendList() 方法
   */
  get friendList(): Map<string, InfoUserPersonal> {
    if (this._friendList) {
      return this._friendList;
    } else {
      this.updateFriendList();
      this.logger.warn("Bot 好友列表未初始化，返回空 Map");
      return new Map<string, InfoUserPersonal>();
    }
  }
  /**
   * 更新机器人的好友列表
   */
  async updateFriendList() {
    const friendList = await this._adapter?.getFriendList();
    if (!friendList) {
      this.logger.error("获取好友列表失败");
      return;
    }
    this._friendList = friendList;
    for (const userID of friendList.keys()) {
      await this.updateFriendInfo(userID);
    }
  }
  /**
   * 获取机器人的好友列表
   *
   * 总是会从适配器中获取最新的，不会使用缓存
   */
  async getFriendList() {
    await this.updateFriendList();
    return this._friendList;
  }
  /**
   * 更新好友信息
   */
  async updateFriendInfo(userID: string) {
    const userInfo = await this._adapter?.getFriendInfo(userID);
    if (userInfo) this.friendList.set(userID, userInfo);
  }
  /**
   * 获取好友信息
   *
   * 总是会从适配器中获取最新的，不会使用缓存
   * @param userID 好友 ID
   */
  async getFriendInfo(userID: string) {
    await this.updateFriendInfo(userID);
    return this.friendList.get(userID);
  }

  /** 机器人的群列表 */
  protected _groupList = new Map<string, InfoGroup>();
  /**
   * 机器人的群列表
   *
   * 注意不是所有适配器都有群的概念
   *
   * 可能未初始化，如果未初始化，会返回空 Map，同时异步调用 updateGroupList() 方法
   *
   * 如果要保证获取到群列表，请使用 getGroupList() 方法，或者在使用前先调用 updateGroupList() 方法
   */
  get groupList(): Map<string, InfoGroup> {
    if (this._adapter?.getGroupList === undefined) {
      this.logger.error("Bot 不支持获取群列表");
      return new Map<string, InfoGroup>();
    }
    if (this._groupList) {
      return this._groupList;
    } else {
      this.updateGroupList();
      this.logger.warn("Bot 群列表未初始化，返回空 Map");
      return new Map<string, InfoGroup>();
    }
  }
  /**
   * 更新机器人的群列表
   */
  async updateGroupList() {
    if (this._adapter?.getGroupList === undefined) {
      this.logger.error("Bot 不支持获取群列表");
      return;
    }

    const groupList = await this._adapter.getGroupList();

    if (!groupList) {
      this.logger.error("获取群列表失败");
      return;
    }

    // 获取当前所有群 ID 集合
    const currentGroupIDs = new Set(this.groupList.keys());

    for (const [groupID, newGroupInfo] of groupList) {
      // 从当前群 ID 集合中移除本次获取到的群 ID
      currentGroupIDs.delete(groupID);

      const existingGroupInfo = this.groupList.get(groupID);
      if (existingGroupInfo) {
        // 保留原有的 members 信息，更新其他信息
        const updatedGroupInfo = {
          ...existingGroupInfo,
          ...newGroupInfo,
          members: existingGroupInfo.members,
        };
        this.groupList.set(groupID, updatedGroupInfo);
      } else {
        // 新增群信息
        this.groupList.set(groupID, newGroupInfo);
      }
    }

    // 删除已不存在的群
    for (const groupID of currentGroupIDs) {
      this.groupList.delete(groupID);
    }
  }
  /**
   * 获取机器人的群列表
   *
   * 总是会从适配器中获取最新的，不会使用缓存
   */
  async getGroupList() {
    if (this._adapter?.getGroupList === undefined) {
      this.logger.error("Bot 不支持获取群列表");
      return new Map<string, InfoGroup>();
    }

    await this.updateGroupList();
    return this._groupList;
  }
  /**
   * 更新全部群的信息
   */
  async updateGroupInfo(): Promise<void>;
  /**
   * 更新群信息
   *
   * @param groupID 群 ID
   */
  async updateGroupInfo(groupID: string): Promise<void>;
  async updateGroupInfo(groupID?: string) {
    if (this._adapter?.getGroupInfo === undefined) {
      this.logger.error("Bot 不支持获取群信息");
      return;
    }
    if (groupID) {
      const groupInfo = await this._adapter.getGroupInfo(groupID);
      if (groupInfo) {
        const newGroupInfo = {
          ...groupInfo,
          members: this.groupList.get(groupID)?.members ?? new Map(),
        };
        this.groupList.set(groupID, newGroupInfo);
      } else {
        this.logger.error("获取群信息失败");
        return;
      }
    } else {
      for (const groupID of this._groupList.keys()) {
        await this.updateGroupInfo(groupID);
      }
    }
  }
  /**
   * 获取群信息
   *
   * 总是会从适配器中获取最新的，不会使用缓存
   * @param groupID 群 ID
   */
  async getGroupInfo(groupID: string) {
    await this.updateGroupInfo(groupID);
    return this._groupList.get(groupID);
  }
  /**
   * 更新机器人的群成员列表
   */
  async updateGroupMemberList(): Promise<void>;
  /**
   * 更新指定群的成员列表
   *
   * @param groupID 要更新的群 ID
   */
  async updateGroupMemberList(groupID: string): Promise<void>;
  async updateGroupMemberList(groupID?: string) {
    if (this._adapter?.getGroupMemberList === undefined) {
      this.logger.error("Bot 不支持获取群成员列表");
      return;
    }
    if (groupID) {
      const memberList = await this._adapter.getGroupMemberList(groupID);
      if (memberList) {
        if (this.groupList.has(groupID)) {
          this.groupList.get(groupID)?.members.clear();
          memberList.forEach((memberInfo, memberID) => {
            this.groupList.get(groupID)?.members.set(memberID, memberInfo);
          });
        } else {
          this.groupList.set(groupID, {
            groupID,
            groupName: "",
            members: memberList,
            memberCount: memberList.size,
            maxMemberCount: -1,
          });
        }
      } else {
        this.logger.error("获取群成员列表失败");
        return;
      }
    } else {
      await this.updateGroupList();
      for (const groupID of this.groupList.keys()) {
        await this.updateGroupMemberList(groupID);
      }
    }
  }
  /**
   * 获取机器人所在群的成员列表
   *
   * @returns 机器人所在群的成员列表，结构为 `Map<群ID, Map<成员ID, InfoUserGroup>>`
   */
  async getGroupMemberList(): Promise<Map<string, Map<string, InfoUserGroup>>>;
  /**
   * 获取指定群的成员列表
   *
   * @param groupID 要获取的群 ID
   * @returns 指定群的成员列表，结构为 `Map<成员ID, InfoUserGroup>`
   */
  async getGroupMemberList(groupID: string): Promise<Map<string, InfoUserGroup>>;
  async getGroupMemberList(groupID?: string) {
    if (this._adapter?.getGroupMemberList === undefined) {
      this.logger.error("Bot 不支持获取群成员列表");
      return new Map();
    }
    if (groupID) {
      await this.updateGroupMemberList(groupID);
      return this.groupList.get(groupID)?.members;
    } else {
      await this.updateGroupMemberList();
      const memberList = new Map<string, Map<string, InfoUserGroup>>();
      for (const groupID of this.groupList.keys()) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- 一定存在
        memberList.set(groupID, this.groupList.get(groupID)!.members);
      }
      return memberList;
    }
  }
  /**
   * 更新所有群的所有群成员信息
   */
  async updateGroupMemberInfo(): Promise<void>;
  /**
   * 更新某个群的全部群成员信息
   *
   * @param groupID 群 ID
   */
  async updateGroupMemberInfo(groupID: string): Promise<void>;
  /**
   * 更新群成员信息
   *
   * @param groupID 群 ID
   * @param userID 成员 ID
   */
  async updateGroupMemberInfo(groupID: string, userID: string): Promise<void>;
  async updateGroupMemberInfo(groupID?: string, userID?: string) {
    if (this._adapter?.getGroupMemberInfo === undefined) {
      this.logger.error("Bot 不支持更新群成员信息");
      return;
    }
    if (groupID && userID) {
      await this.updateGroupList();
      const memberInfo = await this._adapter.getGroupMemberInfo(groupID, userID);
      if (memberInfo) {
        this.groupList.get(groupID)?.members.set(userID, memberInfo);
      }
    } else if (groupID) {
      await this.updateGroupList();
      const userIDs = this.groupList.get(groupID)?.members.keys();
      if (!userIDs) {
        this.logger.error(`群 ${groupID} 不存在`);
        return;
      }
      for (const userID of userIDs) {
        const memberInfo = await this._adapter.getGroupMemberInfo(groupID, userID);
        if (memberInfo) {
          this.groupList.get(groupID)?.members.set(userID, memberInfo);
        }
      }
    } else {
      await this.updateGroupMemberList();
      for (const groupID of this.groupList.keys()) {
        const userIDs = this.groupList.get(groupID)?.members.keys();
        if (!userIDs) {
          this.logger.error(`群 ${groupID} 不存在`);
          continue;
        }
        for (const userID of userIDs) {
          const memberInfo = await this._adapter.getGroupMemberInfo(groupID, userID);
          if (memberInfo) {
            this.groupList.get(groupID)?.members.set(userID, memberInfo);
          }
        }
      }
    }
  }
  /**
   * 获取群成员信息
   * @param groupID 群 ID
   * @param userID 成员 ID
   */
  async getGroupMemberInfo(groupID: string, userID: string): Promise<InfoUserGroup | undefined> {
    await this.updateGroupMemberList(groupID);
    return this.groupList.get(groupID)?.members.get(userID);
  }

  /** 机器人的频道列表 */
  protected _guildList = new Map<string, InfoGuild>();
  /**
   * 机器人的频道列表
   *
   * 注意不是所有适配器都有频道的概念
   *
   * 可能未初始化，如果未初始化，会返回空 Map，同时异步调用 updateGuildList() 方法
   *
   * 如果要保证获取到频道列表，请使用 getGuildList() 方法，或者在使用前先调用 updateGuildList() 方法
   */
  get guildList(): Map<string, InfoGuild> {
    if (this._adapter?.getGuildList === undefined) {
      this.logger.error("Bot 不支持获取频道列表");
      return new Map();
    }
    if (this._guildList) {
      return this._guildList;
    } else {
      this.updateGuildList();
      this.logger.warn("Bot 频道列表未初始化，返回空 Map");
      return new Map();
    }
  }
  /**
   * 更新机器人的频道列表
   */
  async updateGuildList() {
    if (this._adapter?.getGuildList === undefined) {
      this.logger.error("Bot 不支持获取频道列表");
      return;
    }

    const guildList = await this._adapter.getGuildList();

    if (!guildList) {
      this.logger.error("获取频道列表失败");
      return;
    }

    // 获取当前所有频道 ID 集合
    const currentGuildIDs = new Set(this.guildList.keys());

    for (const [guildID, newGuildInfo] of guildList) {
      // 从当前频道 ID 集合中移除本次获取到的频道 ID
      currentGuildIDs.delete(guildID);

      const existingGuildInfo = this.guildList.get(guildID);
      if (existingGuildInfo) {
        // 保留原有的 members 信息，更新其他信息
        const updatedGuildInfo = {
          ...existingGuildInfo,
          ...newGuildInfo,
          members: existingGuildInfo.members ?? new Map(),
        };
        this.guildList.set(guildID, updatedGuildInfo);
      } else {
        // 新增频道信息
        this.guildList.set(guildID, newGuildInfo);
      }
    }

    // 删除已不存在的频道
    for (const guildID of currentGuildIDs) {
      this.guildList.delete(guildID);
    }
  }
  /**
   * 获取机器人的频道列表
   *
   * 总是会从适配器中获取最新的，不会使用缓存
   */
  async getGuildList() {
    if (this._adapter?.getGuildList === undefined) {
      this.logger.error("Bot 不支持获取频道列表");
      return new Map<string, InfoGuild>();
    }

    await this.updateGuildList();
    return this._guildList;
  }
  /**
   * 更新全部频道的信息
   */
  async updateGuildInfo(): Promise<void>;
  /**
   * 更新频道信息
   *
   * @param guildID 频道 ID
   */
  async updateGuildInfo(guildID: string): Promise<void>;
  async updateGuildInfo(guildID?: string) {
    if (this._adapter?.getGuildInfo === undefined) {
      this.logger.error("Bot 不支持获取频道信息");
      return;
    }
    if (guildID) {
      const guildInfo = await this._adapter.getGuildInfo(guildID);
      if (guildInfo) {
        const newGuildInfo = {
          ...guildInfo,
          members: this.guildList.get(guildID)?.members ?? new Map(),
        };
        this.guildList.set(guildID, newGuildInfo);
      } else {
        this.logger.error("获取频道信息失败");
        return;
      }
    } else {
      for (const guildID of this._guildList.keys()) {
        await this.updateGuildInfo(guildID);
      }
    }
  }
  /**
   * 获取频道信息
   *
   * 总是会从适配器中获取最新的，不会使用缓存
   * @param guildID 频道 ID
   */
  async getGuildInfo(guildID: string) {
    await this.updateGuildInfo(guildID);
    return this._guildList.get(guildID);
  }
  // 先不提供成员信息的全量更新
  /**
   * 更新频道成员信息
   *
   * @param guildID 频道 ID
   * @param userID 成员 ID
   */
  async updateGuildMemberInfo(guildID: string, userID: string) {
    if (this._adapter?.getGuildMemberInfo === undefined) {
      this.logger.error("Bot 不支持更新频道成员信息");
      return;
    }
    await this.updateGuildList();
    const memberInfo = await this._adapter.getGuildMemberInfo(guildID, userID);
    if (memberInfo) {
      this.guildList.get(guildID)?.members?.set(userID, memberInfo);
    }
  }
  /**
   * 获取频道成员信息
   *
   * 总是会从适配器中获取最新的，不会使用缓存
   * @param guildID 频道 ID
   * @param userID 成员 ID
   */
  async getGuildMemberInfo(guildID: string, userID: string) {
    await this.updateGuildMemberInfo(guildID, userID);
    return this.guildList.get(guildID)?.members?.get(userID);
  }
  /**
   * 更新所有频道的子频道列表
   */
  async updateChannelList(): Promise<void>;
  /**
   * 更新频道的子频道列表
   *
   * @param guildID 频道 ID
   */
  async updateChannelList(guildID: string): Promise<void>;
  async updateChannelList(guildID?: string) {
    if (this._adapter?.getChannelList === undefined) {
      this.logger.error("Bot 不支持获取频道列表");
      return;
    }
    if (guildID) {
      await this.updateGuildList();
      const channelList = await this._adapter?.getChannelList(guildID);
      if (channelList) {
        this._guildList.get(guildID)?.channels.clear();
        channelList.forEach((channelInfo, channelID) => {
          this._guildList.get(guildID)?.channels.set(channelID, channelInfo);
        });
      }
    } else {
      await this.updateGuildList();
      for (const guildID of this._guildList.keys()) {
        const channelList = await this._adapter?.getChannelList(guildID);
        if (channelList) {
          this._guildList.get(guildID)?.channels.clear();
          channelList.forEach((channelInfo, channelID) => {
            this._guildList.get(guildID)?.channels.set(channelID, channelInfo);
          });
        }
      }
    }
  }
  /**
   * 获取频道的子频道列表
   *
   * 总是会从适配器中获取最新的，不会使用缓存
   * @param guildID 频道 ID
   */
  async getChannelList(guildID: string) {
    await this.updateChannelList(guildID);
    return this._guildList.get(guildID)?.channels;
  }

  // /**
  //  * 更新机器人的频道成员列表
  //  */
  // async updateGuildMemberList(): Promise<void>;
  // /**
  //  * 更新指定频道的成员列表
  //  *
  //  * @param guildID 要更新的频道 ID
  //  */
  // async updateGuildMemberList(guildID: string): Promise<void>;
  // async updateGuildMemberList(guildID?: string) {
  //   if (this._adapter?.getGuildMemberList === undefined) {
  //     logger.error(
  //       "Bot 不支持获取频道成员列表",
  //       `Bot ${this.id !== "" ? this.id : this.UID}`,
  //       true
  //     );
  //     return;
  //   }
  //   if (guildID) {
  //     const memberList = await this._adapter.getGuildMemberList(guildID);
  //     if (memberList) {
  //       if (this.guildList.has(guildID)) {
  //         this.guildList.get(guildID)!.members.clear();
  //         memberList.forEach((memberInfo, memberID) => {
  //           this.guildList.get(guildID)!.members.set(memberID, memberInfo);
  //         });
  //       } else {
  //         this.guildList.set(guildID, {
  //           guildID,
  //           guildName: "",
  //           members: memberList,
  //           memberCount: memberList.size,
  //           maxMemberCount: -1,
  //         });
  //       }
  //     } else {
  //       logger.error(
  //         "获取频道成员列表失败",
  //         `Bot ${this.id !== "" ? this.id : this.UID}`,
  //         true
  //       );
  //       return;
  //     }
  //   } else {
  //     await this.updateGuildList();
  //     for (const guildID of this.guildList.keys()) {
  //       await this.updateGuildMemberList(guildID);
  //     }
  //   }
  // }
  // /**
  //  * 获取机器人所在频道的成员列表
  //  *
  //  * @returns 机器人所在频道的成员列表，结构为 `Map<频道ID, Map<成员ID, InfoUserGuild>>`
  //  */
  // async getGuildMemberList(): Promise<Map<string, Map<string, InfoUserGuild>>>;
  // /**
  //  * 获取指定频道的成员列表
  //  *
  //  * @param guildID 要获取的频道 ID
  //  * @returns 指定频道的成员列表，结构为 `Map<成员ID, InfoUserGuild>`
  //  */
  // async getGuildMemberList(
  //   guildID: string
  // ): Promise<Map<string, InfoUserGuild>>;
  // async getGuildMemberList(guildID?: string) {
  //   if (this._adapter?.getGuildMemberList === undefined) {
  //     logger.error(
  //       "Bot 不支持获取频道成员列表",
  //       `Bot ${this.id !== "" ? this.id : this.UID}`,
  //       true
  //     );
  //     return new Map();
  //   }
  //   if (guildID) {
  //     await this.updateGuildMemberList(guildID);
  //     return this.guildList.get(guildID)?.members;
  //   } else {
  //     await this.updateGuildMemberList();
  //     const memberList = new Map<string, Map<string, InfoUserGuild>>();
  //     for (const guildID of this.guildList.keys()) {
  //       memberList.set(guildID, this.guildList.get(guildID)!.members);
  //     }
  //     return memberList;
  //   }
  // }
  // /**
  //  * 更新所有频道的所有频道成员信息
  //  */
  // async updateGuildMemberInfo(): Promise<void>;
  // /**
  //  * 更新某个频道的全部频道成员信息
  //  *
  //  * @param guildID 频道 ID
  //  */
  // async updateGuildMemberInfo(guildID: string): Promise<void>;
  // /**
  //  * 更新频道成员信息
  //  *
  //  * @param guildID 频道 ID
  //  * @param userID 成员 ID
  //  */
  // async updateGuildMemberInfo(guildID: string, userID: string): Promise<void>;
  // async updateGuildMemberInfo(guildID?: string, userID?: string) {
  //   if (this._adapter?.getGuildMemberInfo === undefined) {
  //     logger.error(
  //       "Bot 不支持更新频道成员信息",
  //       `Bot ${this.id !== "" ? this.id : this.UID}`,
  //       true
  //     );
  //     return;
  //   }
  //   if (guildID && userID) {
  //     await this.updateGuildList();
  //     const memberInfo = await this._adapter.getGuildMemberInfo(
  //       guildID,
  //       userID
  //     );
  //     if (memberInfo) {
  //       this.guildList.get(guildID)?.members.set(userID, memberInfo);
  //     }
  //   } else if (guildID) {
  //     await this.updateGuildList();
  //     for (const userID of this.guildList.get(guildID)?.members.keys()!) {
  //       const memberInfo = await this._adapter.getGuildMemberInfo(
  //         guildID,
  //         userID
  //       );
  //       if (memberInfo) {
  //         this.guildList.get(guildID)?.members.set(userID, memberInfo);
  //       }
  //     }
  //   } else {
  //     await this.updateGuildMemberList();
  //     for (const guildID of this.guildList.keys()) {
  //       for (const userID of this.guildList.get(guildID)?.members.keys()!) {
  //         const memberInfo = await this._adapter.getGuildMemberInfo(
  //           guildID,
  //           userID
  //         );
  //         if (memberInfo) {
  //           this.guildList.get(guildID)?.members.set(userID, memberInfo);
  //         }
  //       }
  //     }
  //   }
  // }

  /** 机器人使用的插件 */
  // TODO 做成可以设置的
  protected _plugins = new Map<string, Plugin>();
  /** 机器人使用的插件 */
  get plugins() {
    return this._plugins;
  }
  /** 机器人使用的插件列表 */
  get pluginList(): Plugin[] {
    return [...this._plugins.values()];
  }

  /** 机器人的主人 ID 列表 */
  _masters: string[] = [];
  /** 机器人的主人 ID 列表 */
  get masters() {
    return this._masters;
  }

  /**
   * 机器人的构造函数
   * @param ID 机器人的唯一标识符
   * @param plugins 机器人使用的插件
   * @param adapter 机器人使用的适配器
   */
  constructor(ID: UUID, plugins: Map<string, Plugin>, adapter: Adapter) {
    super();
    this.UUID = ID;
    this.use(adapter);
    this._plugins = plugins;
  }

  /**
   * 使用对应的适配器，同时异步更新机器人的 ID 和昵称
   * @param adapter 适配器
   */
  use(adapter: Adapter) {
    this._adapter = adapter;
    this.adapter.bind(this);
    this.updateID().then(() => {
      this.updateNickname();
      this.updateFriendList();
      if (this.adapter.getGroupList) this.updateGroupList();
      if (this.adapter.getGuildList) this.updateGuildList();
      this.onConnect();
    });

    return this;
  }

  /**
   * Bot 连接时调用，会在 Bot 新建时自动调用，也可以由 Adapter 调用
   *
   * 会生成一个 ConnectEvent 对象并发送给所有插件
   */
  async onConnect() {
    const connectEvent = new ConnectEvent(this);
    for (const plugin of this.pluginList) {
      plugin.onConnect(connectEvent);
    }
  }

  /**
   * 接收到消息时调用
   *
   * 会生成一个 MessageEvent 对象并发送给所有 plugin
   *
   * 如果有插件返回 true，则不会继续发送给其他插件
   * @param message 消息对象
   */
  async onMessage(message: Message) {
    const messageEvent = new MessageEvent(this, message);
    for (const plugin of this.pluginList) {
      if (await plugin.onMessage(messageEvent)) {
        return;
      }
    }
  }

  /**
   * 接收到事件时调用
   *
   * 会生成一个 NoticeEvent 对象并发给所有 plugin
   *
   * 如果有插件返回 true，则不会继续发送给其他插件
   * @param event 事件对象
   */
  async onNotice<T extends NoticeEventIDs | string>(
    type: T,
    data: NoticeEventData<T>,
    platformInfo?: PlatformInfo,
  ) {
    const noticeEvent = new NoticeEvent(this, type, data, platformInfo);
    for (const plugin of this.pluginList) {
      if (await plugin.onNotice(noticeEvent)) {
        return;
      }
    }
  }

  /**
   * 发送消息
   * @param message 要发送的消息
   * @param target 发送目标
   * @returns 发送的消息 ID
   */
  async sendMessage(message: Message | string, target: Target): Promise<string | undefined>;
  async sendMessage(
    message: Message | string,
    target: { userID: string },
  ): Promise<string | undefined>;
  async sendMessage(
    message: Message | string,
    target: { groupID: string },
  ): Promise<string | undefined>;
  async sendMessage(
    message: Message | string,
    target: { guildID: string; channelID: string },
  ): Promise<string | undefined>;
  async sendMessage(
    message: Message | string = "",
    target:
      | Target
      | { userID: string }
      | { groupID: string }
      | { guildID: string; channelID: string },
  ) {
    if (typeof message === "string") {
      message = new MessageBuilder().addTextBlock(message).build();
    }

    // 类型守卫，解析目标
    const resolveTarget = (
      target:
        | Target
        | { userID: string }
        | { groupID: string }
        | { guildID: string; channelID: string },
    ): Target => {
      if ("type" in target) {
        return target;
      }
      if ("userID" in target) {
        return {
          type: "person",
          userID: target.userID,
        };
      } else if ("groupID" in target) {
        return {
          type: "group",
          groupID: target.groupID,
        };
      } else {
        return {
          type: "guild",
          guildID: target.guildID,
          channelID: target.channelID,
        };
      }
    };
    const resolvedTarget = resolveTarget(target);

    switch (resolvedTarget.type) {
      case "person":
        return this.adapter.sendPrivateMessage(message, resolvedTarget.userID);
      case "group":
        return this.adapter.sendGroupMessage?.(message, resolvedTarget.groupID);
      case "guild":
      // return this.adapter.sendGuildMessage?.(
      //   message,
      //   resolvedTarget.guildID,
      //   resolvedTarget.channelID
      // );
    }
  }
}

export default Bot;
