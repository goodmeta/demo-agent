/**
 * Demo Agent — x402 payments with cross-service budget enforcement
 *
 * A research agent that:
 *   1. Creates a budget on agent-verifier ($1.00)
 *   2. Searches Exa via x402 ($0.007/search)
 *   3. Budget enforcement checks before each payment
 *   4. Stops gracefully when budget is exhausted
 *
 * This is Phase 0C of the coalition deployment plan —
 * proving the infrastructure works end-to-end.
 *
 * Usage:
 *   cp .env.example .env  # fill in keys
 *   npm run agent
 */

import "dotenv/config"
import { X402Client } from "./x402.js"
import { BudgetClient } from "./budget.js"
import type { Hex } from "viem"

// Config from env
const AGENT_PRIVATE_KEY = process.env.AGENT_PRIVATE_KEY as Hex
const VERIFIER_URL = process.env.VERIFIER_URL ?? "https://verifier.goodmeta.co"
const VERIFIER_API_KEY = process.env.VERIFIER_API_KEY ?? ""
// FACILITATOR_URL not needed — x402 SDK handles facilitator selection

// Budget: $1.00 for this demo run (100 cents = ~142 Exa searches)
const BUDGET_CENTS = 100
const AGENT_ID = "demo-agent-001"

// Research queries
const QUERIES = [
  "x402 protocol agent payments 2026",
  "cross-protocol budget enforcement AI agents",
  "agentic commerce infrastructure stablecoins",
  "machine payments protocol MPP Tempo",
  "AP2 Google agent mandate verification",
]

interface SearchResult {
  query: string
  results: Array<{ url: string; title: string; score: number }>
  amountPaid: number
  holdId: string
}

async function main() {
  if (!AGENT_PRIVATE_KEY) {
    console.error("Missing AGENT_PRIVATE_KEY in env")
    process.exit(1)
  }
  if (!VERIFIER_API_KEY) {
    console.error("Missing VERIFIER_API_KEY in env")
    process.exit(1)
  }

  const x402 = new X402Client(AGENT_PRIVATE_KEY)
  const budget = new BudgetClient(VERIFIER_URL, VERIFIER_API_KEY, "")

  console.log("═".repeat(60))
  console.log("DEMO AGENT — x402 + Budget Enforcement")
  console.log("═".repeat(60))
  console.log(`Agent wallet: ${x402.address}`)
  console.log(`Verifier:     ${VERIFIER_URL}`)
  console.log(`Budget:       $${(BUDGET_CENTS / 100).toFixed(2)} USD`)
  console.log(`Queries:      ${QUERIES.length}`)
  console.log()

  // Step 1: Create a budget
  console.log("Step 1: Creating budget on agent-verifier...")
  const validUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  let budgetId: string
  try {
    budgetId = await budget.createBudget({
      agentId: AGENT_ID,
      budgetTotalCents: BUDGET_CENTS,
      currency: "usd",
      validUntil,
      maxPerTransaction: 1000, // $10 max per tx
    })
    console.log(`  Budget created: ${budgetId}`)
    console.log(`  Valid until: ${validUntil}`)
  } catch (err) {
    console.error("  Failed to create budget:", err)
    process.exit(1)
  }

  // Update budget client with the new budget ID
  const budgetEnforced = new BudgetClient(VERIFIER_URL, VERIFIER_API_KEY, budgetId)

  // Step 2: Run searches with budget enforcement
  console.log("\nStep 2: Running searches (Exa via x402)...\n")

  const results: SearchResult[] = []
  let totalSpent = 0
  let searchCount = 0
  let deniedCount = 0

  for (const query of QUERIES) {
    console.log(`─── Query ${searchCount + 1}: "${query}" ───`)

    // Budget check BEFORE payment
    const EXA_PRICE_CENTS = 1 // $0.007 rounds to ~1 cent for budget tracking
    const check = await budgetEnforced.check(EXA_PRICE_CENTS, "exa.ai")

    if (!check.approved) {
      console.log(`  DENIED: ${check.reason}`)
      console.log(`  Budget exhausted — stopping gracefully.`)
      deniedCount++
      break
    }

    console.log(`  Budget check: approved (hold: ${check.holdId?.slice(0, 12)}...)`)

    // x402 payment to Exa
    try {
      const payment = await x402.paidRequest("https://api.exa.ai/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          numResults: 3,
          type: "auto",
        }),
      })

      if (payment.status === 200) {
        const data = JSON.parse(payment.body)
        const searchResults = (data.results ?? []).map(
          (r: { url: string; title: string; score: number }) => ({
            url: r.url,
            title: r.title,
            score: r.score,
          })
        )

        // Settle the hold (payment succeeded)
        await budgetEnforced.settle(check.holdId!, true)

        totalSpent += payment.amountPaid
        searchCount++

        results.push({
          query,
          results: searchResults,
          amountPaid: payment.amountPaid,
          holdId: check.holdId!,
        })

        console.log(`  Exa: ${searchResults.length} results, paid ${payment.amountPaid} USDC units`)
        console.log(`  Settled: hold confirmed`)
        for (const r of searchResults.slice(0, 2)) {
          console.log(`    → ${r.title?.slice(0, 60) ?? r.url}`)
        }
      } else {
        // Payment failed — release hold
        await budgetEnforced.settle(check.holdId!, false)
        console.log(`  Exa failed: HTTP ${payment.status}`)
        console.log(`  Hold released (budget restored)`)
      }
    } catch (err) {
      // Error — release hold
      await budgetEnforced.settle(check.holdId!, false)
      console.log(`  Error: ${err}`)
      console.log(`  Hold released (budget restored)`)
    }

    console.log()
  }

  // Summary
  console.log("═".repeat(60))
  console.log("SUMMARY")
  console.log("═".repeat(60))
  console.log(`Searches completed: ${searchCount}`)
  console.log(`Budget denials:     ${deniedCount}`)
  console.log(`Total x402 spent:   ${totalSpent} USDC units ($${(totalSpent / 1e6).toFixed(4)})`)
  console.log(`Budget used:        ${searchCount} cents of ${BUDGET_CENTS} cents`)
  console.log(`Budget ID:          ${budgetId}`)
  console.log()

  // Log structured output for the deployment report
  const report = {
    timestamp: new Date().toISOString(),
    agentId: AGENT_ID,
    budgetId,
    budgetCents: BUDGET_CENTS,
    searchesCompleted: searchCount,
    budgetDenials: deniedCount,
    totalX402Spent: totalSpent,
    services: ["exa.ai"],
    results,
  }

  console.log("─── Structured Log ───")
  console.log(JSON.stringify(report, null, 2))
}

main().catch((err) => {
  console.error("Agent failed:", err)
  process.exit(1)
})
