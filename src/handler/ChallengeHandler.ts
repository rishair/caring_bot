import { Promise } from 'es6-promise'
import { Handler } from "./Handler"
import { ItemStore, Store } from "../Store"
import { User } from "../User"
import { ForwardingHandler, IHandler } from "./Handler"

export type ChallengeHandlerFactory = (chatId: number) => ChallengeHandler

export class ChallengeHandler extends ForwardingHandler {
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
    this.userStore = userStore
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
    Handler.command('add', (ctx) => {
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

      addMemberId.then(() => {
        let newUsers = users.map((user) => user.first_name + " " + user.last_name)
        ctx.reply("Added " + newUsers.join(", "))
      }).catch(console.log)
    })

  notifyHandler =
    Handler.command('notify', (ctx) => {
      console.log(ctx.chat)
      if (ctx.chat.type == 'private') {
        console.log("Private notification request")
        ctx.telegram.sendMessage(this.chatId, "(!!) " + ctx.message.text.slice("/notify ".length))
      }
    })

  removeMemberHandler =
    Handler.command('remove', (ctx) => {
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

  listMembersHandler = Handler.command('members', (ctx) => ctx.reply(this.memberIds))
}