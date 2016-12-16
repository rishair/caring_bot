import * as RedisClient from 'redis';
import { User } from "../model/User"
import { deserialize, serialize, deserializeArray } from "class-transformer";
import { ItemStore, Serializer, Store } from "../Store"
import { GroupHandler, GroupHandlerFactory } from "./GroupHandler"
import { ForwardingHandler, Handler } from "./Handler"

export class GroupCreationHandler extends ForwardingHandler {
  telegram: any
  chatIdsStore: ItemStore<number[]>
  challenges: { [roomId: number] : GroupHandler }
  challengeFactory: GroupHandlerFactory

  constructor (
    telegram: any,
    chatIdsStore: ItemStore<number[]>,
    challengeFactory: GroupHandlerFactory
  ) {
    super()
    this.telegram = telegram
    this.chatIdsStore =
      chatIdsStore
        .default([])
        .onUpdate((chatIds) => this.updateChats(chatIds))

    this.chatIdsStore.get()
    this.challengeFactory = challengeFactory
    this.challenges = {}
    this.addHandlers(this.initHandler, this.messageHandler)
  }

  initHandler: Handler =
    Handler.act((ctx) => {
      this.chatIdsStore.modify((input) => {
        if (!input.some((id) => id == ctx.chat.id)) {
          input.push(ctx.chat.id)
          ctx.reply("Actively caring challenge has commenced!")
        } else {
          ctx.reply("Challenge already under way.")
        }
        return input
      })
    })
    .onChatType('group', true)
    .description("Begin a group in the active room")
    .command("init")


  messageHandler: Handler =
    Handler.act((ctx) => {
      for (var key in this.challenges) {
        let challenge = this.challenges[key]
        if (challenge.chatId == ctx.chat.id || challenge.isMember(ctx.from.id)) {
          console.log("Dispatching to " + challenge.chatId)
          challenge.accept(ctx)
        }
      }
    })

  private updateChats(ids: number[]) {
    for (let id of ids) {
      if (!(id in this.challenges)) {
        console.log("Setting Challenge listener for " + id)
        this.challenges[id] = this.challengeFactory(id)
      }
    }
  }
}
