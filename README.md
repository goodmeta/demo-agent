# Demo Agent

Research agent demonstrating the [Budget Authority Protocol](https://github.com/goodmeta/agent-payments-landscape/blob/main/specs/budget-authority-protocol.md) — real x402 payments with cross-service budget enforcement.

Makes real USDC payments on Base mainnet to [Exa](https://exa.ai) (AI search), with budget tracking and hold/settle via [agent-verifier](https://github.com/goodmeta/agent-verifier).

## What it does

1. Creates a spending budget on agent-verifier (configurable via `BUDGET_CENTS` env var, default $1.00)
2. For each search query:
   - Checks budget (hold placed before payment)
   - Pays Exa via x402 ($0.007/search, USDC on Base)
   - Settles hold after payment succeeds or releases on failure
3. Stops gracefully when budget is exhausted

```
Agent wallet (USDC on Base)
  │
  ├── Budget check ──→ agent-verifier (hold placed)
  │
  ├── x402 payment ──→ Exa search API
  │
  └── Settle ────────→ agent-verifier (hold confirmed)
```

## Run it

```bash
npm install
cp .env.example .env  # fill in keys
npm run agent
```

## Example: $1.00 budget (5 searches succeed)

```
BUDGET_CENTS=100 npm run agent

─── Query 1: "x402 protocol agent payments 2026" ───
  Budget check: approved (hold: ver_b4178512...)
  Exa: 3 results, paid 7000 USDC units
  Settled: hold confirmed
    → x402 - Payment Required | Internet-Native Payments Standard

Searches completed: 5
Budget denials:     0
Total x402 spent:   35000 USDC units ($0.0350)
```

## Example: $0.01 budget (agent stopped at limit)

```
BUDGET_CENTS=1 npm run agent

─── Query 1: "x402 protocol agent payments 2026" ───
  Budget check: approved (hold: ver_f7e0896a...)
  Exa: 3 results, paid 7000 USDC units
  Settled: hold confirmed

─── Query 2: "cross-protocol budget enforcement AI agents" ───
  DENIED: BUDGET_EXCEEDED
  Budget exhausted — stopping gracefully.

Searches completed: 1
Budget denials:     1
Total x402 spent:   7000 USDC units ($0.0070)
```

Without agent-verifier, the agent would spend until the wallet is empty. With it, the agent stops at the budget limit.

## Why this exists

Five protocols let AI agents spend money autonomously (AP2, ACP, x402, MPP, UCP). None of them track what the agent spent across services. An agent calling Exa + Firecrawl + Nansen via x402 can overspend because each service approves independently.

This agent demonstrates the fix: a budget enforcement layer (agent-verifier) that sits between the agent and the services, tracking total spend and enforcing limits.

## Related

- [agent-verifier](https://github.com/goodmeta/agent-verifier) — budget enforcement library (npm)
- [ap2-example](https://github.com/goodmeta/ap2-example) — AP2 mandate verification
- [acp-example](https://github.com/goodmeta/acp-example) — ACP checkout + Allowance
- [x402-example](https://github.com/goodmeta/x402-example) — x402 pay-per-request
- [mpp-example](https://github.com/goodmeta/mpp-example) — MPP charge intent
- [ucp-example](https://github.com/goodmeta/ucp-example) — UCP checkout via MCP
