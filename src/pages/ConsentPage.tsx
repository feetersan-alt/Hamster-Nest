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
    return `${error.name}: ${error.message}`
  }
  if (typeof error === 'string') return error
  try {
    return JSON.stringify(error, null, 2)
  } catch {
    return String(error)
  }
}

function logOAuth(label: string, value: unknown) {
  console.error(`[Hamster-Nest OAuth] ${label}`, value)
}

export default function ConsentPage() {
  const [details, setDetails] = useState<AuthDetails | null>(null)
  const [authorizationId, setAuthorizationId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
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
    logOAuth('authorization decision', { approve, authorizationId })

    try {
      const result = approve
        ? await supabase.auth.oauth.approveAuthorization(authorizationId)
        : await supabase.auth.oauth.denyAuthorization(authorizationId)

      logOAuth(approve ? 'approveAuthorization result' : 'denyAuthorization result', result)

      if (result.error) {
        const message = formatOAuthError(result.error)
        logOAuth('OAuth SDK returned an error', result.error)
        setError(`OAuth 授权失败：${message}`)
        setWorking(false)
        return
      }

      const redirectUrl = result.data?.redirect_url
      if (redirectUrl) {
        logOAuth('redirect_url received; navigating to callback', redirectUrl)
        location.assign(redirectUrl)
        return
      }

      const rawResult = formatOAuthError(result)
      logOAuth('OAuth SDK returned no redirect_url', result)
      setError(`OAuth 授权失败：approveAuthorization 没有返回 redirect_url。result.error：${result.error ? formatOAuthError(result.error) : 'null'}。完整结果：${rawResult}`)
      setWorking(false)
    } catch (caught) {
      const message = formatOAuthError(caught)
      logOAuth('approveAuthorization threw an exception', caught)
      setError(`OAuth 授权异常：${message}`)
      setWorking(false)
    }
  }

  if (loading) return <main style={s.page}><section style={s.card}>正在准备授权请求…</section></main>
  if (error) return <main style={s.page}><section style={s.card}><h1>OAuth 授权</h1><p style={s.error}>{error}</p></section></main>

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
  actions:{display:'grid',gap:10,marginTop:28},primary:{border:0,borderRadius:12,padding:'13px 16px',background:'#27231f',color:'#fff',fontSize:15},secondary:{border:'1px solid #d8d1c8',borderRadius:12,padding:'13px 16px',background:'#fff',color:'#27231f'},error:{color:'#a33d32',lineHeight:1.6,whiteSpace:'pre-wrap',wordBreak:'break-word'}
}
