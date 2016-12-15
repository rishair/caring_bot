import * as Btrconf from 'btrconf';
import AppConfig from './AppConfig';
import * as RedisClient from 'redis';
import * as TelegramClient from './Telegram'
import { ChallengeRoomHandler } from "./handler/ChallengeRoomHandler"
import { RedisStore } from "./Store"
import { User } from "./User"
import { Serializer } from "./Store"
import { Handler } from "./handler/Handler"
import { ChallengeHandler, ChallengeHandlerFactory } from "./handler/ChallengeHandler"
import { KarmaHandler } from "./handler/KarmaHandler"
import { ItemStore, Store } from "./Store"

let config = Btrconf.load<AppConfig>('./config/config')
let redis = RedisClient.createClient(config.redis);
let telegram = TelegramClient.default(config.telegram.token);
let redisStore = new RedisStore(redis)

let userStore: Store<number, User> =
  redisStore
    .scope("user")
    .contramap((id) => id.toString(), User.serializer)

let chatIdsStore: ItemStore<number[]> =
  redisStore
    .item("chat_ids")
    .contramap(Serializer.simpleArray<number>())

let challengeScope = redisStore.scope("challenge")

let challengeCreator: ChallengeHandlerFactory =
  function(chatId: number) {
    let challengeStore = challengeScope.scope(chatId.toString())
    let memberIdsStore = challengeStore.item("members").contramap(Serializer.simpleArray<number>())
    return new ChallengeHandler(chatId, telegram, memberIdsStore, userStore)
  }

let challengeHandler = new ChallengeRoomHandler(telegram, chatIdsStore, challengeCreator)
let karmaHandler = new KarmaHandler(userStore).onChatType('group')

let combinedHandler = Handler.combine(challengeHandler, karmaHandler)

telegram.on('message', (ctx, next) => {
  combinedHandler.accept(ctx)
  next();
});

telegram.startPolling();


