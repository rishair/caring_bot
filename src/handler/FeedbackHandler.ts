import * as RedisClient from 'redis';
import { ItemStore } from "../Store"
import { ForwardingHandler, Handler } from "./Handler"
import { Feedback } from "../model"

export class FeedbackHandler extends ForwardingHandler {
  feedbackStore: ItemStore<Feedback[]>

  constructor (
    feedbackStore: ItemStore<Feedback[]>
  ) {
    super()

    this.feedbackStore =
      feedbackStore
        .default([])

    this.addHandlers(
      this.addFeedback,
      this.listFeedback,
      this.clearFeedback
    )
  }

  addFeedback =
    Handler.act((ctx) => {
      let feedback = { userId: ctx.from.id, date: Date.now(), message: Handler.stripCommand(ctx.message.text) }
      this.feedbackStore.modify((feedbacks) => {
        if (feedbacks.some(f => f.message == feedback.message && f.userId == feedback.userId)) {
          ctx.replyWithMarkdown("You've already given this feedback")
          return feedbacks
        } else {
          feedbacks.push(feedback)
          ctx.replyWithMarkdown("Thanks!")
          return feedbacks
        }
      })
    })
    .filter((ctx) => Handler.stripCommand(ctx.message.text).length > 2, "Please enter a feedback message")
    .onChatType("private")
    .description("Send anonymous feedback")
    .command("feedback")

  listFeedback =
    Handler.act((ctx) => {
      this.feedbackStore.get().then((feedbacks) => {
        if (feedbacks.length > 0) {
          ctx.replyWithMarkdown(feedbacks.map(f => "- " + f.message).reverse().join("\n"))
        } else {
          ctx.replyWithMardkwon("No feedback.")
        }
      })
    })
    .description("Anonymously list all provided feedback")
    .command("listfeedback")

  clearFeedback =
    Handler.act((ctx) => {
      this.feedbackStore.put([]).then((feedbacks) => {
        ctx.replyWithMarkdown("Done")
      })
    })
    .description("Delete all feedback")
    .command("clearfeedback")
}
