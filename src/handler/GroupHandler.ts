import { ItemStore, Store } from "../Store"
import { User } from "../model/User"
import { ForwardingHandler, Handler } from "./Handler"

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
      .onUpdate((chatId, memberIds) => this.memberIds[chatId] = memberIds)

    // Boot strap the data for all the chat rooms being watched
    this.chatIdsStore.get().then((ids) => {
      console.log("Bootstrapping " + ids)
      ids.forEach(id => memberIdsStore.get(id))
    })

    this.addHandlers(
      this.initHandler,
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
    return !!this.chatIdForMember(ctx.user.id)
  }

  initHandler: Handler =
    Handler.act((ctx) => {
      this.memberIdsStore.put(ctx.chat.id, [])
      this.chatIdsStore.modify((input) => {
        if (!input.some((id) => id == ctx.chat.id)) {
          input.push(ctx.chat.id)
          ctx.replyWithMarkdown("Actively caring challenge has commenced!")
        } else {
          ctx.replyWithMarkdown("Challenge already under way.")
        }
        return input
      })
    })
    .onChatType('group', true)
    .description("Begin a group in the active room")
    .command("init")


  roomIsEnabled(ctx) {
    console.log(this.memberIds[ctx.chat.id])
    return ctx.chat.id in this.memberIds
  }

  addMemberHandler =
    Handler.act((ctx) => {
      let mentionedUsers = ctx.message.entities
        .map((entity) => entity.user)
        .filter((user) => user != undefined)

      let addMemberId =
        this.memberIdsStore.modify(ctx.chat.id, (members: number[]) => {
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
              dbUser.groupId = ctx.chat.id
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
    .onChatType('group')
    .hasUserEntities(true)
    .filter(ctx => this.roomIsEnabled(ctx), "Try initializing the room first with /init")
    .description("Add a user to the active group")
    .command("adduser")

  notifyHandler =
    Handler.act((ctx) => {
      if (ctx.chat.type == 'private') {
        ctx.telegram.sendMessage(
          this.chatIdForMember(ctx.user.id),
          "*[!!]* " + ctx.message.text.slice("/notify ".length),
          { parse_mode: 'Markdown' }
        )
      }
    })
    .filter((ctx) => this.isChatMember(ctx), "Must be part of a group first")
    .onChatType('private')
    .description("Send an anonymous message to your group")
    .command("notify")

  removeMemberHandler =
    Handler.act((ctx) => {
      let user = ctx.message.entities
        .map((entity) => entity.user)
        .filter((user) => user != undefined)
        .pop()

      this.memberIdsStore.modify(ctx.chat.id, function(members: number[]) {
        return members.filter((memberId) => memberId != user.id)
      }).then(() =>
        ctx.reply("Removed " + user.first_name)
      )
    })
    .hasUserEntities(true)
    .onChatType('group')
    .filter(ctx => this.roomIsEnabled(ctx), "Try initializing the room first with /init")
    .description("Remove a user from the active group")
    .command("removeuser")

  listMembersHandler =
    Handler.act((ctx) => {
      let providedChatId = parseInt(Handler.stripCommand(ctx.message.text))
      this.userStore.get(ctx.from.id).then((user) => {
        let chatId = providedChatId || ctx.chat.id || user.groupId
        Promise.all(
          this.memberIds[chatId].map((memberId) => this.userStore.get(memberId))
        ).then((users) => {
          let userList = users
            .map((user) => `\[[${user.id}\]] *${user.name}* _(${user.globalKarma()}  karma)_`)
            .join("\n")

          ctx.replyWithMarkdown(userList)
        })
      })
    })
    .filter(ctx => this.roomIsEnabled(ctx), "Try initializing the room first with /init")
    .description("List all members in the active group")
    .command("members")
}