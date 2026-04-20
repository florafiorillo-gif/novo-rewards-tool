import type { App } from '@slack/bolt'

export function registerCommandHandlers(app: App): void {
  app.command('/recognize', async ({ ack, body, client }) => {
    await ack()

    // Phase 2: replace this stub with the full four-field nomination modal
    await client.views.open({
      trigger_id: body.trigger_id,
      view: {
        type: 'modal',
        callback_id: 'nomination_modal',
        title: { type: 'plain_text', text: 'Recognize a teammate' },
        close: { type: 'plain_text', text: 'Cancel' },
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: "The nomination flow is coming in Phase 2. Stay tuned.",
            },
          },
        ],
      },
    })
  })
}
