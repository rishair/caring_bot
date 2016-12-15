import * as RedisClient from 'redis';
import { User } from "../model/User"
import { deserialize, serialize, deserializeArray } from "class-transformer";
import { ItemStore, Serializer, Store } from "../Store"
import { ChallengeHandler, ChallengeHandlerFactory } from "./ChallengeHandler"
import { ForwardingHandler, Handler, IHandler } from "./Handler"

export class KarmaHandler extends ForwardingHandler {
  userStore: Store<number, User>

  static congratulatoryMessages = ["Nice!", "Woo!", "Dope!", "Nailed it."]
  static consolingMessages = ["Ouch.", "Dang.", "Harsh.", "Oh snap.", "Dramaaaaa."]

  random<K>(list: Array<K>) {
    return list[Math.floor(Math.random() * list.length)]
  }

  constructor (
    userStore: Store<number, User>
  ) {
    super()
    this.userStore = userStore.default((id) => new User(id))
    this.addHandlers(
      this.karmaModifierHandler(
        /\+\+$/,
        1,
        (user) => {
          return `_${this.random(KarmaHandler.congratulatoryMessages)}_ *${user.name}* has ${user.globalKarma()} karma!`
        }
      ),
      this.karmaModifierHandler(
        /(--|—)$/,
        -1,
        (user) => {
          return `_${this.random(KarmaHandler.consolingMessages)}_ *${user.name}* has ${user.globalKarma()} karma.`
        }
      )
    )
  }

  karmaModifierHandler(match: RegExp, delta: number, createMessage: (user) => string) {
    return Handler.act((ctx) => {
      let mentionedUsers =
        ctx.message.entities
          .map((entity) => entity.user)
          .filter((user) => user != undefined)

      mentionedUsers.forEach((mentionedUser) => {
        if (mentionedUser.id == ctx.from.id) {
          ctx.replyWithMarkdown("_Really_, " + mentionedUser.first_name + "?", "markdown")
        } else {
          this.userStore.modify(mentionedUser.id, (user) => {
            user.update(mentionedUser)
            user.modifyKarma(delta, ctx.chat.id)
            return user
          }).then((user) => {
            ctx.replyWithMarkdown(createMessage(user))
          }).catch(console.log)
        }
      })
    })
    .hasUserEntities(true)
    .onChatType('group', true)
    .filter((ctx) => match.test(ctx.message.text))
  }
}
