import * as Btrconf from 'btrconf';
import AppConfig from './AppConfig';
import * as RedisClient from 'redis';
import * as TelegramClient from './Telegram'
import { RedisStore } from "./Store"
import { User, Task, Feedback } from "./model"
import { InMemoryStore, Serializer } from "./Store"
import { GroupHandler, Handler, FeedbackHandler, KarmaHandler, TaskHandler } from "./handler"
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

let taskScope = redisStore.scope("task")

let taskIdsStore: ItemStore<number[]> =
  taskScope
    .item("__ids")
    .contramap(Serializer.simpleArray<number>())

let taskStore: Store<number, Task> =
  taskScope
    .contramap<number, Task>((n) => n.toString(), Task.serializer)
    .trackKeys(taskIdsStore)

let groupScope = redisStore.scope("group")

let groupIdsStore: ItemStore<number[]> =
  groupScope
    .item("__ids")
    .contramap(Serializer.simpleArray<number>())

let groupMembersStore: Store<number, number[]> =
  groupScope
    .transformKey<number>((k) => k.toString() + "/members")
    .trackKeys(groupIdsStore)
    .contramapValue(Serializer.simpleArray<number>())

let feedbackStore: ItemStore<Feedback[]> =
  redisStore
    .contramapValue(Serializer.simpleArray<Feedback>())
    .item("feedback")

let groupHandler = new GroupHandler(telegram, groupIdsStore, groupMembersStore, userStore)
let karmaHandler = new KarmaHandler(userStore)
let taskHandler = new TaskHandler(taskIdsStore, taskStore, userStore)
let feedbackHandler = new FeedbackHandler(feedbackStore)
let pingHandler =
  Handler
    .act((ctx) => ctx.reply("pong"))
    .command("ping")

let combinedHandler =
  Handler.combine(
    groupHandler.group("Groups"),
    karmaHandler.group("Karma"),
    taskHandler.group("Tasks"),
    feedbackHandler.group("Feedback"),
    pingHandler
  )
  .help()
  .filter((ctx) => !!ctx.message.text )

telegram.on('message', (ctx, next) => {
  combinedHandler.accept(ctx)
  next();
});

telegram.startPolling();
