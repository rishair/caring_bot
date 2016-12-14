// const Telegraf = require('telegraf')


// const app = new Telegraf("312497982:AAGoSija9XDqcnuyf8wqgTWjxHoRdKFrY0Q")

// var mainRoomId = null;

// // app.command('whodabest', (ctx) => {
// //   console.log('start', ctx.from)
// //   ctx.reply('Rishi, of course')
// // })

// app.hears("CaringChallengeBot", (ctx) => ctx.reply("what do you want"))
// app.hears('sup bot', (ctx) => ctx.reply('not much my caring brethren'))

// app.on('sticker', (ctx) => ctx.reply('👍'))
// app.on('message', (ctx) => console.log(ctx))

// app.startPolling()

// // hello aj
// // green-nostalgic-hyper-bear-times-!-5

import * as Btrconf from 'btrconf';
import AppConfig from './AppConfig';
import * as RedisClient from 'redis';
import * as TelegramClient from './Telegram'
import {CaringChallengeBot} from "./CaringChallengeBot"
import {RedisStore} from "./Store"

let config = Btrconf.load<AppConfig>('./config/config')
// let redis: any = bluebird.promisifyAll(redisClient.createClient(config.redis))
let redis = RedisClient.createClient(config.redis);
let telegram = TelegramClient.default(config.telegram.token);
let redisStore = new RedisStore(redis)


// telegram.on('message', (ctx, next) => {
//   console.log(ctx);
//   next();
// });


let bot = new CaringChallengeBot(telegram, redisStore)

telegram.startPolling();


