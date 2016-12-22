import * as RedisClient from 'redis';
import { Task, User } from "../model"
import { TaskView } from "../view"
import { deserialize, serialize, deserializeArray } from "class-transformer";
import { InMemoryStore, ItemStore, Serializer, Store } from "../Store"
import { ForwardingHandler, Handler } from "./Handler"
const Moment = require("moment")

export class ChallengeHandler extends ForwardingHandler {
  taskIdsStore: ItemStore<number[]>
  taskStore: Store<number, Task>
  activeTaskIdsStore: ItemStore<number[]>
  userStore: Store<number, User>

  constructor (
    taskIdsStore: ItemStore<number[]>,
    taskStore: Store<number, Task>,
    activeTaskIdsStore: ItemStore<number[]>,
    userStore: Store<number, User>
  ) {
    super()
    this.taskIdsStore = taskIdsStore
    this.taskStore = taskStore
    this.activeTaskIdsStore = activeTaskIdsStore
    this.userStore = userStore
    this.addHandlers(
      this.setRandomChallenges,
      this.setChallenges,
      this.addChallenges,
      this.clearChallenges,
      this.challenges,
      this.completeChallenge,
      this.completedChallenges
    )
  }

  shuffleArray<T>(array: Array<T>): Array<T> {
    for (let i = array.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var temp = array[i];
      array[i] = array[j];
      array[j] = temp;
    }
    return array;
  }

  get activeTasks() {
    return this.activeTaskIdsStore.get().then((ids) => {
      return this.getTasks(ids)
    })
  }

  getTasks(ids: number[]): Promise<Task[]> {
    return Promise.all(ids.map(id => this.taskStore.get(id)))
  }

  respondWithTasks(message: string, ctx: any, ids: number[]) {
    this.getTasks(ids).then(tasks => {
        if (tasks.length > 0) {
          ctx.replyWithMarkdown(message + "\n " + TaskView.list(tasks))
        } else {
          ctx.replyWithMarkdown(message + " No challenges.")
        }
      })
  }

  setRandomChallenges =
    Handler.act((ctx) => {
      let args = Handler.parseArgs(ctx.message.text)
      let count = parseInt(args[0])
      this.taskIdsStore.get()
        .then((ids) => {
          let shuffledIds: Array<number> = this.shuffleArray(ids)
          return this.activeTaskIdsStore.put(shuffledIds.slice(0, count))
        })
        .then(ids => this.respondWithTasks("Random challenges set!", ctx, ids))
    })
    .withArgumentCount(1, "Try again with # of challenges you'd like to set")
    .description("Randomly select and set n challenges")
    .command("setrandomchallenges")


  setChallenges =
    Handler.act((ctx) => {
      let ids = Handler.parseArgs(ctx.message.text).map(n => parseInt(n))
      this.activeTaskIdsStore.put(ids).then(ids => this.respondWithTasks("Challenges set!", ctx, ids))
    })
    .description("Clear and set the list of challenges to the given task IDs")
    .command("setchallenges")

  addChallenges =
    Handler.act((ctx) => {
      let newIds = Handler.parseArgs(ctx.message.text).map(n => parseInt(n))
      this.activeTaskIdsStore.modify(ids => ids.concat(newIds))
        .then(ids => this.respondWithTasks("Challenges added!", ctx, ids))
    })
    .description("Add a comma delimited list of task IDs as challenges")
    .command("addchallenges")

  clearChallenges =
    Handler.act((ctx) => this.activeTaskIdsStore.put([]).then(() => ctx.replyWithMarkdown("Active challenges cleared.")))
      .description("Clear active challenges")
      .command("clearchallenges")

  challenges =
    Handler.act((ctx) => {
      this.activeTaskIdsStore.get().then((ids) => this.respondWithTasks("Current challenges:", ctx, ids))
    })
    .description("List all the active challenges")
    .command("challenges")

  completeChallenge =
    Handler.act((ctx) => {
      this.userStore.get(ctx.from.id).then((user) => {
        if (!user || !user.groupId) {
          ctx.replyWithMarkdown("You must be added to a group before completing a challenge")
          user.groupId = ctx.from
        } else {
          // TODO: allow matching on title of challenge
          let challengeId = parseInt(Handler.stripCommand(ctx.message.text))
          this.activeTasks.then((tasks) => {
            let activeChallenge = tasks.find((task) => task.id == challengeId)
            if (!activeChallenge) {
              ctx.replyWithMarkdown(challengeId + " isn't an active challenge")
            } else {
              this.userStore.modify(ctx.from.id, (user) => {
                user.completeTask(activeChallenge.id)
                return user
              }).then((user) => {
                ctx.replyWithMarkdown("Task marked as completed!")
              })
            }
          })
        }
      })
    })
    .description("Mark a challenge as completed with its ID")
    .command("complete")

  completedChallenges =
    Handler.act((ctx) => {
      let userId = parseInt(Handler.stripCommand(ctx.message.text)) || ctx.from.id
      this.userStore.get(userId).then((user: User) => {
        if (user.tasksCompleted.length == 0) {
          ctx.replyWithMarkdown("No completed tasks")
        } else {
          this.getTasks(user.tasksCompleted.map(task => task.taskId)).then((fullTasks: Task[]) => {
            ctx.replyWithMarkdown(
              "Completed:\n " + user.tasksCompleted.map((event) => {
                let task = fullTasks.filter(t => t.id == event.taskId).pop()
                return ` *${task.title}* ${Moment(event.timestampMs).fromNow()}`
              }).join("\n")
            )
          })
        }
      })
    })
    .description("See all completed challenges for yourself or another user")
    .command("completed")

  // settasks (random <number of tasks> | <list of task ids>)
  // notifytasks
  // tasks
  // taskstats <task #>
  // completetask <task #>
  //
  // timer

  // Set active tasks (manually or random)
  // get active tasks
  // Give stats on tasks
  // Allow people to record a task as completed
  // Send notifications


  // TimerHandler, allow people to set timers to perform arbitrary tasks
}
