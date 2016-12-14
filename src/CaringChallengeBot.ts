import * as RedisClient from 'redis';
import {deserialize, serialize, deserializeArray} from "class-transformer";
import {ItemStore, Serializer, Store} from "./Store"


export class Member {
  static serializer = new Serializer<Member, string>(mem => serialize(mem), str => deserialize(Member, str))
  static arraySerializer = new Serializer<Member[], string>(mem => serialize(mem), str => deserializeArray(Member, str))

  id: number
  username: string

  constructor (id: number, username: string) {
    this.id = id
    this.username = username
  }
}

export class CaringChallengeBot {
  static numberArraySerializer = new Serializer<number[], string>(JSON.stringify, JSON.parse)

  telegram: any
  store: Store<string, string>
  chatIds: ItemStore<number[]>
  challenges: { [chatId: number] : RoomChallenge }

  constructor (telegram: any, store: Store<string, string>) {
    this.telegram = telegram
    this.store = store
    this.challenges = {}
    this.chatIds = store.item("chat_ids")
      .contramap(CaringChallengeBot.numberArraySerializer)
      .default([])

    this.chatIds.get().then((numbers) => this.updateChats(numbers)).catch((ex) => console.log(ex))
    this.register()
  }

  private updateChats(ids: number[]) {
    for (let id of ids) {
      if (!(id in this.challenges)) {
        let challenge = new RoomChallenge(id, this.telegram, this.store.scope(id.toString()))
        this.challenges[id] = challenge
      }
    }
  }

  private register() {
    this.telegram.command('init', (ctx, next) => {
      if (ctx.chat.type == 'group') {
        this.chatIds.modify((input) => {
          if (!input.some((id) => id == ctx.chat.id)) {
            input.push(ctx.chat.id)
          }
          return input
        })
      }
      next()
    })

    this.telegram.on('message', (ctx, next) => {
      for (var key in this.challenges) {
        let challenge = this.challenges[key]
        if (
          challenge.chatId == ctx.chat.id ||
          challenge.members.some((member) => member.id == ctx.from.id)
        ) {
          console.log("Dispatching to " + challenge.chatId)
          challenge.incomingMessage(ctx)
        } else {
          console.log("Didn't match " + challenge.chatId)
          console.log("Have chat: " + ctx.chat.id + ", member: " + ctx.from.id)
          console.log("Wanted chat: " + challenge.chatId + ", members: " + challenge.members)
        }
      }
      next()
    })
  }
}

export class Handler {
  accept: (ctx: any) => void

  constructor(accept: (ctx: any) => void) {
    this.accept = accept
  }

  filter(predicate: (ctx: any) => boolean) {
    let me = this
    return new Handler((ctx: any) => {
      if (predicate(ctx)) me.accept(ctx)
    })
  }

  static command(name: string, accept: (ctx: any) => void) {
    return new Handler(accept).filter((ctx) => ctx.message.text.indexOf("/" + name) == 0)
  }
}

export class RoomChallenge {
  telegram: any
  memberStore: ItemStore<Member[]>
  members: Member[]
  chatId: number
  handlers: Handler[]

  constructor (chatId: number, telegram: any, store: Store<string, string>) {
    this.telegram = telegram
    this.chatId = chatId
    this.handlers = []
    this.memberStore = store.item("members")
      .contramap(Member.arraySerializer)
      .default([])
      .onUpdate((members) => this.members = members)

    this.memberStore.get()
    this.register()
  }

  incomingMessage(ctx) {
    this.handlers.forEach((handler) => handler.accept(ctx))
  }

  private addHandler(handler: Handler) {
    this.handlers.push(handler)
  }

  private register() {
    this.addHandler(
      Handler.command('add', (ctx) => {
        let users = ctx.message.entities
          .map((entity) => entity.user)
          .filter((user) => user != undefined)

        this.memberStore.modify((input: Member[]) => {
          users.forEach((user) => {
            let member = new Member(user.id, user.first_name + " " + user.last_name)
            let memberExists = input.some((member) => member.id == user.id)
            if (!memberExists) { input.push(member) }
          })
          return input;
        }).then(() => {
          let newUsers = users.map((user) => user.first_name + " " + user.last_name)
          ctx.reply("Added " + newUsers.join(", "))
        }).catch(console.log)
      })
    )

    this.addHandler(
      Handler.command('notify', (ctx) => {
        console.log(ctx.chat)
        if (ctx.chat.type == 'private') {
          console.log("Private notification request")
          ctx.telegram.sendMessage(this.chatId, "(!!) " + ctx.message.text.slice("/notify ".length))
        }
      })
    )

    this.addHandler(
      Handler.command('remove', (ctx) => {
        let user = ctx.message.entities
          .map((entity) => entity.user)
          .filter((user) => user != undefined)
          .pop()

        console.log("To remove: " + user)

        this.memberStore.modify(function(members: Member[]) {
          return members.filter((member) => member.id != user.id)
        }).then(() =>
          ctx.reply("Removed " + user.first_name)
        )
      })
    )

    this.addHandler(
      Handler.command('members', (ctx) => ctx.reply(this.members))
    )
  }
}

