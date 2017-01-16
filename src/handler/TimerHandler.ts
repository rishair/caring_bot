import * as RedisClient from 'redis';
import { User } from "../model/User"
import { deserialize, serialize, deserializeArray } from "class-transformer";
import { ItemStore, Serializer, Store } from "../Store"
import { ForwardingHandler, Handler } from "./Handler"
const Context = require('telegraf/lib/core/context')
const Juration = require("juration")
require('datejs')

type TimerCommand = {
  update: any
  print: boolean
}

class TimerTask {
  timerId: number
  userId: number
  executionTimeMs: number
  repeatIntervalMs: number
  updates: TimerCommand[]
}

type Draft = {
  enabled: boolean
  executionTimeMs?: number
  repeatIntervalMs?: number
  updates?: TimerCommand[]
  groupId?: number
}

export class TimerHandler extends ForwardingHandler {
  userStore: Store<number, User>
  executor: Handler

  drafts: { [userId: string]: Draft }
  stopCommands: RegExp = /(stop|cancel|exit|quit|pause)/
  defaultDraft: Draft = { enabled: false }

  constructor(executor: Handler, userStore: Store<number, User>) {
    super()
    this.drafts = {}
    this.userStore = userStore
    this.executor = executor
    this.addHandler(
      Handler.firstOnly(this.cancelDraft, this.timerCreator, this.addTimer)
    )
  }

  parseDate(str: string): Date {
    let date: any = Date.parse(str)
    if (date) date.setTime(date.getTime() + 9*60*60*1000);
    return date
  }

  addTimer =
    Handler.act((ctx) => {
      this.userStore.get(ctx.from.id).then((user) => {
        if (user && user.groupId) {
          let draft = { enabled: true, groupId: user.groupId }
          this.drafts[this.getChatKey(ctx)] = draft
          ctx.replyWithMarkdown("Okay, when would you like this task to first execute?")
        } else {
          ctx.replyWithMarkdown("You must be added to a group before adding a timer")
        }
      })
      // let tg = ctx.tg
      // ctx.tg = null
      // console.log(ctx)
      // let k = serialize(ctx.update)
      // let obj: any = deserialize(Object, k)
      // let newContext = new Context(obj, tg, {})
      // console.log(newContext)
      // newContext.replyWithMarkdown("testing")
    })
    .onChatType('private')
    .command("addtimer")

  copyObject(obj: any): any {
    return deserialize(Object, serialize(obj))
  }

  cancelDraft =
    Handler.act((ctx) => {
      this.deleteDraft(ctx)
      ctx.reply("Timer creation cancelled.")
      console.log(ctx.update)
    })
    .filter((ctx) => this.stopCommands.test(ctx.message.text.toLowerCase().trim()))

  helpMessage = "Could you provide me with all the commands you'd like to run for this task? Simply send me the all the messages you'd like executed in the chatroom. When you're finished send me *done*"

  timerCreator =
    Handler.act((ctx) => {
      let draft = this.getDraft(ctx)
      if (draft.executionTimeMs == undefined) {
        let date = this.parseDate(ctx.message.text)
        console.log(date)
        if (date) {
          draft.executionTimeMs = date.getTime()

          console.log((draft.executionTimeMs - Date.now() ) / 1000)
          console.log(draft.executionTimeMs)
          console.log(Date.now())
          let friendlyTime = Juration.stringify((draft.executionTimeMs - Date.now() ) / 1000, { format: 'long', units: 1 });
          ctx.replyWithMarkdown(`Great, we'll first run this task in ${friendlyTime}. How often would you like it to repeat? Enter *none* for no repeating`)
        } else {
          ctx.replyWithMarkdown("I didn't get that, could you try again?")
        }
      } else if (draft.repeatIntervalMs == null) {
        if (ctx.message.text == "none") {
          draft.repeatIntervalMs = 0
          ctx.replyWithMarkdown("No repeats it is. " + this.helpMessage)
        } else {
          try {
            let duration = Juration.parse(ctx.message.text)
            draft.repeatIntervalMs = duration
            ctx.replyWithMarkdown(`Great, we'll repeat this task every ${duration / 60} minutes. ` + this.helpMessage)
          } catch(e) {
            ctx.replyWithMarkdown("I didn't understand that, could you try again?")
          }
        }
      } else {
        draft.updates = draft.updates || []
        if (ctx.message.text == 'done') {
          ctx.replyWithMarkdown("Great, we've got " + draft.updates.length + " commands.")
        } else {
          let update = this.copyObject(ctx.update)
          update.message.chat.id = draft.groupId
          update.message.chat.type = "group"
          draft.updates.push({ update: update, print: true })
        }
      }
    })
    .filter((ctx) => this.getDraft(ctx).enabled)


  getDraft(ctx) {
    return this.drafts[this.getChatKey(ctx)] || this.defaultDraft
  }

  deleteDraft(ctx) {
    delete this.drafts[this.getChatKey(ctx)]
  }

  getChatKey(ctx) {
    return ctx.chat.id.toString() + ":" + ctx.from.id.toString()
  }
}
