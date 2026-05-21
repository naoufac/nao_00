// Solana payment verification — used by /pricing to gate /council premium.
//
// Polls public Solana RPC for inbound SPL-token transfers to our tip-jar
// wallet. No API keys, no OAuth. Matches a payment to a user by the
// transaction memo (a short UUID-ish reference the user includes when they
// send the payment).
//
// USDC mint: EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v (mainnet)
// Tip-jar wallet: env.SOL_TIP_ADDRESS

const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
// Helius / public Solana RPCs. Free endpoints rotate; fall through to the
// next on failure.
const RPC_ENDPOINTS = [
  'https://api.mainnet-beta.solana.com',
  'https://solana-rpc.publicnode.com',
  'https://solana.api.minepi.com',
]

export interface PaymentMatch {
  signature: string
  amount_usdc: number
  payer: string
  memo: string | null
  block_time: number | null
}

async function rpcCall(method: string, params: any[]): Promise<any> {
  let lastErr: any = null
  for (const endpoint of RPC_ENDPOINTS) {
    try {
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      })
      if (!r.ok) { lastErr = `${endpoint}:${r.status}`; continue }
      const data: any = await r.json()
      if (data.error) { lastErr = `${endpoint}:${data.error?.message}`; continue }
      return data.result
    } catch (err: any) { lastErr = `${endpoint}:${err?.message ?? err}` }
  }
  throw new Error(`all_rpcs_failed:${lastErr}`)
}

// List recent USDC transfers received by our address. Solana RPC returns
// transactions by signature; we then fetch tx details to find the SPL
// transfer + memo.
export async function recentPayments(address: string, limit = 25): Promise<PaymentMatch[]> {
  // Step 1: enumerate the USDC associated token account (ATA) for our address.
  // Solana SPL tokens live in associated token accounts owned by the wallet.
  const tokenAccountsResult = await rpcCall('getTokenAccountsByOwner', [
    address,
    { mint: USDC_MINT },
    { encoding: 'jsonParsed' },
  ])
  const tokenAccounts: any[] = tokenAccountsResult?.value || []
  if (tokenAccounts.length === 0) return []

  const ataAddress = tokenAccounts[0].pubkey
  // Step 2: list signatures referencing the ATA.
  const sigs: any[] = await rpcCall('getSignaturesForAddress', [
    ataAddress,
    { limit },
  ]) || []
  if (sigs.length === 0) return []

  const matches: PaymentMatch[] = []
  for (const s of sigs) {
    try {
      const tx: any = await rpcCall('getTransaction', [
        s.signature,
        { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 },
      ])
      if (!tx) continue
      const meta = tx.meta
      const txData = tx.transaction
      if (!meta || !txData) continue
      // Pull memo if present (memo program: MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr)
      let memo: string | null = null
      const instructions = txData.message?.instructions || []
      for (const ix of instructions) {
        if (ix.program === 'spl-memo' || ix.programId === 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr') {
          memo = ix.parsed || (typeof ix.data === 'string' ? ix.data : null)
        }
      }
      // Calculate net USDC delta for our ATA.
      const preTokenBalances = meta.preTokenBalances || []
      const postTokenBalances = meta.postTokenBalances || []
      let amountIn = 0
      let payer = txData.message?.accountKeys?.[0]?.pubkey || txData.message?.accountKeys?.[0] || ''
      for (const post of postTokenBalances) {
        if (post.mint !== USDC_MINT) continue
        if (post.owner !== address) continue
        const pre = preTokenBalances.find((p: any) => p.accountIndex === post.accountIndex)
        const preAmt = Number(pre?.uiTokenAmount?.uiAmountString ?? pre?.uiTokenAmount?.uiAmount ?? 0)
        const postAmt = Number(post.uiTokenAmount?.uiAmountString ?? post.uiTokenAmount?.uiAmount ?? 0)
        const delta = postAmt - preAmt
        if (delta > 0) amountIn = delta
      }
      if (amountIn > 0) {
        matches.push({
          signature: s.signature,
          amount_usdc: amountIn,
          payer: typeof payer === 'string' ? payer : String(payer),
          memo,
          block_time: s.blockTime || meta.blockTime || null,
        })
      }
    } catch { /* skip this signature on parse error */ }
  }
  return matches
}

// Check if a memo (paid-token reference) has been paid for at minimum X USDC
// within the last N seconds.
export async function isMemoPaid(
  address: string,
  memo: string,
  minAmountUsdc: number,
  withinSeconds: number = 60 * 60 * 24 * 30, // 30 days
): Promise<{ paid: boolean; matched?: PaymentMatch }> {
  const matches = await recentPayments(address, 50)
  const cutoff = Math.floor(Date.now() / 1000) - withinSeconds
  for (const m of matches) {
    if (m.memo && m.memo.includes(memo) && m.amount_usdc >= minAmountUsdc && (m.block_time === null || m.block_time >= cutoff)) {
      return { paid: true, matched: m }
    }
  }
  return { paid: false }
}
