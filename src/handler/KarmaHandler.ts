import * as RedisClient from 'redis';
import { User } from "../User"
import { deserialize, serialize, deserializeArray } from "class-transformer";
import { ItemStore, Serializer, Store } from "../Store"
import { ChallengeHandler, ChallengeHandlerFactory } from "./ChallengeHandler"
import { Promise } from 'es6-promise'
import { ForwardingHandler, Handler, IHandler } from "./Handler"

export class KarmaHandler extends ForwardingHandler {
  userStore: Store<number, User>

  static congratulatoryMessages = ["Nice!", "Hell yeah!", "Woohoo!", "Dope!", "Nailed it.", "Aw yeah."]
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
          return this.random(KarmaHandler.congratulatoryMessages) + " " + user.name + " has " + user.globalKarma() + " karma!"
        }
      ),
      this.karmaModifierHandler(
        /(--|—)$/,
        -1,
        (user) => {
          return this.random(KarmaHandler.consolingMessages) + " " + user.name + " has " + user.globalKarma() + " karma."
        }
      )
    )
  }

  karmaModifierHandler(match: RegExp, delta: number, createMessage: (user) => string) {
    return new Handler((ctx) => {
      if (match.test(ctx.message.text)) {
        console.log("We've got a karma!")
        let mentionedUsers =
          ctx.message.entities
            .map((entity) => entity.user)
            .filter((user) => user != undefined && user != ctx.from.id)

        mentionedUsers.forEach((mentionedUser) => {
          if (mentionedUser.id == ctx.from.id && 1 > 5) {
            ctx.reply("wtf " + mentionedUser.first_name)
          } else {
            this.userStore.modify(mentionedUser.id, (user) => {
              user.update(mentionedUser)
              user.modifyKarma(delta, ctx.chat.id)
              return user
            }).then((user) => {
              ctx.reply(createMessage(user))
            }).catch(console.log)
          }
        })
      }
    })
  }
}