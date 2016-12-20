import { Task } from "../model"

export class TaskView {
  static list(tasks: Task[]): string {
    tasks.sort((a, b) => a.id - b.id)
    return tasks.map((task) => {
        return `\[[${task.id}\]] *${task.title}* - ${task.description}`
      }).join("\n")
  }
}
