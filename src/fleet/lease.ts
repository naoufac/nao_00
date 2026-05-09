// Fleet Lease Rotation — KV-based lease system.
// POST /fleet/lease {host, role} -> atomic KV lease with 5-min TTL.
// GET /fleet/leases -> current lease holders.
// Roles: builder, validator, continuity.

export interface LeaseRequest {
  host: string
  role: string
}

export interface LeaseResult {
  granted: boolean
  role: string
  host: string
  holder?: string
  expires_at?: number
  lease_key?: string
}

export interface LeaseInfo {
  role: string
  host: string
  acquired_at: number
  expires_at: number
  goal_id?: string
  step_idx?: number
}

const LEASE_TTL_SEC = 300
const LEASE_PREFIX = "fleet:lease:"

export async function tryAcquireLease(
  kv: KVNamespace,
  req: LeaseRequest,
): Promise<LeaseResult> {
  const key = `${LEASE_PREFIX}${req.role}`
  const existing = await kv.get(key)

  if (existing) {
    try {
      const lease: LeaseInfo = JSON.parse(existing)
      if (lease.expires_at > Date.now()) {
        if (lease.host === req.host) {
          const extended: LeaseInfo = {
            ...lease,
            expires_at: Date.now() + LEASE_TTL_SEC * 1000,
          }
          await kv.put(key, JSON.stringify(extended), { expirationTtl: LEASE_TTL_SEC })
          return { granted: true, role: req.role, host: req.host, expires_at: extended.expires_at, lease_key: key }
        }
        return { granted: false, role: req.role, host: req.host, holder: lease.host, expires_at: lease.expires_at }
      }
    } catch {
      // Corrupted lease — overwrite
    }
  }

  const lease: LeaseInfo = {
    role: req.role,
    host: req.host,
    acquired_at: Date.now(),
    expires_at: Date.now() + LEASE_TTL_SEC * 1000,
  }
  await kv.put(key, JSON.stringify(lease), { expirationTtl: LEASE_TTL_SEC })
  return { granted: true, role: req.role, host: req.host, expires_at: lease.expires_at, lease_key: key }
}

export async function releaseLease(
  kv: KVNamespace,
  role: string,
  host: string,
): Promise<boolean> {
  const key = `${LEASE_PREFIX}${role}`
  const existing = await kv.get(key)
  if (!existing) return true
  try {
    const lease: LeaseInfo = JSON.parse(existing)
    if (lease.host !== host) return false
    await kv.delete(key)
    return true
  } catch {
    await kv.delete(key)
    return true
  }
}

export async function listLeases(kv: KVNamespace): Promise<LeaseInfo[]> {
  const roles = ["builder", "validator", "continuity"]
  const leases: LeaseInfo[] = []
  const results = await Promise.all(roles.map(r => kv.get(`${LEASE_PREFIX}${r}`)))
  results.forEach((raw, i) => {
    if (raw) {
      try {
        const lease: LeaseInfo = JSON.parse(raw)
        if (lease.expires_at > Date.now()) leases.push(lease)
      } catch {}
    }
  })
  return leases
}

export async function updateLeaseGoal(
  kv: KVNamespace,
  role: string,
  host: string,
  goalId: string,
  stepIdx: number,
): Promise<boolean> {
  const key = `${LEASE_PREFIX}${role}`
  const raw = await kv.get(key)
  if (!raw) return false
  try {
    const lease: LeaseInfo = JSON.parse(raw)
    if (lease.host !== host) return false
    lease.goal_id = goalId
    lease.step_idx = stepIdx
    lease.expires_at = Date.now() + LEASE_TTL_SEC * 1000
    await kv.put(key, JSON.stringify(lease), { expirationTtl: LEASE_TTL_SEC })
    return true
  } catch {
    return false
  }
}

export async function checkSplitBrain(kv: KVNamespace): Promise<{
  conflicts: { role: string; holders: string[] }[]
  healthy: boolean
}> {
  const roles = ["builder", "validator", "continuity"]
  const conflicts: { role: string; holders: string[] }[] = []
  const results = await Promise.all(roles.map(r => kv.get(`${LEASE_PREFIX}${r}`)))
  results.forEach((raw, i) => {
    if (raw) {
      try {
        const lease: LeaseInfo = JSON.parse(raw)
        if (lease.expires_at < Date.now()) {
          kv.delete(`${LEASE_PREFIX}${roles[i]}`)
        }
      } catch {}
    }
  })
  return { conflicts, healthy: conflicts.length === 0 }
}
