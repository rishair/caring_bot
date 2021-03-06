import * as RedisClient from 'redis';
import { Task, User } from "../model"
import { deserialize, serialize, deserializeArray } from "class-transformer";
import { InMemoryStore, ItemStore, Serializer, Store } from "../Store"
import { ForwardingHandler, Handler } from "./Handler"
import { TaskView } from "../view"

export type Draft = { active: boolean, taskId?: number, description?: string, title?: string }

export class TaskHandler extends ForwardingHandler {
  taskIdsStore: ItemStore<number[]>
  taskStore: Store<number, Task>
  userStore: Store<number, User>

  drafts: { [userId: number] : Draft }
  stopCommands: RegExp = /(stop|cancel|exit|quit|pause)/
  defaultDraft = { active: false }

  constructor (
    taskIdsStore: ItemStore<number[]>,
    taskStore: Store<number, Task>
  ) {
    super()
    this.taskIdsStore = taskIdsStore
    this.taskStore = taskStore
    this.drafts = { }

    this.addHandler(
      Handler.firstOnly(
        Handler.combine(
          this.listTasks,
          this.addTask,
          this.removeTask
        ),
        this.cancelDraft,
        this.awaitingInput
      )
    )
  }

  getChatKey(ctx) {
    return ctx.chat.id.toString() + ":" + ctx.from.id.toString()
  }

  deleteDraft(ctx) {
    delete this.drafts[this.getChatKey(ctx)]
  }

  getDraft(ctx) {
    return this.drafts[this.getChatKey(ctx)] || this.defaultDraft
  }

  listTasks =
    Handler.act((ctx) => {
      this.taskIdsStore.get().then((taskIds) => {
        return Promise.all(
          taskIds.map((taskId) => {
            return this.taskStore.get(taskId)
          })
        )
      }).then((allTasks) => {
        if (allTasks.length == 0) {
          ctx.replyWithMarkdown("There are no tasks. Add one now with */addtask*")
        } else {
          ctx.replyWithMarkdown(TaskView.list(allTasks))
        }
      })
    })
    .description("List all the tasks")
    .command("tasks")

  addTask =
    Handler.act((ctx) => {
      let chatKey = this.getChatKey(ctx)
      ctx.replyWithMarkdown("What's the description of the task? _(5 - 200 chars)_")
      this.drafts[chatKey] = { active: true }
    })
    .description("Add a task with a title and description")
    .command("addtask")

  editTask = Handler.act((ctx) => {}).command("edittask")

  removeTask =
    Handler.act((ctx) => {
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
    .description("Remove a task by task ID")
    .command("removetask")

  cancelDraft =
    Handler.act((ctx) => {
      this.deleteDraft(ctx)
      ctx.reply("Task creation cancelled.")
    })
    .filter((ctx) => this.stopCommands.test(ctx.message.text.toLowerCase().trim()))

  awaitingInput =
    Handler.act((ctx) => {
      let draft: Draft = this.getDraft(ctx)
      let message = ctx.message.text.trim()
      if (!draft.description) {
        if (message.length > 5 && message.length < 200) {
          draft.description = message
          ctx.replyWithMarkdown("Great. What would you like to title this challenge? _(3 - 36 chars)_")
        } else {
          ctx.replyWithMarkdown("Please enter a description between _(5 - 200) chars_")
        }
      } else if (!draft.title) {
        if (message.length > 3 && message.length < 36) {
          draft.title = message
        } else {
          ctx.replyWithMarkdown("Please enter a title between _(3 - 36) chars_")
        }
      }

      if (draft.title && draft.description) {
        let id = Math.floor(Math.random() * 100000)
        let task = new Task(id, draft.title, draft.description)
        this.deleteDraft(ctx)
        this.taskStore.put(id, task).then(() => {
          ctx.replyWithMarkdown("Your task has been added as ID: " + id)
        }).catch(console.log)
      }
    })
    .filter((ctx) => this.getDraft(ctx).active)
}
