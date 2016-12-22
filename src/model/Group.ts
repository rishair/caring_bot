import { Serializer } from "../Store"
import { Exclude, deserialize, deserializeArray, serialize } from "class-transformer";

export type Chat = {
  id: number
  type: string
}

export class Group {
  chat: Chat
  members: number[]

  constructor(members, chat) {
    this.chat = chat
    this.members = members || []
  }

  static serializer = new Serializer<Group, string>(serialize, (json) => deserialize(Group, json))
}