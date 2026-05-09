import { extractSkill } from './extractor'
import { maybeRunSelfEval } from './eval'
import type { CouncilResult } from '../council/pipeline'

export async function autoImprove(
  input: string,
  result: CouncilResult,
  env: any,
  kv: KVNamespace,
  db: D1Database
): Promise<void> {
  // Cache hits already short-circuited the council; no skill to extract from a cache hit
  if (result.council_steps.length === 1 && result.council_steps[0].advisor === 'cache') return
  try {
    await extractSkill(input, result, kv, db)
  } catch (err) {
    console.error('extractSkill error', err)
  }
  try {
    await maybeRunSelfEval(env, kv, db)
  } catch (err) {
    console.error('maybeRunSelfEval error', err)
  }
}

export { extractSkill, maybeRunSelfEval }
