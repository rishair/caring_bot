import { Handler } from "./Handler"
import { ItemStore, Store } from "../Store"
import { User } from "../model/User"
import { ForwardingHandler, IHandler } from "./Handler"

export type GroupHandlerFactory = (chatId: number) => GroupHandler

export class GroupHandler extends ForwardingHandler {
  telegram: any
  chatId: number
  memberIds: number[]
  memberIdsStore: ItemStore<number[]>
  userStore: Store<number, User>

  constructor(
    chatId: number,
    telegram: any,
    memberIdsStore: ItemStore<number[]>,
    userStore: Store<number, User>
  ) {
    super()
    this.chatId = chatId
    this.telegram = telegram
    this.userStore = userStore.default((id) => new User(id))
    this.memberIdsStore =
      memberIdsStore
        .default([])
        .onUpdate((memberIds) => this.memberIds = memberIds)

    this.memberIdsStore.get()
    this.addHandlers(
      this.addMemberHandler,
      this.notifyHandler,
      this.removeMemberHandler,
      this.listMembersHandler
    )
  }

  isMember(id: number): boolean {
    return this.memberIds.some((memberId) => memberId == id)
  }

  addMemberHandler =
    Handler.act((ctx) => {
      let users = ctx.message.entities
        .map((entity) => entity.user)
        .filter((user) => user != undefined)

      let addMemberId =
        this.memberIdsStore.modify((members: number[]) => {
          users.forEach((user) => {
            let memberExists = members.some((memberId) => memberId == user.id)
            if (!memberExists) { members.push(user.id) }
          })
          return members;
        })

      let addUsers =
        Promise.all(
          users.map((user) => {
            this.userStore.modify(user.id, (dbUser) => {
              return dbUser.update(user)
            })
          })
        )

      Promise.all([addMemberId, addUsers]).then(() => {
        let newUsers = users
          .map((user) => "*" + user.first_name + " " + user.last_name + "*")
        ctx.replyWithMarkdown("Added " + newUsers.join(", "))
      }).catch(console.log)
    })
    .hasUserEntities(true)
    .command("/user add", "/add")

  notifyHandler =
    Handler.act((ctx) => {
      if (ctx.chat.type == 'private') {
        ctx.telegram.sendMessage(
          this.chatId, "*[!!]* " + ctx.message.text.slice("/notify ".length),
          { parse_mode: 'Markdown' }
        )
      }
    })
    .hasUserEntities(true)
    .command("/notify")

  removeMemberHandler =
    Handler.act((ctx) => {
      let user = ctx.message.entities
        .map((entity) => entity.user)
        .filter((user) => user != undefined)
        .pop()

      this.memberIdsStore.modify(function(members: number[]) {
        return members.filter((memberId) => memberId != user.id)
      }).then(() =>
        ctx.reply("Removed " + user.first_name)
      )
    })
    .hasUserEntities(true)
    .command("remove", "user remove")

  listMembersHandler =
    Handler.act((ctx) => {
      Promise.all(
        this.memberIds.map((memberId) => this.userStore.get(memberId))
      ).then((users) => {
        let userList = users
          .map((user) => "*" + user.name + "* _(" + user.globalKarma() + " karma)_")
          .join("\n")

        ctx.replyWithMarkdown(userList)
      })
    }).command("members")
}