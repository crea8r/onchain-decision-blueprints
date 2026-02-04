# On-chain Decision Blueprints for AI Agents (Wed)

A Solana program + client SDK that encodes **decision workflows** for autonomous agents.

Core idea: before an agent can execute some high-stakes action (e.g., move funds, call a CPI, update configuration), the action must pass an on-chain workflow:

1. **Propose** an action (payload + metadata)
2. **Approve** by required roles / threshold
3. **Execute** only if policy satisfied

This provides a verifiable, replayable audit trail and prevents "agent went rogue" failures.

## MVP scope (Hackathon)

- Solana program storing:
  - Blueprint (policy): owners/roles, approval threshold, allowed action types
  - Proposals: payload hash, approvals bitmap/set, status
- Instructions:
  - `InitializeBlueprint`
  - `ProposeAction`
  - `ApproveAction`
  - `ExecuteAction` (for MVP: emits event + marks executed; later: can gate CPI)
- Client SDK (TypeScript): helpers to create proposals, approve, execute, read state.

## Interactive demo (Netlify)

See `demo-web/` for a static interactive demo site you can deploy to Netlify.

## Status

MVP scaffold + demo UI in progress.
