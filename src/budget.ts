/**
 * Budget enforcement via agent-verifier.
 *
 * Wraps x402 payments with budget checks:
 *   1. Before paying: POST /v1/check → hold placed
 *   2. After paying: POST /v1/settle → hold confirmed or released
 *
 * If the budget is exhausted, the check returns approved=false
 * and the payment is not attempted.
 */

export interface BudgetCheckResult {
  approved: boolean
  holdId?: string
  reason?: string
  remainingCents?: number
}

export class BudgetClient {
  private verifierUrl: string
  private apiKey: string
  private budgetId: string

  constructor(verifierUrl: string, apiKey: string, budgetId: string) {
    this.verifierUrl = verifierUrl.replace(/\/$/, "")
    this.apiKey = apiKey
    this.budgetId = budgetId
  }

  private headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
    }
  }

  /**
   * Check budget and place a hold before making a payment.
   */
  async check(amountCents: number, vendor: string): Promise<BudgetCheckResult> {
    const res = await fetch(`${this.verifierUrl}/v1/check`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        budget_id: this.budgetId,
        amount_cents: amountCents,
        vendor,
        idempotency_key: crypto.randomUUID().replace(/-/g, ""),
      }),
    })

    const data = await res.json() as Record<string, unknown>

    if (res.status === 200 && data.approved) {
      return {
        approved: true,
        holdId: data.hold_id as string,
        remainingCents: data.remaining_cents as number | undefined,
      }
    }

    return {
      approved: false,
      reason: (data.reason as string) ?? (data.error as string) ?? "Budget check failed",
    }
  }

  /**
   * Settle a hold after payment succeeds or fails.
   */
  async settle(holdId: string, success: boolean): Promise<void> {
    await fetch(`${this.verifierUrl}/v1/settle`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        hold_id: holdId,
        success,
      }),
    })
  }

  /**
   * Create a new budget on the verifier.
   */
  async createBudget(options: {
    agentId: string
    budgetTotalCents: number
    currency?: string
    validUntil: string
    maxPerTransaction?: number
  }): Promise<string> {
    const res = await fetch(`${this.verifierUrl}/v1/budgets`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        agentId: options.agentId,
        budgetTotal: options.budgetTotalCents,
        currency: options.currency ?? "usd",
        validUntil: options.validUntil,
        constraints: options.maxPerTransaction
          ? { maxAmount: options.maxPerTransaction.toString(), currency: options.currency ?? "usd" }
          : undefined,
      }),
    })

    const data = await res.json() as Record<string, unknown>
    if (!data.id) {
      throw new Error(`Failed to create budget: ${JSON.stringify(data)}`)
    }

    return data.id as string
  }
}
