# Repository agent guidance

For work on the business manager, start by reading business-manager/AGENTS.md, business-manager/HANDOFF.md and business-manager/TASKS.md. Update the handoff and tasks with each relevant change and commit/push so other devices have the latest state.

Keep storefront/admin work separate. The existing main push workflow deploys the store and admin: do not merge manager-only branches without checking deployment effects. Manager source in business-manager/manager is a copy of an existing Sites project; its runtime secrets and database are not in this repository.
