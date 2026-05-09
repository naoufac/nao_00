// nao00-validator — Playwright screenshot validation service.
// POST /validate {url, expect_status?, expect_text?}
//   -> {ok, status, screenshot_url?, diff?, error?}
// GET /health -> {ok: true}

import http from 'node:http'
import { chromium } from 'playwright'
import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const PORT = 3002
const SCREENSHOT_DIR = '/tmp/screenshots'

await mkdir(SCREENSHOT_DIR, { recursive: true })

let browser = null

async function getBrowser() {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-gpu'],
    })
  }
  return browser
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)

  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, ts: Date.now() }))
    return
  }

  if (req.method === 'POST' && url.pathname === '/validate') {
    let body = ''
    for await (const chunk of req) body += chunk
    let params
    try {
      params = JSON.parse(body)
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, error: 'invalid JSON' }))
      return
    }

    const targetUrl = params.url
    const expectStatus = params.expect_status || 200
    const expectText = params.expect_text || null

    if (!targetUrl) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, error: 'url required' }))
      return
    }

    try {
      const b = await getBrowser()
      const page = await b.newPage({ viewport: { width: 1280, height: 720 } })

      const response = await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 })
      const status = response?.status() || 0
      const content = await page.content()

      // Screenshot
      const ts = Date.now()
      const filename = `screenshot-${ts}.png`
      const filepath = join(SCREENSHOT_DIR, filename)
      await page.screenshot({ path: filepath, fullPage: false })

      await page.close()

      let ok = status === expectStatus
      let diff = null

      if (expectText && !content.includes(expectText)) {
        ok = false
        diff = `expected text "${expectText}" not found in page`
      }

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        ok,
        status,
        screenshot_url: `/screenshots/${filename}`,
        diff,
        url: targetUrl,
        ts,
      }))
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, error: String(err.message || err) }))
    }
    return
  }

  // Serve screenshots
  if (req.method === 'GET' && url.pathname.startsWith('/screenshots/')) {
    const filename = url.pathname.split('/').pop()
    const filepath = join(SCREENSHOT_DIR, filename)
    try {
      const { readFile } = await import('node:fs/promises')
      const data = await readFile(filepath)
      res.writeHead(200, { 'Content-Type': 'image/png' })
      res.end(data)
    } catch {
      res.writeHead(404)
      res.end('not found')
    }
    return
  }

  res.writeHead(404)
  res.end('not found')
})

server.listen(PORT, () => {
  console.log(`[nao00-validator] listening on :${PORT}`)
})
