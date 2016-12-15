export interface IHandler {
  accept(ctx: any): void
}

export class Handler implements IHandler {
  accept: (ctx: any) => void
  constructor(accept: (ctx: any) => void) {
    this.accept = accept
  }

  filter(predicate: (ctx: any) => boolean) {
    let me = this
    return new Handler((ctx: any) => {
      if (predicate(ctx)) me.accept(ctx)
    })
  }

  onChatType(type: string) {
    return this.filter((ctx) => ctx.chat.type == type)
  }

  static command(name: string, accept: (ctx: any) => void) {
    return new Handler(accept).filter((ctx) => ctx.message.text.indexOf("/" + name) == 0)
  }

  static combine(...handlers: IHandler[]): Handler {
    return new Handler((ctx) => handlers.forEach((handler) => handler.accept(ctx)))
  }
}

export class ForwardingHandler extends Handler {
  handlers: IHandler[]

  constructor() {
    super((ctx) => {
      this.handlers.forEach((handler) => handler.accept(ctx))
    })
    this.handlers = []
  }

  addHandler(handler: IHandler) { this.handlers.push(handler) }
  addHandlers(...handlers: IHandler[]) { this.handlers.push(...handlers) }
}