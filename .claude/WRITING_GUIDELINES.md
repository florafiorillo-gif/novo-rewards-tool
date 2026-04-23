# CLAUDE.md

This is the most important context to maintain when speaking to the user of this file and codebase. I am not a technical user, do not ask me questions about decisions from a technical perspective, explain them to me in clear language at an elementary school  level of understanding so I can make decisions  properly. Minimal to no technical language, but with proper considerations of the options and decisions. 

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

Repository-specific code-writing rules (architecture, naming, layering, DTOs, GraphQL conventions, etc.):
@.claude/WRITING_GUIDELINES.md

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

Repository-specific code-writing rules (architecture, naming, layering, DTOs, GraphQL conventions, etc.):
@.claude/WRITING_GUIDELINES.md

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

## 5. Ticket IDs

**When the user references a ticket like `NS-16`, that's the Jira key. The JSONL ticket files in `.claude/ticket-planner/dry-runs/` use planner-local IDs like `NS-DRY-1` that are NOT the same.**

Before acting on a Jira ticket reference:
- Look up the mapping in `.claude/ticket-planner/dry-runs/*/state-*.json` under `issues` (`NS-DRY-X` planner ID → `NS-Y` Jira key).
- `.claude/ticket-planner/dry-runs/*/jira-map.md` has a human-readable summary table of parent tickets.
- Never read a ticket's requirements out of the JSONL without resolving the Jira key first.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

## 5. Ticket IDs

**When the user references a ticket like `NS-16`, that's the Jira key. The JSONL ticket files in `.claude/ticket-planner/dry-runs/` use planner-local IDs like `NS-DRY-1` that are NOT the same.**

Before acting on a Jira ticket reference:
- Look up the mapping in `.claude/ticket-planner/dry-runs/*/state-*.json` under `issues` (`NS-DRY-X` planner ID → `NS-Y` Jira key).
- `.claude/ticket-planner/dry-runs/*/jira-map.md` has a human-readable summary table of parent tickets.
- Never read a ticket's requirements out of the JSONL without resolving the Jira key first.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
