type HandlerDetails = { name?: string, description?: string, requirements?: string[], group?: string }

export abstract class Handler {
  abstract accept(ctx: any): boolean

  children(): Handler[] { return [] }
  details(): HandlerDetails[] {
    return this.children()
      .map((child) => child.details())
      .filter((child) => !!child)
      .reduce((a, b) => a.concat(b), [])
  }

  filter(predicate: (ctx: any) => boolean) {
    let me = this
    return new ConcreteHandler((ctx: any) => {
      if (predicate(ctx)) {
        return me.accept(ctx)
      } else {
        return false
      }
    }, this)
  }

  hasUserEntities(error: boolean = false) {
    return this.filter((ctx) => {
      let hasEntities = ctx.message.entities
        && ctx.message.entities.some((entity) => !!entity.user)
      if (!hasEntities) {
        ctx.replyWithMarkdown("Try again except *@mentioning* a user")
      }
      return hasEntities
    })
  }

  onChatType(type: string, error: boolean = false) {
    return this.filter((ctx) => {
      if (ctx.chat.type == type) {
        return true
      } else {
        if (error) ctx.replyWithMarkdown(`Try again in a *${type}* chat`)
        return false
      }
    })
  }

  withDetail(modifier: (detail: HandlerDetails) => void) {
    return new DetailsHandler(this, modifier)
  }

  name(name: string) {
    return this.withDetail((detail) => detail.name = name)
  }

  description(desc: string) {
    return this.withDetail((detail) => detail.description = desc)
  }

  requirement(req: string) {
    return this.withDetail((detail) => {
      if (!detail.requirements) { detail.requirements = [] }
      detail.requirements.push(req)
      return detail
    })
  }

  group(name: string) {
    return this.withDetail((detail) => detail.group = name)
  }

  command(...names: string[]) {
    return this.filter((ctx) => {
        return names.some((name) => ctx.message.text.indexOf("/" + name) == 0)
      }).name("/" + names[0])
  }

  help() {
    return new HelpHandler(this)
  }

  static create(accept: (ctx: any) => boolean) {
    return new ConcreteHandler(accept)
  }

  static act(accept: (ctx: any) => void) {
    return this.create((ctx: any) => {
      accept(ctx)
      return true
    })
  }

  static combine(...handlers: Handler[]): Handler {
    let handler = new ForwardingHandler()
    handler.addHandlers(...handlers)
    return handler;
  }

  static firstOnly(...handlers: Handler[]): Handler {
    let handler = new SequentialHandler(true)
    handler.addHandlers(...handlers)
    return handler
  }
}

export class DetailsHandler extends Handler {
  modifier: (detail: HandlerDetails) => void
  underlying: Handler

  constructor(underlying: Handler, modifier: (detail: HandlerDetails) => void) {
    super()
    this.underlying = underlying
    this.modifier = modifier
  }

  children() { return [this.underlying] }
  accept(ctx: any) { return this.underlying.accept(ctx) }

  details(): HandlerDetails[] {
    let details = super.details()
    if (details.length == 0) { details = [{}] }
    return details
      .map((original) => {
        this.modifier(original)
        return original
      })
      .filter((v) => !!v)
  }
}

export class ConcreteHandler extends Handler {
  acceptOp: (ctx: any) => boolean
  underlying: Handler

  constructor(acceptOp: (ctx: any) => boolean, underlying?: Handler) {
    super()
    this.acceptOp = acceptOp
    this.underlying = underlying
  }

  children() { return [this.underlying].filter((v) => !!v) }
  accept(ctx: any) { return this.acceptOp(ctx) }
}


export abstract class CollectionHandler extends Handler {
  handlers: Handler[]
  constructor() {
    super()
    this.handlers = []
  }
  children() { return this.handlers }
  addHandler(handler: Handler) { this.handlers.push(handler) }
  addHandlers(...handlers: Handler[]) { this.handlers.push(...handlers) }
}

export class SequentialHandler extends CollectionHandler {
  firstOnly: boolean
  constructor(firstOnly: boolean) {
    super()
    this.firstOnly = firstOnly
  }

  accept(ctx: any) {
    var accepted = false
    for (const i in this.handlers) {
      if (this.handlers[i].accept(ctx)) {
        if (this.firstOnly) { return true }
        else { accepted = true }
      }
    }
    return accepted
  }
}

export class ForwardingHandler extends CollectionHandler {
  accept(ctx: any) {
    return this.handlers
      .map((handler) => handler.accept(ctx))
      .reduce((previous, current) => { return previous || current })
    }
}

export class HelpHandler extends ForwardingHandler {
  constructor(underlyingHandler: Handler) {
    super()
    this.addHandler(
      Handler.firstOnly(this.helpHandler, underlyingHandler)
    )
  }

  groupBy<V>(items: V[], extractKey: (value: V) => string): { [key: string ]: V[] } {
    let grouped: { [key: string ]: V[] } = {}
    items.forEach((item) => {
      let group = extractKey(item)
      if (!(group in grouped)) { grouped[group] = [] }
      grouped[group].push(item)
    })
    return grouped
  }

  helpHandler =
    Handler.act((ctx) => {
      let grouped = this.groupBy(this.details(), (detail) => detail.group || "Other")
      let help = []
      for (const group in grouped) {
        let details = grouped[group]
        let modules = details.map(detail => {
          let desc = []
          if (detail.name) {
            if (detail.name.indexOf("/") == 0) {
              desc.push(`${detail.name}`)
            } else {
              desc.push(`_${detail.name}_`)
            }
          }
          if (detail.description) desc.push(`${detail.description}`)
          return desc.join(" - ")
        }).join("\n")
        help.push(`*${group}*\n${modules}\n`)
      }
      ctx.replyWithMarkdown(help.join("\n"))
    })
    .description("List all commands")
    .command("help")
}

