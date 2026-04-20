// Minimal typed shape for Slack interactivity payloads. Slack's own types
// are too permissive (unions across every block kind); this version covers
// the surface we actually read and keeps handlers off `any`.
// Full spec: https://api.slack.com/reference/interaction-payloads

export interface SlackOption {
  value?: string
  text?: { type?: string; text?: string }
}

export interface SlackStateValue {
  type?: string
  value?: string
  selected_user?: string
  selected_option?: SlackOption
  selected_options?: SlackOption[]
}

export type SlackStateValues = Record<string, Record<string, SlackStateValue>>

export interface SlackAction {
  type?: string
  action_id?: string
  block_id?: string
  value?: string
  selected_option?: SlackOption
  selected_options?: SlackOption[]
  selected_user?: string
}

export interface SlackView {
  id?: string
  hash?: string
  callback_id?: string
  private_metadata?: string
  state?: { values?: SlackStateValues }
  type?: string
}

export interface SlackUser {
  id?: string
  name?: string
  email?: string
}

export interface SlackContainer {
  channel_id?: string
  message_ts?: string
  type?: string
}

export interface SlackMessage {
  ts?: string
}

export interface SlackChannel {
  id?: string
  name?: string
}

export type InteractivityType = 'block_actions' | 'view_submission' | 'view_closed'

export interface SlackInteractivityPayload {
  type: InteractivityType | (string & {})
  user?: SlackUser
  trigger_id?: string
  response_url?: string
  view?: SlackView
  actions?: SlackAction[]
  container?: SlackContainer
  message?: SlackMessage
  channel?: SlackChannel
}

// Shape the interactivity route handler writes back to Slack. `clear`
// closes the modal; `update` replaces it; `errors` surfaces inline.
export type ResponseAction =
  | { response_action: 'clear' }
  | { response_action: 'update'; view: unknown }
  | { response_action: 'errors'; errors: Record<string, string> }

// Slack docs: view_submission handlers can return up to ~3s; returning
// undefined is equivalent to an empty 200 and leaves the modal open.
export type ResponseOrVoid = ResponseAction | undefined
