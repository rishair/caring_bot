import * as RedisClient from 'redis';
import { Task, User } from "../model"
import { TaskView } from "../view"
import { deserialize, serialize, deserializeArray } from "class-transformer";
import { InMemoryStore, ItemStore, Serializer, Store } from "../Store"
import { ForwardingHandler, Handler } from "./Handler"

export class ChallengeHandler extends ForwardingHandler {
  taskIdsStore: ItemStore<number[]>
  taskStore: Store<number, Task>
  activeTaskIdsStore: ItemStore<number[]>

  constructor (
    taskIdsStore: ItemStore<number[]>,
    taskStore: Store<number, Task>,
    activeTaskIdsStore: ItemStore<number[]>
  ) {
    super()
    this.taskIdsStore = taskIdsStore
    this.taskStore = taskStore
    this.activeTaskIdsStore = activeTaskIdsStore
    this.addHandlers(
      this.setRandomChallenges,
      this.setChallenges,
      this.addChallenges,
      this.clearChallenges,
      this.challenges
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

  respondWithTasks(message: string, ctx: any, ids: number[]) {
    Promise.all(ids.map(id => this.taskStore.get(id)))
      .then(tasks => {
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
    .command("setchallenge")

  addChallenges =
    Handler.act((ctx) => {
      let newIds = Handler.parseArgs(ctx.message.text).map(n => parseInt(n))
      this.activeTaskIdsStore.modify(ids => ids.concat(newIds))
        .then(ids => this.respondWithTasks("Challenges added!", ctx, ids))
    })
    .description("Add a comma delimited list of task IDs as challenges")
    .command("addchallenge")

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
