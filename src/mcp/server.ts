// nao_00 as an MCP server.
// Naoufal's ask: "I'm opening a worker like you in the laptop and he is hosted
// elsewhere. Check local I can open in claude web browser and see light way better
// seems few lines of code. we talked and talked about it can we do it?"
//
// Yes we can. This is the MCP server. Add it to Claude.ai web (or Claude Desktop)
// as a "custom MCP server" pointing at https://nao00.nchobah.com/mcp with bearer auth.
// Then Claude.ai can call our council, search Naoufal's manus archive, check pillar
// metrics, list healing tracks — all from inside any Claude conversation, anywhere.

import { councilPipeline } from '../council/pipeline'
import { buildSnapshot } from '../metrics/api-use'
import { DISPLAY_NAME, VERSION } from '../util/identity'

const SERVER_INFO = { name: DISPLAY_NAME, version: VERSION }
const PROTOCOL_VERSION = '2025-06-18'

const TOOLS = [
  {
    name: 'ask_council',
    description: 'Run a question through nao_00\'s council (nao44 + Mistral logic check + Minouch warm voice). Returns the final answer Naoufal would hear. Use for anything you\'d ordinarily think yourself: he gets HIS perspective filtered through the brain that knows him.',
    inputSchema: {
      type: 'object',
      properties: { input: { type: 'string', description: 'The question or topic for the council' } },
      required: ['input']
    }
  },
  {
    name: 'manus_search',
    description: 'Search Naoufal\'s archive of 151 past Manus tasks. Topics include astrology/numerology readings (his + family), Fiverr inbox automation, Plusbase POD work, Coda Vietnam SEO, healing meditations, business plans. Use this when he references something he asked Manus before.',
    inputSchema: {
      type: 'object',
      properties: {
        q: { type: 'string', description: 'free-text search across title and content' },
        status: { type: 'string', enum: ['completed', 'pending', 'failed'], description: 'filter by Manus task status' },
        limit: { type: 'number', description: 'max results (default 10, cap 50)' }
      }
    }
  },
  {
    name: 'manus_get',
    description: 'Fetch a specific Manus task entry by id (returned by manus_search).',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'task id from manus_search results' } },
      required: ['id']
    }
  },
  {
    name: 'metrics_api_use',
    description: 'Read the pillar metric — nao_00\'s API utilization. Returns total calls, by-source breakdown, last-hour activity, cache hit ratio, and a traffic-light health signal. Use to answer "is the system alive?" or "how busy is the council?".',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'healing_list',
    description: 'List Naoufal\'s 5 healing-sound meditations (live at /healing). Use when discussing his original audio work or when someone asks for guided meditation.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'gab44_brand',
    description: 'Get the gab44 brand state — what it is, what\'s shipped, what\'s pending. Use when discussing his astrology brand strategy.',
    inputSchema: { type: 'object', properties: {} }
  }
]

interface JsonRpcReq {
  jsonrpc: '2.0'
  id?: number | string
  method: string
  params?: any
}

interface JsonRpcRes {
  jsonrpc: '2.0'
  id?: number | string | null
  result?: any
  error?: { code: number; message: string; data?: any }
}

function ok(id: any, result: any): JsonRpcRes {
  return { jsonrpc: '2.0', id, result }
}
function err(id: any, code: number, message: string): JsonRpcRes {
  return { jsonrpc: '2.0', id, error: { code, message } }
}

export async function handleMcp(req: JsonRpcReq, env: any): Promise<JsonRpcRes> {
  const { id, method, params } = req

  if (method === 'initialize') {
    return ok(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: SERVER_INFO
    })
  }

  if (method === 'notifications/initialized' || method === 'ping') {
    return ok(id ?? null, {})
  }

  if (method === 'tools/list') {
    return ok(id, { tools: TOOLS })
  }

  if (method === 'tools/call') {
    const name: string = params?.name
    const args = params?.arguments ?? {}

    try {
      if (name === 'ask_council') {
        if (!args.input) return err(id, -32602, 'input required')
        const r = await councilPipeline(args.input, env, env.KV, env.DB)
        return ok(id, {
          content: [{
            type: 'text',
            text: r.final_output + `\n\n---\n_council took ${r.duration_ms}ms · id ${r.id}_`
          }]
        })
      }

      if (name === 'manus_search') {
        const digest = (await env.KV.get('manus:digest', 'json')) as any[] | null
        if (!digest) return ok(id, { content: [{ type: 'text', text: 'manus archive not loaded' }] })
        const q = (args.q || '').toLowerCase().trim()
        const status = args.status
        const limit = Math.min(args.limit || 10, 50)
        let results = digest
        if (status) results = results.filter((r: any) => r.status === status)
        if (q) results = results.filter((r: any) =>
          (r.title || '').toLowerCase().includes(q) ||
          (r.user || '').toLowerCase().includes(q) ||
          (r.asst || '').toLowerCase().includes(q)
        )
        results = results.slice(0, limit)
        const summary = results.map((r: any) =>
          `[${r.status}] ${r.title} (id: ${r.id})`
        ).join('\n')
        return ok(id, {
          content: [{
            type: 'text',
            text: `${results.length} of ${digest.length} matches:\n\n${summary}`
          }]
        })
      }

      if (name === 'manus_get') {
        if (!args.id) return err(id, -32602, 'id required')
        const digest = (await env.KV.get('manus:digest', 'json')) as any[] | null
        const entry = digest?.find((r: any) => r.id === args.id)
        if (!entry) return err(id, -32602, 'task id not found')
        return ok(id, {
          content: [{ type: 'text', text: JSON.stringify({ ...entry, manus_url: `https://manus.im/app/${args.id}` }, null, 2) }]
        })
      }

      if (name === 'metrics_api_use') {
        const snap = await buildSnapshot(env.DB)
        const lines = [
          `pillar metric — API utilization · health: ${snap.health.toUpperCase()}`,
          snap.health_note,
          ``,
          `total calls: ${snap.total_calls}`,
          `total tokens: ${(snap.total_input_tokens + snap.total_output_tokens).toLocaleString()}`,
          `last hour: ${snap.last_hour.calls} calls / ${snap.last_hour.tokens.toLocaleString()} tokens`,
          `last 24h: ${snap.last_24h.calls} calls / ${snap.last_24h.tokens.toLocaleString()} tokens`,
          `cache hit ratio: ${(snap.cache_hit_ratio * 100).toFixed(1)}%`,
          ``,
          `by source:`,
          ...Object.entries(snap.by_source).map(([s, v]: [string, any]) =>
            `  ${s}: ${v.calls} calls (${v.input + v.output} tokens)`
          )
        ]
        return ok(id, { content: [{ type: 'text', text: lines.join('\n') }] })
      }

      if (name === 'healing_list') {
        return ok(id, {
          content: [{
            type: 'text',
            text: `5 healing meditations live at https://nao00.nchobah.com/healing — original audio by Naoufal, free to listen. (Detailed track list coming when /healing/list endpoint ships.)`
          }]
        })
      }

      if (name === 'gab44_brand') {
        return ok(id, {
          content: [{
            type: 'text',
            text: [
              'gab44 — Naoufal\'s personal brand for astrology + numerology + healing.',
              '',
              'Live now:',
              '- Landing page: https://nao00.nchobah.com/gab44 (Naoclaw warm palette)',
              '- 5 healing meditations: https://nao00.nchobah.com/healing',
              '',
              'Pending:',
              '- Telegram bot (waiting on @BotFather token)',
              '- Helio (MoonPay) crypto paywall',
              '- Gumroad listing for fiat buyers',
              '- dash.gab44.com / bot.gab44.com (waiting NS at FastComet → alberto + kimora)',
              '',
              'Not the legal entity yet — gab44 is the brand-in-his-head. Future US LLC will wrap it.'
            ].join('\n')
          }]
        })
      }

      return err(id, -32601, `unknown tool: ${name}`)
    } catch (e: any) {
      return err(id, -32603, `tool error: ${String(e?.message ?? e).slice(0, 200)}`)
    }
  }

  return err(id, -32601, `unknown method: ${method}`)
}
