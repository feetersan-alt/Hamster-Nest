import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { User } from '@supabase/supabase-js'
import { friendlyAuthError } from '../lib/authErrors'
import { supabase } from '../supabase/client'
import './AuthPage.css'

type AuthPageProps = {
  user: User | null
}

const AuthPage = ({ user }: AuthPageProps) => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [signingIn, setSigningIn] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const sessionReadyRef = useRef(false)
  const navigate = useNavigate()

  const continueAfterAuth = useCallback(() => {
    const returnUrl = window.sessionStorage.getItem('hamster-oauth-return')
    if (!returnUrl) return false
    window.sessionStorage.removeItem('hamster-oauth-return')
    window.location.assign(returnUrl)
    return true
  }, [])

  useEffect(() => {
    const client = supabase
    if (!client) {
      sessionReadyRef.current = true
      setIsLoading(false)
      return
    }

    let active = true
    const initializeSession = async () => {
      const { data } = await client.auth.getSession()
      if (!active) {
        return
      }
      sessionReadyRef.current = true
      setIsLoading(false)
      if (data.session?.user && !continueAfterAuth()) {
        navigate('/', { replace: true })
      }
    }

    void initializeSession()

    const { data } = client.auth.onAuthStateChange((_event, session) => {
      if (!sessionReadyRef.current || !session?.user) {
        return
      }
      if (!continueAfterAuth()) {
        navigate('/', { replace: true })
      }
    })

    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [continueAfterAuth, navigate])

  const handleSignIn = useCallback(async () => {
    const trimmedEmail = email.trim().toLowerCase()
    if (!trimmedEmail) {
      setError('请输入邮箱地址。')
      return
    }
    if (!password) {
      setError('请输入密码。')
      return
    }
    if (!supabase) {
      setError('尚未配置 Supabase 环境变量。')
      return
    }

    setSigningIn(true)
    setError(null)
    setStatus(null)
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password,
    })
    setSigningIn(false)

    if (signInError) {
      setError(friendlyAuthError(signInError, '邮箱或密码错误，请检查后再试。'))
      return
    }
    setStatus('登录成功，欢迎回来。')
  }, [email, password])

  const handleLogout = useCallback(async () => {
    if (!supabase) {
      setError('尚未配置 Supabase 环境变量。')
      return
    }
    setError(null)
    setStatus(null)
    const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' })
    if (signOutError) {
      setError(friendlyAuthError(signOutError, '退出登录失败，请稍后再试。'))
    }
  }, [])

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="hamster-logo" aria-hidden="true">
          <span className="auth-logo-icon" />
        </div>
        <h1 className="ui-title">Welcome to Hamster Nest</h1>
        <p className="subtitle">Enter your password to unlock your secret lair</p>

        <label className="field">
          <span className="field-label">邮箱地址</span>
          <div className="input-shell">
            <span className="input-icon" aria-hidden="true">@</span>
            <input
              type="email"
              placeholder="输入你的邮箱"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
            />
          </div>
        </label>

        <label className="field">
          <span className="field-label">密码</span>
          <div className="input-shell">
            <span className="input-icon" aria-hidden="true">*</span>
            <input
              type="password"
              placeholder="输入你的密码"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
            />
          </div>
        </label>

        <button
          type="button"
          className="primary"
          onClick={handleSignIn}
          disabled={signingIn || isLoading}
        >
          {signingIn ? '登录中...' : '登录 ✨'}
        </button>

        {isLoading ? <p className="status">正在检查登录状态...</p> : null}
        {status ? <p className="status">{status}</p> : null}
        {error ? <p className="error">{error}</p> : null}

        <div className="divider" />
        {user ? (
          <div className="auth-user">
            <p>
              当前用户：<strong>{user.email ?? '未知邮箱'}</strong>
            </p>
            <div className="user-actions">
              <button type="button" className="ghost" onClick={() => navigate('/')}>
                进入聊天
              </button>
              <button type="button" className="danger" onClick={handleLogout}>
                退出登录
              </button>
            </div>
          </div>
        ) : (
          <p className="hint">登录后将自动同步你的会话与消息。</p>
        )}
      </div>
    </div>
  )
}

export default AuthPage
