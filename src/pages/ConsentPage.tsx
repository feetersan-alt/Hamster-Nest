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

export default function ConsentPage() {
  const [details, setDetails] = useState<AuthDetails | null>(null)
  const [authorizationId, setAuthorizationId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const goLogin = useCallback(() => {
    sessionStorage.setItem(RETURN_KEY, location.href)
    location.assign(`${import.meta.env.BASE_URL}#/auth`)
  }, [])

  useEffect(() => {
    let active = true
    void (async () => {
      if (!supabase) {
        setError('Supabase 尚未配置。')
        setLoading(false)
        return
      }
      const { data: sessionData } = await supabase.auth.getSession()
      if (!active) return
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

      const { data, error: requestError } = await supabase.auth.oauth.getAuthorizationDetails(id)
      if (!active) return
      if (requestError) {
        setError(requestError.message)
        setLoading(false)
        return
      }
      if (!data) {
        setError('OAuth 授权请求不存在或已过期。')
        setLoading(false)
        return
      }
      if ('redirect_url' in data && typeof data.redirect_url === 'string') {
        location.assign(data.redirect_url)
        return
      }
      setDetails(data as AuthDetails)
      setLoading(false)
    })()
    return () => { active = false }
  }, [goLogin])

  const decide = async (approve: boolean) => {
    if (!supabase || !authorizationId) return
    setWorking(true)
    setError(null)
    const result = approve
      ? await supabase.auth.oauth.approveAuthorization(authorizationId)
      : await supabase.auth.oauth.denyAuthorization(authorizationId)
    if (result.error) {
      setError(result.error.message)
      setWorking(false)
      return
    }
    if (result.data?.redirect_url) {
      location.assign(result.data.redirect_url)
      return
    }
    setError('OAuth 没有返回重定向地址。')
    setWorking(false)
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
  actions:{display:'grid',gap:10,marginTop:28},primary:{border:0,borderRadius:12,padding:'13px 16px',background:'#27231f',color:'#fff',fontSize:15},secondary:{border:'1px solid #d8d1c8',borderRadius:12,padding:'13px 16px',background:'#fff',color:'#27231f',fontSize:15},error:{color:'#a33d32',lineHeight:1.6}
}
