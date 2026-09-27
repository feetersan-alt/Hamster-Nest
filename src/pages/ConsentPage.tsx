import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase/client'

type AuthDetails = {
  authorization_id?: string
  client?: { name?: string | null }
  redirect_uri?: string | null
  scope?: string | null
  redirect_url?: string | null
}

const RETURN_KEY = 'hamster-oauth-return'

function formatOAuthError(error: unknown): string {
  if (error instanceof Error) {
    const e = error as Error & { status?: unknown; code?: unknown; details?: unknown; hint?: unknown }
    return [
      `${error.name}: ${error.message}`,
      e.status !== undefined ? `status: ${String(e.status)}` : null,
      e.code !== undefined ? `code: ${String(e.code)}` : null,
      e.details !== undefined ? `details: ${String(e.details)}` : null,
      e.hint !== undefined ? `hint: ${String(e.hint)}` : null,
      error.stack ? `stack:\n${error.stack}` : null,
    ].filter(Boolean).join('\n')
  }
  if (typeof error === 'string') return error
  try {
    const e = error as Record<string, unknown> | null
    if (e && typeof e === 'object') {
      return [
        e.name !== undefined ? `name: ${String(e.name)}` : null,
        e.message !== undefined ? `message: ${String(e.message)}` : null,
        e.status !== undefined ? `status: ${String(e.status)}` : null,
        e.code !== undefined ? `code: ${String(e.code)}` : null,
        e.details !== undefined ? `details: ${String(e.details)}` : null,
        e.hint !== undefined ? `hint: ${String(e.hint)}` : null,
        e.stack !== undefined ? `stack:\n${String(e.stack)}` : null,
      ].filter(Boolean).join('\n')
    }
    return JSON.stringify(error, null, 2)
  } catch {
    return String(error)
  }
}

function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(`Supabase 请求超过 ${milliseconds}ms 未返回。`))
    }, milliseconds)

    promise.then(
      value => {
        window.clearTimeout(timer)
        resolve(value)
      },
      error => {
        window.clearTimeout(timer)
        reject(error)
      },
    )
  })
}

function logOAuth(label: string, value: unknown) {
  console.error(`[Hamster-Nest OAuth] ${label}`, value)
}

export default function ConsentPage() {
  const [details, setDetails] = useState<AuthDetails | null>(null)
  const [authorizationId, setAuthorizationId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [status, setStatus] = useState('等待授权操作。')
  const [error, setError] = useState<string | null>(null)

  const goLogin = useCallback(() => {
    const returnUrl = location.href
    sessionStorage.setItem(RETURN_KEY, returnUrl)
    const loginUrl = new URL(`${import.meta.env.BASE_URL}#/auth`, location.origin)
    loginUrl.searchParams.set('oauth_return', returnUrl)
    location.assign(loginUrl.href)
  }, [])

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        if (!supabase) {
          setError('Supabase 尚未配置。')
          setLoading(false)
          return
        }

        const sessionResult = await supabase.auth.getSession()
        logOAuth('getSession result', sessionResult)
        const { data: sessionData, error: sessionError } = sessionResult
        if (!active) return

        if (sessionError) {
          throw sessionError
        }

        if (!sessionData.session?.user) {
          goLogin()
          return
        }

        const id = new URLSearchParams(location.search).get('authorization_id')
        if (!id) {
          setError('缺少 authorization_id。')
          setLoading(false)
          return
        }
        setAuthorizationId(id)

        const result = await supabase.auth.oauth.getAuthorizationDetails(id)
        logOAuth('getAuthorizationDetails result', result)
        if (!active) return

        if (result.error) {
          throw result.error
        }

        const data = result.data
        if (!data) {
          setError('OAuth 授权请求不存在或已过期。')
          setLoading(false)
          return
        }

        if ('redirect_url' in data && typeof data.redirect_url === 'string') {
          logOAuth('already-approved redirect_url', data.redirect_url)
          location.assign(data.redirect_url)
          return
        }

        setDetails(data as AuthDetails)
        setLoading(false)
      } catch (caught) {
        const message = formatOAuthError(caught)
        logOAuth('ConsentPage initialization error', caught)
        if (!active) return
        setError(`OAuth 初始化失败：${message}`)
        setLoading(false)
      }
    })()

    return () => {
      active = false
    }
  }, [goLogin])

  const decide = async (approve: boolean) => {
    if (!supabase || !authorizationId) {
      setError('无法授权：Supabase 或 authorization_id 不存在。')
      return
    }

    setWorking(true)
    setError(null)
    setStatus('正在授权...')
    logOAuth('authorization decision', { approve, authorizationId })

    try {
      setStatus(approve ? 'approveAuthorization() 已发起' : 'denyAuthorization() 已发起')

      const result = await withTimeout(
        approve
          ? supabase.auth.oauth.approveAuthorization(authorizationId)
          : supabase.auth.oauth.denyAuthorization(authorizationId),
        15000,
      )

      logOAuth(approve ? 'approveAuthorization result' : 'denyAuthorization result', result)
      setStatus('Supabase 返回...')

      if (result.error) {
        const message = formatOAuthError(result.error)
        logOAuth('OAuth SDK returned an error', result.error)
        setError(`OAuth 授权失败：\n${message}`)
        setStatus('Supabase 返回错误')
        setWorking(false)
        return
      }

      const resultError = result.error
      const redirectUrl = result.data?.redirect_url
      if (redirectUrl) {
        logOAuth('redirect_url received; navigating to callback', redirectUrl)
        setStatus('收到 redirect_url，跳转中...')
        location.assign(redirectUrl)
        return
      }

      const rawResult = formatOAuthError(result)
      logOAuth('OAuth SDK returned no redirect_url', result)
      setError(
        `OAuth 授权失败：approveAuthorization() 没有返回 redirect_url。\nresult.error：${resultError ? formatOAuthError(resultError) : 'null'}\n完整结果：\n${rawResult}`,
      )
      setStatus('Supabase 返回，但没有 redirect_url')
      setWorking(false)
    } catch (caught) {
      const message = formatOAuthError(caught)
      logOAuth('approveAuthorization threw an exception', caught)
      setError(`OAuth 授权异常：\n${message}`)
      setStatus('授权过程中出现异常')
      setWorking(false)
    }
  }

  if (loading) return <main style={s.page}><section style={s.card}>正在准备授权请求…</section></main>
  const scopes = (details?.scope ?? '').split(' ').filter(Boolean)

  return (
    <main style={s.page}>
      <section style={s.card}>
        <div style={s.icon}>🐹</div>
        <div style={s.eyebrow}>HAMSTER NEST</div>
        <h1 style={s.title}>授权访问</h1>
        <p style={s.text}><strong>{details?.client?.name ?? '第三方应用'}</strong> 请求访问你的 Hamster Nest 账户。</p>
        <div style={s.section}>
          <b>请求的权限</b>
          <div style={s.scopes}>{scopes.length ? scopes.map(x => <span key={x} style={s.scope}>{x}</span>) : <span style={s.muted}>未请求额外权限</span>}</div>
        </div>
        {details?.redirect_uri && <div style={s.section}><b>授权完成后返回</b><p style={s.uri}>{details.redirect_uri}</p></div>}
        <div style={s.statusBox}>
          <b>诊断状态</b>
          <p style={s.status}>{status}</p>
          {error && <pre style={s.error}>{error}</pre>}
        </div>
        <div style={s.actions}>
          <button disabled={working} style={s.primary} onClick={() => void decide(true)}>{working ? '处理中…' : '允许访问'}</button>
          <button disabled={working} style={s.secondary} onClick={() => void decide(false)}>拒绝</button>
        </div>
      </section>
    </main>
  )
}

const s: Record<string, React.CSSProperties> = {
  page:{minHeight:'100vh',display:'grid',placeItems:'center',padding:24,boxSizing:'border-box',background:'#f6f4ef',fontFamily:'system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',color:'#27231f'},
  card:{width:'min(100%,480px)',boxSizing:'border-box',padding:32,borderRadius:24,background:'#fff',boxShadow:'0 16px 48px rgba(50,40,30,.12)'},
  icon:{fontSize:42},eyebrow:{marginTop:8,fontSize:12,letterSpacing:'.14em',opacity:.55},title:{margin:'8px 0 12px',fontSize:30},
  text:{lineHeight:1.65,color:'#5d554d'},section:{marginTop:24,paddingTop:18,borderTop:'1px solid #eee9e2'},scopes:{display:'flex',flexWrap:'wrap',gap:8,marginTop:10},
  scope:{padding:'6px 10px',borderRadius:999,background:'#f0ede7',fontSize:13},muted:{color:'#777067'},uri:{wordBreak:'break-all',color:'#6c655d',fontSize:13,lineHeight:1.5},
  statusBox:{marginTop:24,padding:14,borderRadius:12,background:'#f7f4ef',border:'1px solid #e8e1d8'},status:{margin:'8px 0 0',lineHeight:1.5,color:'#27231f'},actions:{display:'grid',gap:10,marginTop:28},primary:{border:0,borderRadius:12,padding:'13px 16px',background:'#27231f',color:'#fff',fontSize:15},secondary:{border:'1px solid #d8d1c8',borderRadius:12,padding:'13px 16px',background:'#fff',color:'#27231f'},error:{margin:'12px 0 0',color:'#a33d32',lineHeight:1.6,whiteSpace:'pre-wrap',wordBreak:'break-word',fontFamily:'ui-monospace,SFMono-Regular,Menlo,monospace',fontSize:12}
}
