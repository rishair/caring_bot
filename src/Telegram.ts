const Telegraf = require('telegraf')

export default function (token: string): any {
  return new Telegraf(token)
}
