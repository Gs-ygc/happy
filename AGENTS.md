# Agent Workflow

## Sync To Main

When the user says `sync to main` or `synt to main`, they mean:

1. Fetch `origin/main`.
2. Rebase the current branch on `origin/main`.
3. Push the current HEAD directly to `main` with a normal push, for example:
   `git push origin HEAD:main`

Do not force push for this workflow.

## User Action Notifications

When progress requires the user to provide additional material, make a decision,
or review work, send a Happy notification before requesting the action in chat:

`happy notify -t "<short task context>" -p "<specific action needed>"`

Keep the title concise and make the message state exactly what the user needs to
provide or review. Do not send notifications for routine progress updates or when
the work can continue without user input.
