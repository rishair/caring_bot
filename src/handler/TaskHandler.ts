import * as RedisClient from 'redis';
import { Task } from "../model/Task"
import { deserialize, serialize, deserializeArray } from "class-transformer";
import { InMemoryStore, ItemStore, Serializer, Store } from "../Store"
import { ChallengeHandler, ChallengeHandlerFactory } from "./ChallengeHandler"
import { ForwardingHandler, Handler, IHandler } from "./Handler"

export type DraftState = { active: boolean, taskId?: number, description?: string, title?: string }

export class TaskHandler extends ForwardingHandler {
  taskIdsStore: ItemStore<number[]>
  taskStore: Store<number, Task>
  draftStateStore: Store<string, DraftState>

  stopCommands: RegExp = /(stop|cancel|exit)/

  constructor (
    taskIdsStore: ItemStore<number[]>,
    taskStore: Store<number, Task>,
    draftStateStore: Store<string, DraftState> = new InMemoryStore<string, DraftState>()
  ) {
    super()
    this.taskIdsStore = taskIdsStore
    this.taskStore = taskStore
    this.draftStateStore =
      draftStateStore
        .default((k) => {
          return { active: false }
        })

    this.addHandler(
      Handler.firstOnly(
        Handler.combine(
          this.listTasks,
          this.addTask,
          this.removeTask
        ),
        this.awaitingInput
      )
    )
  }

  listTasks =
    Handler.command("task list", (ctx) => {
      this.taskIdsStore.get().then((taskIds) => {
        return Promise.all(
          taskIds.map((taskId) => {
            return this.taskStore.get(taskId)
          })
        )
      }).then((allTasks) => {
        if (allTasks.length == 0) {
          ctx.replyWithMarkdown("There are no tasks. Add one now with */task add*")
        } else {
          allTasks.sort((a, b) => a.id - b.id)
          let allTasksString =
            allTasks.map((task) => {
              return `\[[${task.id}\]] *${task.title}* - ${task.description}`
            }).join("\n")

          ctx.replyWithMarkdown(allTasksString)
        }
      })
    })

  getChatKey(ctx) {
    console.log(ctx.chat.id.toString() + ":" + ctx.from.id.toString())
    return ctx.chat.id.toString() + ":" + ctx.from.id.toString()
  }

  addTask =
    Handler.command("task add", (ctx) => {
      let chatKey = this.getChatKey(ctx)
      ctx.replyWithMarkdown("What's the description of the task? _(5 - 200 chars)_")
      this.draftStateStore.put(chatKey, { active: true })
    })

  editTask =
    Handler.command("task edit", (ctx) => {

    })

  removeTask =
    Handler.command("task remove", (ctx) => {
      let message: string = ctx.message.text.trim()
      let results = message.match(/[0-9]+/m)
      if (results) {
        let taskId = parseInt(results[0])
        this.taskStore.get(taskId).then((task) => {
          if (task) {
            ctx.replyWithMarkdown(`Task *${task.title}* deleted`)
            return this.taskStore.put(taskId, undefined)
          }
        })
      }
    })

  awaitingInput =
    Handler.act((ctx) => {
      let chatKey: string = this.getChatKey(ctx)
      let message: string = ctx.message.text

      if (this.stopCommands.test(message.toLowerCase().trim())) {
        this.draftStateStore.put(chatKey, undefined)
        ctx.reply("Task creation cancelled.")
        return
      }

      this.draftStateStore.modify(chatKey, (state) => {
        if (state.active) {
          console.log("state active")
          if (!state.description) {
            if (message.length > 5 && message.length < 200) {
              state.description = message
              ctx.replyWithMarkdown("Great. What would you like to title this challenge? _(3 - 36 chars)_")
            } else {
              ctx.replyWithMarkdown("Please enter a description between _(5 - 200) chars_")
            }
          } else if (!state.title) {
            if (message.length > 3 && message.length < 36) {
              state.title = message
            } else {
              ctx.replyWithMarkdown("Please enter a title between _(3 - 36) chars_")
            }
          }

          if (state.title && state.description) {
            let id = Math.floor(Math.random() * 100000)
            let task = new Task(id, state.title, state.description)
            state = undefined
            this.taskStore.put(id, task).then(() => {
              ctx.replyWithMarkdown("Your task has been added as ID: " + id)
            }).catch(console.log)
          }
        }
        return state
      })
    })
}
