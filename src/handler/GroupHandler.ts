import { ItemStore, Store } from "../Store"
import { User } from "../model/User"
import { ForwardingHandler, Handler } from "./Handler"

export const NotifyString = "[!!]"

export class GroupHandler extends ForwardingHandler {
  telegram: any
  chatIdsStore: ItemStore<number[]>
  memberIdsStore: Store<number, number[]>
  memberIds: { [chatId: number]: number[] }
  userStore: Store<number, User>

  constructor(
    telegram: any,
    chatIdsStore: ItemStore<number[]>,
    memberIdsStore: Store<number, number[]>,
    userStore: Store<number, User>
  ) {
    super()
    this.telegram = telegram
    this.chatIdsStore = chatIdsStore
      .default([])
      .onUpdate((ids) => {
        ids.forEach((id) => {
          if (!(id in this.memberIds)) {
            this.memberIds[id] = []
          }
        })
      })

    this.userStore = userStore.default((id) => new User(id))
    this.memberIds = {}
    this.memberIdsStore = memberIdsStore
      .default((id) => [])
      .onUpdate((chatId, memberIds) => {
        this.memberIds[chatId] = memberIds
       })

    // Boot strap the data for all the chat rooms being watched
    this.chatIdsStore.get().then((ids) => {
      console.log("Bootstrapping " + ids)
      ids.forEach(id => this.memberIdsStore.get(id))
    })

    this.addHandlers(
      this.addMemberHandler,
      this.notifyHandler,
      this.removeMemberHandler,
      this.listMembersHandler
    )
  }

  // TODO: Fetch all IDs for memberIdsStore

  chatIdForMember(userId: number): number {
    for (var chatId in this.memberIds) {
      if (this.memberIds[chatId].some((memberId) => memberId == userId)) {
        return parseInt(chatId)
      }
    }
    return undefined
  }

  isChatMember(ctx) {
    return !!this.chatIdForMember(ctx.from.id)
  }

  roomIsEnabled(ctx) {
    console.log(this.memberIds[ctx.chat.id])
    return ctx.chat.id in this.memberIds
  }

  addMemberHandler =
    Handler.act((ctx) => {
      this.initChat(ctx).then((chatId) => {
        let mentionedUsers = ctx.message.entities
          .map((entity) => entity.user)
          .filter((user) => user != undefined)

        let addMemberId =
          this.memberIdsStore.modify(chatId, (members: number[]) => {
            mentionedUsers.forEach((user) => {
              let memberExists = members.some((memberId) => memberId == user.id)
              if (!memberExists) { members.push(user.id) }
            })
            return members;
          })

        let addUsers =
          Promise.all(
            mentionedUsers.map((user) => {
              this.userStore.modify(user.id, (dbUser) => {
                if (dbUser.groupId) {
                  this.memberIdsStore.modify(dbUser.groupId, (members: number[]) => {
                    return members.filter((id) => id != dbUser.groupId)
                  })
                }
                dbUser.groupId = chatId
                return dbUser.update(user)
              })
            })
          )

        Promise.all([addMemberId, addUsers]).then(() => {
          let newUsers = mentionedUsers
            .map((user) => "*" + user.first_name + " " + user.last_name + "*")
          ctx.replyWithMarkdown("Added " + newUsers.join(", "))
        }).catch(console.log)
      })
    })
    .onChatType('group')
    .hasUserEntities(true)
    .description("Add a user to the active group")
    .command("adduser")

  notifyHandler =
    Handler.act((ctx) => {
      this.initChat(ctx).then((chatId) => {
        ctx.telegram.sendMessage(
          chatId,
          // TODO Strip *[!!]* from incoming messages for commands
          "*[!!]* " + ctx.message.text.slice("/notify ".length),
          { parse_mode: 'Markdown' }
        )
      })
    })
    .filter((ctx) => this.isChatMember(ctx), "Must be part of a group first")
    .onChatType('private')
    .description("Send an anonymous message to your group")
    .command("notify")

  initChat(ctx) {
    return this.getChatId(ctx).then((chatId) => {
      if (!chatId) {
        return ctx.replyWithMarkdown("You're not a member of a group, get added with /adduser")
      }
      this.memberIdsStore.modify(chatId, (ids) => ids || [])
      this.chatIdsStore.modify((input) => {
        if (!input.some((id) => id == chatId)) {
          input.push(chatId)
        }
        return input
      })
      return chatId
    })
  }

  getChatId(ctx) {
    if (ctx.chat.type == 'private') {
      return this.userStore.get(ctx.from.id).then((user) => user.groupId)
    } else {
      return Promise.resolve(ctx.chat.id)
    }
  }

  removeMemberHandler =
    Handler.act((ctx) => {
      this.initChat(ctx).then((chatId) => {
        let user = ctx.message.entities
          .map((entity) => entity.user)
          .filter((user) => user != undefined)
          .pop()

        this.memberIdsStore.modify(chatId, function(members: number[]) {
          return members.filter((memberId) => memberId != user.id)
        }).then(() =>
          ctx.reply("Removed " + user.first_name)
        )
      })
    })
    .hasUserEntities(true)
    .description("Remove a user from your group")
    .command("removeuser")

  listMembersHandler =
    Handler.act((ctx) => {
      this.initChat(ctx).then((cid) => {
        let providedChatId = parseInt(Handler.stripCommand(ctx.message.text))
        let chatId = providedChatId || cid
        console.log(chatId)
        Promise.all(
          this.memberIds[chatId].map((memberId) => this.userStore.get(memberId))
        ).then((users) => {
          if (users.length > 0) {
            let userList = users
              .map((user) => `\[[${user.id}\]] *${user.name}* _(${user.globalKarma()}  karma)_`)
              .join("\n")

            ctx.replyWithMarkdown(userList)
          } else {
            ctx.replyWithMarkdown("No members in this group, use /adduser @UserName to add one.")
          }
        })
      })
    })
    .description("List all members in the active group")
    .command("members")
}