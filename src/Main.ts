import * as Btrconf from 'btrconf';
import AppConfig from './AppConfig';
import * as RedisClient from 'redis';
import * as TelegramClient from './Telegram'
import { GroupCreationHandler } from "./handler/GroupCreationHandler"
import { RedisStore } from "./Store"
import { User } from "./model/User"
import { Task } from "./model/Task"
import { InMemoryStore, Serializer } from "./Store"
import { Handler } from "./handler/Handler"
import { GroupHandler, GroupHandlerFactory } from "./handler/GroupHandler"
import { KarmaHandler } from "./handler/KarmaHandler"
import { TaskHandler } from "./handler/TaskHandler"
import { ItemStore, Store } from "./Store"

// console.log("Start")
// let dummy = Handler.act((ctx) => 3).command("dummy").group("dummygroup")
// console.log(dummy.details())
// console.log("Done")

let config = Btrconf.load<AppConfig>('./config/config')
let redis = RedisClient.createClient(config.redis);
let telegram = TelegramClient.default(config.telegram.token);
let redisStore = new RedisStore(redis)

let userStore: Store<number, User> =
  redisStore
    .scope("user")
    .contramap<number, User>((id) => id.toString(), User.serializer)

let chatIdsStore: ItemStore<number[]> =
  redisStore
    .item("chat_ids")
    .contramap(Serializer.simpleArray<number>())

let taskScope = redisStore.scope("task")

let taskIdsStore: ItemStore<number[]> =
  taskScope
    .item("__ids")
    .contramap(Serializer.simpleArray<number>())

let taskStore: Store<number, Task> =
  taskScope
    .contramap<number, Task>((n) => n.toString(), Task.serializer)
    .trackKeys(taskIdsStore)

let challengeScope = redisStore.scope("challenge")

let challengeCreator: GroupHandlerFactory =
  function(chatId: number) {
    let challengeStore = challengeScope.scope(chatId.toString())
    let memberIdsStore = challengeStore.item("members").contramap(Serializer.simpleArray<number>())
    return new GroupHandler(chatId, telegram, memberIdsStore, userStore)
  }

let groupHandler = new GroupCreationHandler(telegram, chatIdsStore, challengeCreator)
let karmaHandler = new KarmaHandler(userStore)
let taskHandler = new TaskHandler(taskIdsStore, taskStore)
let pingHandler =
  Handler
    .act((ctx) => ctx.reply("pong"))
    .command("ping")


let combinedHandler =
  Handler.combine(
    groupHandler.group("Groups"),
    karmaHandler.group("Karma"),
    taskHandler.group("Tasks"),
    pingHandler
  )
  .help()
  .filter((ctx) => !!ctx.message.text )

telegram.on('message', (ctx, next) => {
  combinedHandler.accept(ctx)
  next();
});

telegram.startPolling();
