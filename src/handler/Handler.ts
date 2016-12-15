export interface IHandler {
  accept(ctx: any): boolean
}

export class Handler implements IHandler {
  accept: (ctx: any) => boolean
  constructor(accept: (ctx: any) => boolean) {
    this.accept = accept
  }

  filter(predicate: (ctx: any) => boolean) {
    let me = this
    return new Handler((ctx: any) => {
      if (predicate(ctx)) {
        return me.accept(ctx)
      } else {
        return false
      }
    })
  }

  onChatType(type: string) {
    return this.filter((ctx) => ctx.chat.type == type)
  }

  static command(name: string, accept: (ctx: any) => void) {
    return Handler.act(accept).filter((ctx) => ctx.message.text.indexOf("/" + name) == 0)
  }

  static create(accept: (ctx: any) => boolean) {
    return new Handler(accept)
  }

  static act(accept: (ctx: any) => void) {
    return new Handler((ctx: any) => {
      accept(ctx)
      return true
    })
  }

  static combine(...handlers: IHandler[]): Handler {
    let handler = new ForwardingHandler()
    handler.addHandlers(...handlers)
    return handler;
  }

  static firstOnly(...handlers: IHandler[]): Handler {
    let handler = new SequentialHandler(true)
    handler.addHandlers(...handlers)
    return handler
  }
}

export abstract class CollectionHandler extends Handler {
  handlers: IHandler[]
  constructor(act: (ctx: any) => boolean) {
    super(act)
    this.handlers = []
  }
  addHandler(handler: IHandler) { this.handlers.push(handler) }
  addHandlers(...handlers: IHandler[]) { this.handlers.push(...handlers) }
}

export class SequentialHandler extends CollectionHandler {
  constructor(firstOnly: boolean) {
    super((ctx) => {
      for (const i in this.handlers) {
        if (this.handlers[i].accept(ctx) && firstOnly) {
          return true
        }
      }
      return false
    })
  }
}

export class ForwardingHandler extends CollectionHandler {
  constructor() {
    super((ctx) => {
      return this.handlers
        .map((handler) => handler.accept(ctx))
        .reduce((previous, current) => { return previous || current })
    })
  }
}