# Slack setup runbook

How to take a fresh Slack workspace from zero to a working Novo Rewards integration. Plain-language: this doc assumes you can click through Slack's app config UI and paste env vars into a `.env.local`.

> **Scope.** This is the **single-workspace, bot-token-only** path — one Novo install, one Slack workspace, one bot token in env. The codebase does not (yet) implement the multi-workspace OAuth install flow you'd need to onboard outside customers; if that's the deployment goal, additional work in `app/api/slack/install/...` is required. See [audit notes](#whats-not-covered) at the bottom.

---

## 1. Create the Slack app

1. Go to <https://api.slack.com/apps> → **Create New App** → **From scratch**.
2. Name it `Novo Rewards` (or `Novo Rewards (dev)` for a sandbox install). Pick the workspace.
3. You'll land on the **Basic Information** page. Keep this tab open — you'll come back to it for the signing secret.

There is no useful Slack template for this app; "from scratch" is correct.

---

## 2. Configure OAuth scopes

In **OAuth & Permissions** → **Scopes** → **Bot Token Scopes**, add the following. Each maps to specific calls the app makes — granting only what's needed.

| Scope | Why we need it |
|---|---|
| `chat:write` | Post and edit messages — approver DMs, recipient DMs, the `#made-it-happen` channel post |
| `users:read` | Look up a Slack user by Slack ID (used when handling button clicks and event payloads to map Slack user → Novo employee) |
| `users:read.email` | Look up a Slack user by email (used when the app initiates a DM, since the Novo side keys on email) |
| `im:write` | Open a 1:1 DM channel with a user before posting to it |
| `commands` | Register the `/recognize` slash command |
| `reactions:read` | Receive emoji reactions on the channel post (recorded into the engagement store) |
| `channels:history` | Receive thread replies on the channel post (recorded as corroborating comments) |

There is no "user token" — we use a bot token only. Don't request user-token scopes.

---

## 3. Get the bot token + signing secret

You'll grab two strings here.

### Signing secret
- **Where:** Basic Information → **App Credentials** → **Signing Secret** → click "Show" → copy.
- **Env var:** `SLACK_SIGNING_SECRET`
- **What it does:** verifies that inbound webhooks at `/api/slack/commands`, `/api/slack/interactivity`, `/api/slack/events` are actually from Slack. All three routes return `503` if this is missing and `401` on a bad signature.

### Bot token
- **Where:** OAuth & Permissions → **Install to Workspace** (orange button at the top). Approve the install in the workspace prompt. After install, the page will show a **Bot User OAuth Token** starting with `xoxb-…` → copy.
- **Env var:** `SLACK_BOT_TOKEN`
- **What it does:** authenticates outbound calls (DMs, channel posts, modal opens). When unset, the integration silently no-ops with a single warning log per process. Setting it once "lights up" all Slack surfaces.

> The "Install to Workspace" button will be greyed out until you've added at least one scope from step 2.

---

## 4. Configure the slash command

In **Slash Commands** → **Create New Command**:

| Field | Value |
|---|---|
| Command | `/recognize` |
| Request URL | `https://<your-host>/api/slack/commands` |
| Short description | `Recognize a teammate with a reward` |
| Usage hint | *(leave empty)* |
| Escape channels, users, links | leave unchecked |

`<your-host>` = your deployed domain in production, or your tunnel URL in local dev (see [§9](#9-local-development-with-a-tunnel)).

---

## 5. Configure interactivity

In **Interactivity & Shortcuts**:

- Toggle **Interactivity** on.
- **Request URL:** `https://<your-host>/api/slack/interactivity`

This is the URL Slack hits when someone clicks a button (Approve / Propose upgrade / Acknowledge / etc.) or submits the nomination modal.

You don't need any **Shortcuts** or **Select Menus** entries — the app doesn't use them.

---

## 6. Configure event subscriptions

In **Event Subscriptions**:

- Toggle **Enable Events** on.
- **Request URL:** `https://<your-host>/api/slack/events`. Slack sends a one-time `url_verification` challenge here — the route already handles it.
- **Subscribe to bot events**, add:
  - `reaction_added`
  - `reaction_removed`
  - `message.channels`

> **About `message.channels`:** the app only acts on thread replies under the channel post (`event.thread_ts && event.thread_ts !== event.ts`). Top-level messages are ignored. There's no per-channel filter at Slack's end — keep the bot out of channels you don't want it listening to. In practice, the bot only needs to be in `#made-it-happen` for the reaction + thread-reply story to work.

> **Reactions today:** reactions and thread replies ARE recorded into the engagement store (`recordReaction`, `recordComment` in `modules/communication/engagement.ts`). The monthly-digest reader that surfaces them is **not yet built**, so they accumulate but aren't presented anywhere user-facing yet. That's a planned feature — the events are still worth subscribing to so the data is captured from day one.

---

## 7. Channel setup

The channel post (`#made-it-happen`) is where approved recognitions get celebrated publicly.

1. Create or pick the channel in Slack. Public channel recommended.
2. Get the channel **ID** (not the name):
   - Right-click the channel → **View channel details** → scroll to the bottom → **Channel ID** field, e.g. `C08AABBCCDD`.
3. Set the env var:
   ```
   SLACK_MADE_IT_HAPPEN_CHANNEL_ID=C08AABBCCDD
   ```
4. **Invite the bot to the channel.** In the channel: `/invite @Novo Rewards`. Without this the channel post will fail with `not_in_channel` and the recognition will silently miss its public moment.

> Empty `SLACK_MADE_IT_HAPPEN_CHANNEL_ID` is a valid configuration — the channel post becomes a no-op (DMs and digests still fire). Useful for staging environments where you don't want test recognitions polluting a real channel.

---

## 8. Install the bot to the workspace

If you haven't already done step 3, install now (OAuth & Permissions → **Install to Workspace**). After install:

1. Confirm the bot user appears in the workspace (search for `@Novo Rewards`).
2. Invite it to `#made-it-happen` (per §7).
3. Optionally, set the bot's profile photo and "What I do" string in the **App Home** page.

If you change scopes after install, Slack will prompt you to **reinstall** to grant the new ones — old tokens stay valid for old scopes only.

---

## 9. Local development with a tunnel

Slack only sends webhooks to public HTTPS URLs. For local dev you need a tunnel from a public URL into `http://localhost:3000`.

**Recommendation: cloudflared.** No account required for one-off "quick tunnels," and the URL persists for the tunnel's lifetime.

```bash
brew install cloudflared
# In one terminal:
npm run dev                           # Next.js on :3000
# In another:
cloudflared tunnel --url http://localhost:3000
# Output includes: https://<random>.trycloudflare.com
```

Take the printed `https://<random>.trycloudflare.com` URL and paste it (with the right path suffix) into:
- Slash command request URL → `https://<random>.trycloudflare.com/api/slack/commands`
- Interactivity request URL → `https://<random>.trycloudflare.com/api/slack/interactivity`
- Event subscriptions request URL → `https://<random>.trycloudflare.com/api/slack/events`

The events page will run a "Verify" check and turn green when it gets back the `url_verification` challenge response — that's how you know your tunnel + signing secret are wired correctly.

**Alternative: ngrok.** Fine if you already have an account. `ngrok http 3000` gives you a `https://<…>.ngrok-free.app` URL with the same shape.

> Both options give you a *new* URL each time the tunnel restarts. You'll need to re-paste the three URLs into Slack's app config every time you restart the tunnel during development. For long-running dev, pin a domain (cloudflared with a Cloudflare account, or a paid ngrok plan).

---

## 10. Env var checklist

Required for any Slack functionality:

```bash
# Bot token from OAuth & Permissions, after Install to Workspace.
# Real tokens look like xoxb-<numeric>-<numeric>-<random>; paste yours here.
SLACK_BOT_TOKEN=xoxb-PASTE-YOUR-TOKEN-HERE

# Signing secret from Basic Information → App Credentials.
SLACK_SIGNING_SECRET=abcdef0123456789abcdef0123456789

# Channel ID for the public recognition post. Empty disables the channel post
# (DMs still fire). Format: starts with C, ~11 chars, NOT the # name.
SLACK_MADE_IT_HAPPEN_CHANNEL_ID=C08AABBCCDD

# Bearer secret for the SLA cron route at /api/cron/sla. Generate with:
#   openssl rand -base64 32
# Required only if you want SLA reminders / auto-deny to run.
CRON_SECRET=put-a-random-32-byte-string-here
```

Optional / not used today:

```bash
# Listed in .env.example but not referenced anywhere in code. Likely a
# placeholder for socket-mode or a future background worker. Safe to leave blank.
SLACK_APP_TOKEN=
```

---

## 11. Smoke test — verify end-to-end

After you've completed §1–§10, run through this checklist in order. Each step exercises a different surface; if one breaks, the failure is localized.

### A. Slash command + modal
1. In Slack, type `/recognize` in any channel. Hit enter.
2. The tiered nomination modal should pop up within 1–2 seconds.
   - **Pass:** modal opens with value picker, recipient picker, behavior + outcome fields.
   - **Fail (modal silently doesn't appear):** check `SLACK_BOT_TOKEN` is set, scopes are correct, app is installed.
   - **Fail (Slack shows "Sorry, …"):** check the dev server logs — likely the `views.open` request failed; the response will say why (most common: `invalid_auth` = token wrong, `missing_scope` = scope not granted).

### B. Authz gate
1. Sign in to Slack as a user whose Novo profile is **not** a manager. Run `/recognize`.
   - **Pass:** Slack shows an ephemeral message "Recognition with reward is initiated by managers…" — only you see it.
   - **Fail:** if the modal opens for a non-manager, the authz gate is broken.

### C. Submit a tiered nomination
1. As a manager, run `/recognize`, fill in the four fields, pick a teammate (NOT yourself, NOT your direct report — those have separate paths), submit.
2. Modal should clear.
3. Check the recipient's manager's Slack DMs — they should see a DM from `@Novo Rewards` with the nomination summary and three buttons (Approve, Propose upgrade, Review and decide).
   - **Fail (no DM arrives):** check that the recipient's manager has a Slack account whose email matches their Novo `email` field. The bot uses `users.lookupByEmail` to find them; if that fails, the DM silently drops.

### D. Approve via the DM button
1. As the approver, click **Approve** on the DM.
2. The DM should rewrite in place — buttons replaced with a confirmation, plus an "Undo" option for 10 minutes.
3. Within a few seconds, the **recipient** should get a DM saying they were recognized, with a "React to acknowledge" button.

### E. Acknowledge + channel post
1. As the recipient, click **React to acknowledge** on the recipient DM.
2. Within a couple seconds, `#made-it-happen` should get a public post celebrating the recognition.
   - **Fail (no post):** check `SLACK_MADE_IT_HAPPEN_CHANNEL_ID` is set AND the bot is invited to that channel.
3. If you don't click the ack button, the post fires automatically 24 hours after the recipient DM was sent.

### F. Reactions + thread replies
1. React to the channel post with any emoji.
2. Reply in the thread with a corroborating comment.
3. Both are silently recorded into the engagement store. There's no immediate user-visible feedback yet — the data feeds the (not-yet-built) monthly digest.

If A → E all pass, the integration is working.

---

## 12. Troubleshooting

### Slash command does nothing in Slack

| Symptom | Likely cause | Fix |
|---|---|---|
| Slack flashes "/recognize failed with the error 'dispatch_failed'" | Slack hit your URL but got non-200. | Check dev server logs. Most common: tunnel URL changed since you last pasted it into the slash command config. |
| Slack flashes "/recognize failed with the error 'operation_timeout'" | Your handler took >3 seconds. | Look for a slow downstream (DB query). The handler returns 200 immediately and runs Slack work after; if you're hitting this, something is awaiting in the wrong place. |
| Slack flashes "missing_scope" | The bot doesn't have `commands`. | Add it in OAuth & Permissions, reinstall the app, retry. |
| Modal doesn't appear, no error in Slack | `SLACK_BOT_TOKEN` not set in the running process. | Confirm `.env.local` has the token, restart `npm run dev`. After this PR, the dev server logs `[slack] SLACK_BOT_TOKEN not set — Slack integration disabled.` once on first call. |

### DMs aren't being delivered

| Symptom | Likely cause | Fix |
|---|---|---|
| Recipient never sees a DM | Recipient's Slack email ≠ Novo employee email. | The bot does `users.lookupByEmail`. If it returns no user, the DM silently drops. Either align the emails or, in dev, sign in to Slack as the matching email. |
| `users:read.email` scope missing | Bot can't look up users by email. | Add the scope, reinstall, retry. |
| `im:write` scope missing | Bot can't open DM channels. | Add the scope, reinstall, retry. |

### Channel post doesn't fire

| Symptom | Likely cause | Fix |
|---|---|---|
| Post never appears in `#made-it-happen` | Bot not invited to the channel. | `/invite @Novo Rewards` in the channel. |
| Post never fires AND env var is set | Recognition's recipient set `recognition_preference = 'private'` or `'team_only'`. | This is intentional — privacy gate per spec. Test with a public-pref recipient. |
| `SLACK_MADE_IT_HAPPEN_CHANNEL_ID` set but post doesn't fire | Channel ID is wrong (used the name, not the ID). | Channel ID starts with `C` and is ~11 characters. Channel name has `#`. |

### Inbound routes return 503

The route handlers return `503 Slack is not configured` when `SLACK_SIGNING_SECRET` is unset. This is intentional — without the secret, signature verification can't run, and accepting un-verified webhooks would be a security hole. Set the env var and restart.

### Inbound routes return 401

The route received a webhook but the signature didn't match. Either the request isn't from Slack, or `SLACK_SIGNING_SECRET` in your env doesn't match the one in **Basic Information → App Credentials**. Re-copy the secret from Slack's UI.

### Verify (smoke) commands

```bash
npm run typecheck                     # tsc clean
npm run smoke:authz                   # exercises the slash command path in a no-token environment
npm run verify:dashboards             # roles + sidebar render
npm run verify:all                    # all of the above
```

None of these require a real Slack workspace — they all run in mock mode.

---

## What's not covered

- **Multi-workspace OAuth install flow.** The single bot token assumes one workspace. To onboard multiple Novo customers, you'd need an `app/api/slack/install` endpoint, OAuth callback, per-workspace token storage, and per-workspace channel config. None of that is built today.
- **Monthly digest.** Reactions and thread replies feed an engagement store, but the digest reader/poster is not implemented. The data is captured; surfacing it is a planned feature.
- **SLA reminder DMs.** The 72-hour nudge and 7-day escalation paths fire, update DB flags, and record actions, but **don't currently send a DM to the approver**. Only 21-day auto-deny actually messages anyone (the nominator). If you need approver nudges before then, that's a small follow-up.
- **"Ask the nominator" button.** Mentioned in spec, not on the approver DM today. Not blocking — the "Review and decide" button kicks the approver to the web app where deny + clarification flows live.

For the recommended sequence to close these gaps, see the audit summary in conversation history.
