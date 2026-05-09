// Composio MCP client — fetch()-based, runs inside the Worker.
// Per nao00/PLAN.md root-cause: the consumer key (ck_HtRPp...) works on
// the MCP transport but NOT on the REST API (which needs a personal key).
// So we go MCP from the Worker.
//
// MCP transport is JSON-RPC over HTTP with optional SSE responses. For
// our Worker → Cloudflare round-trip we use the streamable-http transport.

const MCP_URL = 'https://connect.composio.dev/mcp'

export interface McpToolDef {
  name: string
  description: string
  inputSchema?: any
}

export interface McpCallResult {
  content: Array<{ type: string; text?: string; data?: any }>
  isError?: boolean
}

interface RpcRequest {
  jsonrpc: '2.0'
  id: number
  method: string
  params?: any
}

interface RpcResponse<T = any> {
  jsonrpc: '2.0'
  id: number
  result?: T
  error?: { code: number; message: string }
}

let _id = 0
const nextId = () => ++_id

export class ComposioMCP {
  private apiKey: string

  constructor(apiKey: string) {
    if (!apiKey) throw new Error('composio mcp api key required')
    this.apiKey = apiKey
  }

  private async rpc<T = any>(method: string, params?: any): Promise<T> {
    const body: RpcRequest = { jsonrpc: '2.0', id: nextId(), method, params }
    const res = await fetch(MCP_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'accept': 'application/json, text/event-stream',
        'x-consumer-api-key': this.apiKey
      },
      body: JSON.stringify(body)
    })

    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      throw new Error(`mcp http ${res.status}: ${txt.slice(0, 300)}`)
    }

    const ct = res.headers.get('content-type') ?? ''
    let payload: RpcResponse<T>

    if (ct.includes('text/event-stream')) {
      // Parse the first `data:` line of the SSE stream as JSON.
      const text = await res.text()
      const match = text.match(/^data:\s*(\{[\s\S]*?\})\s*$/m)
      if (!match) throw new Error(`mcp sse: no data frame found`)
      payload = JSON.parse(match[1])
    } else {
      payload = await res.json()
    }

    if (payload.error) {
      throw new Error(`mcp error ${payload.error.code}: ${payload.error.message}`)
    }
    return payload.result as T
  }

  async listTools(): Promise<McpToolDef[]> {
    const r = await this.rpc<{ tools: McpToolDef[] }>('tools/list')
    return r.tools ?? []
  }

  async callTool(name: string, args: Record<string, any>): Promise<McpCallResult> {
    return await this.rpc<McpCallResult>('tools/call', { name, arguments: args })
  }
}
