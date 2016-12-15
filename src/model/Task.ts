import { Serializer } from "../Store"
import { Exclude, deserialize, deserializeArray, serialize } from "class-transformer";

export class Task {
  id: number
  title: string
  description: string

  constructor(id: number, title: string, description: string) {
    this.id = id
    this.title = title
    this.description = description
  }

  static serializer = new Serializer<Task, string>(serialize, (json) => deserialize(Task, json))
}