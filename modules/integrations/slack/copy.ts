// Single home for every user-facing string the Slack integration emits.
// Block builders, handlers, and notifications all import from here.
//
// Two shapes:
//   - Static strings:        export const X = '...'
//   - Templated strings:     export const X = (a: string) => `...`
//
// Internal-only strings (console.error tags, debug labels, action_id /
// block_id constants) intentionally stay in their original files —
// nothing in copy.ts is for plumbing.
//
// To find a string a Slack user is seeing, grep this file. To change
// what a Slack user sees, change it here. To verify nothing else still
// holds Slack copy, grep the slack/ subtree for double-quoted strings
// after edits — only imports from copy.ts should remain.

// ─── Approver DM (peer-initiated Tier 1 review) ─────────────────────

export const approverDMHeader = (
  nominator: string,
  nominee: string,
  value: string
): string =>
  `*New recognition nomination to review.*\n${nominator} recognized *${nominee}* for *${value}*.`

export const approverDMNarrative = (
  behavior: string,
  outcome: string
): string => `_"${behavior}"_\n\n_"${outcome}"_`

export const approverDMFallbackText = (nominee: string): string =>
  `New recognition nomination to review: ${nominee}`

export const buttonApprove = 'Approve'
export const buttonProposeUpgrade = 'Propose upgrade'
export const buttonReviewAndDecide = 'Review and decide'

// ─── Approved ephemeral (after approve click) ───────────────────────

export const approvedHeader = (nominee: string, value: string): string =>
  `Approved. *${nominee}* will be recognized for *${value}*.\n_Undo is available for 10 minutes._`

export const approvedFallbackText = (nominee: string): string =>
  `Approved. ${nominee} will be recognized.`

export const buttonUndo = 'Undo'

// ─── Approve button ephemeral errors ────────────────────────────────

export const approveErrorWrongStatus =
  'This nomination has already been acted on.'
export const approveErrorForbidden =
  "You aren't the approver for this nomination."
export const approveErrorReflectionRequired =
  'This is a self-approval. Please use the web form so you can choose a reflection type.'
export const approveErrorGeneric =
  "Couldn't approve right now. Try again in a minute."

// Posted when the in-place chat.update fails after a successful
// approve click. Signals success + nudges the user to refresh, since
// the original buttons stay visible.
export const approveStaleButtonsEphemeral = (nominee: string): string =>
  `Approved. ${nominee} will be recognized. The buttons above didn't refresh. Please refresh Slack to see the latest.`

// ─── Undo button ────────────────────────────────────────────────────

export const undoErrorWindowExpired =
  'The 10-minute undo window has passed. Reach out to the People team to reverse this.'
export const undoErrorForbidden = 'Only the approver can undo.'
export const undoErrorNothingToUndo =
  'There is nothing to undo on this nomination.'
export const undoErrorGeneric = "Couldn't undo. Try again in a minute."

export const undoneInPlaceText = 'Undone. Waiting for your decision.'
export const undoneInPlaceMrkdwn =
  "_Undone. The nomination is back in your queue; open it again when you're ready._"

// Same fallback pattern as approveStaleButtonsEphemeral.
export const undoneStaleButtonsEphemeral =
  "Undone. The nomination is back in your queue. The buttons above didn't refresh. Please refresh Slack to see the latest."

// ─── Slash command ──────────────────────────────────────────────────

export const slashCommandError =
  "We couldn't open the nomination form from Slack right now. Please try again in a minute, or recognize a teammate from your dashboard on the web."

// ─── Identity / actor lookup failures ───────────────────────────────

export const actorNotFound = "We couldn't find your record in our directory."
export const actorNotIdentified =
  "We couldn't identify you in Slack. Try again."

// ─── Nominator-side DMs ─────────────────────────────────────────────

export const nominatorSubmitConfirmation = (
  firstName: string,
  nominee: string
): string =>
  `Thank you, ${firstName}. Your nomination has been submitted. ${nominee} will be recognized if approved.`

export const nominatorApprovalDM = (
  firstName: string,
  nominee: string,
  value: string
): string =>
  `Thank you, ${firstName}. ${nominee} has been recognized for ${value}.`

export const nominatorDenialDM = (
  nominee: string,
  reason: string,
  approver: string
): string =>
  `Your nomination of ${nominee} was not approved. ${reason}\nIf you'd like to discuss or resubmit, talk with ${approver}.`

// ─── Urgent committee ping ──────────────────────────────────────────

export const urgentCommitteePing = (
  nominee: string,
  value: string
): string =>
  `Urgent Tier 3 recognition waiting for review: ${nominee} (${value}). Please review in the committee queue.`

// ─── Recipient DM (reward issued) ───────────────────────────────────

export const recipientDMHeader = (
  nominee: string,
  nominator: string,
  value: string,
  behavior: string
): string =>
  `${nominee}, you've been recognized.\n${nominator} saw you live *${value}*:\n_"${behavior}"_`

export const recipientDMReward = (
  rewardLine: string,
  deliveryLine: string
): string => `Your reward: ${rewardLine}.\n${deliveryLine}`

export const recipientDMFallbackText = (
  nominee: string,
  nominator: string,
  value: string
): string =>
  `${nominee}, you've been recognized. ${nominator} saw you live ${value}.`

export const recipientDMAcknowledgedFootnote =
  '_Acknowledged. Your recognition has been shared._'

export const buttonAcknowledgeRecognition = 'React to acknowledge'

// ─── Acknowledge button responses ───────────────────────────────────

export const ackUpdateText = 'Acknowledged. Your recognition has been shared.'
export const ackUpdateMrkdwn = '_Acknowledged. Your recognition has been shared._'
export const ackErrorNotRecipient =
  'Only the recognized teammate can acknowledge this.'
export const ackErrorNotApproved =
  "This recognition isn't ready to acknowledge yet."
export const ackErrorNotFound =
  "We couldn't find that recognition. Try again in a minute."

// ─── Reward delivery copy ───────────────────────────────────────────

export const deliveryTremendous = 'Details coming to your email shortly.'
export const deliveryJustworks =
  'Included in your next off-cycle paycheck.'
export const deliveryZoho = 'Included in your next Zoho payroll cycle.'
export const deliveryManual = 'The People team will reach out with details.'
export const deliveryFallback = 'Details coming soon.'

// ─── Peer recognition DM ────────────────────────────────────────────

export const peerRecognitionDM = (
  nominator: string,
  value: string,
  behaviorSummary: string
): string =>
  `${nominator} recognized you for ${value}: "${behaviorSummary}". See your dashboard for the full note.`

// ─── Upgrade modal ──────────────────────────────────────────────────

export const upgradeModalTitle = 'Propose upgrade'
export const upgradeModalSubmit = 'Send for review'
export const upgradeModalCancel = 'Cancel'
export const upgradeModalTierLabel = 'Upgrade to'
export const upgradeModalTierTier2 = 'Tier 2 · Impact'
export const upgradeModalTierTier3 = 'Tier 3 · Value Share'
export const upgradeModalReasonLabel =
  'Why does this warrant the upgrade?'
export const upgradeModalReasonHint =
  'A couple of sentences is plenty.'
export const upgradeModalUrgentLabel = 'Urgent'
export const upgradeModalUrgentHint =
  'Only for Tier 3. Pings Flora and Rares for an async decision.'
export const upgradeModalUrgentCheckbox = 'This is time-sensitive'

// ─── Upgrade error responses ────────────────────────────────────────

export const upgradeErrorNoDeptHead =
  "We couldn't find a department head for the nominee. Reach out to the People team."
export const upgradeErrorNoPeopleTeamRep =
  'No People team rep is currently available to review. Reach out to the People team.'
export const upgradeErrorReasoningRequired =
  'A short reasoning note is required.'
export const upgradeErrorForbidden =
  "You aren't authorized to propose an upgrade."
export const upgradeErrorTierRequired = 'Choose a target tier.'
export const upgradeErrorActorNotFound = "We couldn't find your record."
export const upgradeErrorGeneric =
  "We couldn't send this nomination for review. Please try again. If this keeps happening, reach out to the People team."

// ─── Nomination modal errors ────────────────────────────────────────

export const nominationModalErrorSelfNomination =
  "You can't recognize yourself."
export const nominationModalErrorNomineeNotFound =
  "That teammate isn't in our directory."
export const nominationModalErrorValueNotFound =
  'Please choose one of the four values.'
export const nominationModalErrorValidation =
  'Behavior and outcome each need at least 30 characters and at most 500. Please adjust and resubmit.'
export const nominationModalErrorGeneric =
  "We couldn't submit your nomination. Please try again. If this keeps happening, reach out to the People team."
export const nominationModalErrorMissingTeammate =
  "We couldn't find that teammate in our directory."

// ─── Review-and-decide ephemeral ────────────────────────────────────

export const reviewAndDecideEphemeral = (url: string): string =>
  `Opening in the review queue: ${url}`

// ─── Value name fallback ────────────────────────────────────────────

// Used when getValueById returns null (stale value_id, mid-flight
// schema changes). Renders inline inside other strings rather than
// failing or printing "undefined".
export const valueNameFallback = 'a Novo value'

// ─── Nomination modal (the /recognize four-field form) ──────────────

export const nominationModalTitle = 'Recognize a teammate'
export const nominationModalSubmit = 'Submit'
export const nominationModalCancel = 'Cancel'
export const nominationModalNomineeLabel = 'Who are you recognizing?'
export const nominationModalNomineePlaceholder = 'Pick a teammate'
export const nominationModalValueLabel = 'Which value did they live?'
export const nominationModalValuePlaceholder = 'Choose one'
export const nominationModalBehaviorLabel = 'What specifically did they do?'
export const nominationModalBehaviorHint = '30 to 500 characters.'
export const nominationModalBehaviorDefaultPlaceholder =
  'What did they do? Be specific.'
export const nominationModalOutcomeLabel = 'What was the outcome?'
export const nominationModalOutcomeHint =
  'What happened as a result? Why did it matter?'
export const nominationModalEvidenceLabel = (n: number): string =>
  `Evidence link ${n} (optional)`
