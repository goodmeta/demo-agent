/**
 * x402 Payment Client — using official @x402/core + @x402/evm SDK
 */

import { x402Client, x402HTTPClient } from "@x402/core/client"
import { ExactEvmScheme, toClientEvmSigner } from "@x402/evm"
import { type Hex } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { createWalletClient, createPublicClient, http } from "viem"
import { base } from "viem/chains"

export interface X402PaymentResult {
  status: number
  body: string
  amountPaid: number
}

export class X402Client {
  private httpClient: x402HTTPClient
  private _address: string

  constructor(privateKey: Hex) {
    const account = privateKeyToAccount(privateKey)
    this._address = account.address

    const publicClient = createPublicClient({ chain: base, transport: http() })
    const signer = toClientEvmSigner(account as any, publicClient as any)
    const scheme = new ExactEvmScheme(signer)

    const client = new x402Client()
    client.register("eip155:8453", scheme)

    this.httpClient = new x402HTTPClient(client)
  }

  get address(): string {
    return this._address
  }

  async paidRequest(
    url: string,
    options: RequestInit = {}
  ): Promise<X402PaymentResult> {
    // Step 1: Initial request
    const initialRes = await fetch(url, options)

    if (initialRes.status !== 402) {
      return {
        status: initialRes.status,
        body: await initialRes.text(),
        amountPaid: 0,
      }
    }

    // Step 2: Parse payment requirements from 402 response
    const paymentRequired = this.httpClient.getPaymentRequiredResponse(
      (name) => initialRes.headers.get(name),
      await initialRes.clone().json().catch(() => undefined)
    )

    // Step 3: Create payment payload and sign
    const paymentPayload = await this.httpClient.createPaymentPayload(paymentRequired)
    const paymentHeaders = this.httpClient.encodePaymentSignatureHeader(paymentPayload)

    // Step 4: Retry with payment
    const paidRes = await fetch(url, {
      ...options,
      headers: { ...(options.headers ?? {}), ...paymentHeaders },
    })

    const amountPaid = paidRes.status === 200
      ? parseInt(paymentRequired.accepts?.[0]?.amount ?? "0", 10)
      : 0

    return {
      status: paidRes.status,
      body: await paidRes.text(),
      amountPaid,
    }
  }
}
