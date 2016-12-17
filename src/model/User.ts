import { Serializer } from "../Store"
import { Exclude, Type, deserialize, serialize } from "class-transformer";

type TaskEvent = { timestampMs: number, taskId: number }

export class User {
  id: number
  name: string
  roomKarmas: { [roomId: number]: number }
  tasksCompleted: TaskEvent[]

  constructor(id: number, name: string = "", roomKarmas: { [roomId: number]: number } = {}) {
    this.id = id
    this.name = name
    this.roomKarmas = roomKarmas
  }

  completeTask(taskId: number, time: number = Date.now()): TaskEvent {
    let taskEvent = { timestampMs: time, taskId: taskId }
    if (!this.tasksCompleted.some(task => task.taskId == taskId)) {
      this.tasksCompleted.push(taskEvent)
      return taskEvent
    } else {
      return undefined
    }
  }

  globalKarma() {
    var karma = 0
    for (const roomId in this.roomKarmas) {
      karma = karma + this.roomKarmas[roomId]
    }
    return karma
  }

  update(user: any) {
    this.name = user.first_name + " " + user.last_name
    return this
  }

  modifyKarma(karmaDiff: number, roomId: number = -1) {
    if (!(roomId in this.roomKarmas)) {
      this.roomKarmas[roomId] = 0
    }
    this.roomKarmas[roomId] += karmaDiff
  }

  static serializer = new Serializer<User, string>(serialize, (json) => deserialize(User, json))
}