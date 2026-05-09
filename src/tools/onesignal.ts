// OneSignal push notification — "council screams to phone" channel.
// Throttled to ≤5 pushes per day via KV counter.
//
// Uses OneSignal REST API v1 (POST /notifications).
// Requires ONESIGNAL_APP_ID + ONESIGNAL_API_KEY as wrangler secrets.

const MAX_DAILY_PUSHES = 5
const THROTTLE_KEY = "onesignal:daily_count"

export interface PushResult {
  ok: boolean
  id?: string
  error?: string
  throttled?: boolean
  daily_count?: number
}

export async function sendPush(
  env: any,
  kv: KVNamespace,
  title: string,
  body: string,
  url?: string,
): Promise<PushResult> {
  const appId = env.ONESIGNAL_APP_ID
  const apiKey = env.ONESIGNAL_API_KEY
  if (!appId || !apiKey) {
    return { ok: false, error: "ONESIGNAL_APP_ID or ONESIGNAL_API_KEY not set" }
  }

  // Throttle: check daily counter
  const today = new Date().toISOString().slice(0, 10)
  const countKey = `${THROTTLE_KEY}:${today}`
  const current = parseInt(await kv.get(countKey) || "0", 10)
  if (current >= MAX_DAILY_PUSHES) {
    return { ok: false, throttled: true, daily_count: current, error: `throttled: ${current}/${MAX_DAILY_PUSHES} today` }
  }

  try {
    const r = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${apiKey}`,
      },
      body: JSON.stringify({
        app_id: appId,
        included_segments: ["Subscribed Users"],
        headings: { en: title.slice(0, 100) },
        contents: { en: body.slice(0, 500) },
        ...(url ? { url } : {}),
        // Priority high for immediate delivery
        priority: 10,
      }),
    })

    const data: any = await r.json()
    if (data.id) {
      // Increment daily counter (TTL 26h to auto-expire)
      await kv.put(countKey, String(current + 1), { expirationTtl: 93600 })
      return { ok: true, id: data.id, daily_count: current + 1 }
    }
    return { ok: false, error: JSON.stringify(data.errors || data).slice(0, 300) }
  } catch (err: any) {
    return { ok: false, error: String(err?.message ?? err).slice(0, 300) }
  }
}

// Convenience: send alert-level push (deploy failure, goal done, pillar drop)
export async function pushAlert(
  env: any,
  kv: KVNamespace,
  event: "deploy_failure" | "goal_complete" | "pillar_drop" | "incident",
  detail: string,
): Promise<PushResult> {
  const titles: Record<string, string> = {
    deploy_failure: "Deploy Failed",
    goal_complete: "Goal Complete",
    pillar_drop: "Pillar Alert",
    incident: "Incident",
  }
  return sendPush(env, kv, titles[event] || event, detail, "https://nao00.nchobah.com/continuity")
}
