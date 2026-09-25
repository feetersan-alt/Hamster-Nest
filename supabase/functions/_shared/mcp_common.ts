import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { McpServer } from 'npm:@modelcontextprotocol/sdk@1.25.3/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from 'npm:@modelcontextprotocol/sdk@1.25.3/server/webStandardStreamableHttp.js'
import { Hono } from 'npm:hono@^4.9.7'
import { withOAuthProtectedResource, withSupabase } from 'npm:@supabase/server@^1.6.0'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { isMcpKeyAuthorized } from './mcp_key_auth.ts'
import { getOwnerUserId } from './owner.ts'
import { getSupabaseAdminKey } from './supabase_secret.ts'

export const MCP_VERSION = '5.18.1'
export const USER_ID = getOwnerUserId()

export const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  getSupabaseAdminKey(),
)

const allowedOrigins = [
  'https://chuan-101.github.io',
  'https://feetersan-alt.github.io',
  /^http:\/\/localhost:\d+$/,
]

const isAllowedOrigin = (origin: string) =>
  allowedOrigins.some((pattern) =>
    typeof pattern === 'string' ? pattern === origin : pattern.test(origin)
  )

const buildCorsHeaders = (origin: string): Record<string, string> => ({
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, mcp-session-id, mcp-protocol-version, x-hamster-mcp-key',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Max-Age': '86400',
  Vary: 'Origin',
})

export const jsonResult = (value: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
})

export const errorResult = (err: unknown) => {
  let msg: string
  if (err instanceof Error) {
    msg = err.message
  } else if (typeof err === 'object' && err !== null) {
    msg = (err as Record<string, unknown>).message as string ?? JSON.stringify(err, null, 2)
  } else {
    msg = String(err)
  }
  return { content: [{ type: 'text' as const, text: `Error: ${msg}` }] }
}

export const clampLimit = (limit: number | undefined, fallback: number, max: number) =>
  Math.min(Math.max(limit ?? fallback, 1), max)

type ServeMcpOptions = {
  serverName?: string
  instructions?: string
}

export function serveMcp(
  functionName: string,
  registerTools: (server: McpServer) => void,
  options: string | ServeMcpOptions = {},
) {
  const { serverName = 'hamster-nest', instructions } =
    typeof options === 'string' ? { serverName: options, instructions: undefined } : options
  const app = new Hono().basePath(`/${functionName}`)

  app.use('*', async (c, next) => {
    const origin = c.req.header('origin') ?? null
    const corsHeaders = origin && isAllowedOrigin(origin) ? buildCorsHeaders(origin) : null

    if (c.req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders ?? {} })
    if (origin && !corsHeaders) {
      return new Response(JSON.stringify({ error: '不允许的来源' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    if (!(await isAuthorizedRequest(c.req.raw))) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { ...(corsHeaders ?? {}), 'Content-Type': 'application/json' },
      })
    }

    await next()

    if (corsHeaders) {
      const headers = new Headers(c.res.headers)
      for (const [name, value] of Object.entries(corsHeaders)) headers.set(name, value)
      c.res = new Response(c.res.body, { status: c.res.status, headers })
    }
  })

  app.all('*', async (c) => {
    const server = new McpServer(
      { name: serverName, version: MCP_VERSION },
      instructions ? { instructions } : undefined,
    )
    const toolServer = new Proxy(server, {
      get(target, property, receiver) {
        if (property === 'registerTool') {
          return (name: string, config: Record<string, unknown>, handler: unknown) =>
            target.registerTool(name, {
              ...config,
              securitySchemes: config.securitySchemes ?? [{ type: 'oauth2', scopes: ['openid'] }],
            }, handler as never)
        }
        return Reflect.get(target, property, receiver)
      },
    }) as McpServer
    registerTools(toolServer)
    const transport = new WebStandardStreamableHTTPServerTransport()
    await server.connect(transport)
    return transport.handleRequest(c.req.raw)
  })

  const oauthHandler = withOAuthProtectedResource(
    withSupabase({ auth: ['user', 'none'] }, async (req, ctx) => {
      const key = Deno.env.get('HAMSTER_MCP_KEY') ?? ''
      const keyAuthorized = isMcpKeyAuthorized(req, key)
      const oauthAuthorized = ctx.authMode === 'user' && ctx.userClaims?.id === USER_ID

      if (!keyAuthorized && !oauthAuthorized) {
        if (ctx.authMode === 'user') {
          return new Response(JSON.stringify({ error: 'forbidden' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        return new Response(JSON.stringify({ error: 'unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      return app.fetch(req)
    }),
  )

  Deno.serve(oauthHandler)
}
