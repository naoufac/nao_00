// Manus managed agent — calls Manus API for complex multi-step tasks.

export interface ManusResult {
  ok: boolean
  task_id?: string
  status?: string
  result?: string
  error?: string
}

export async function runManusTask(
  apiKey: string,
  task: string,
): Promise<ManusResult> {
  if (!apiKey) return { ok: false, error: "MANUS_API_KEY not set" }

  try {
    const r = await fetch("https://api.manus.im/v1/tasks", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ prompt: task.slice(0, 5000) }),
    })
    const data: any = await r.json()
    if (data.task_id) {
      return {
        ok: true,
        task_id: data.task_id,
        status: data.status || "pending",
        result: `manus_task_created:${data.task_id}`,
      }
    }
    return { ok: false, error: JSON.stringify(data).slice(0, 300) }
  } catch (err: any) {
    return { ok: false, error: String(err?.message ?? err).slice(0, 300) }
  }
}
