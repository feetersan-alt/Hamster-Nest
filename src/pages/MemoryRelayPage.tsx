import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listEventThreads, listMemoEntries, listMemories } from '../storage/supabaseSync'
import { buildMemoryRelay, type RelaySource } from '../utils/memoryRelay'
import './MemoryRelayPage.css'

const MemoryRelayPage = () => {
  const navigate = useNavigate()
  const [sources, setSources] = useState<RelaySource[]>([])
  const [handoff, setHandoff] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    setCopied(false)
    try {
      const [threads, memos, memories] = await Promise.all([
        listEventThreads(),
        listMemoEntries(),
        listMemories('confirmed'),
      ])
      const result = buildMemoryRelay(threads, memos, memories)
      setSources(result.sources)
      setHandoff(result.handoff)
    } catch (err) {
      console.warn('读取跨窗口交接记录失败', err)
      setError('读取失败，请检查网络后重试')
      setSources([])
      setHandoff('')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const copyHandoff = async () => {
    try {
      await navigator.clipboard.writeText(handoff)
      setCopied(true)
    } catch {
      setError('复制失败，请手动选择交接摘要文本')
    }
  }

  return (
    <main className="relay-page">
      <header className="relay-header">
        <button type="button" onClick={() => navigate('/')}>← 返回首页</button>
        <h1>跨窗口记忆接力</h1>
        <button type="button" onClick={() => void refresh()} disabled={loading}>刷新</button>
      </header>
      <p className="relay-hint">只读 · 从进行中事件、置顶备忘和已确认记忆生成交接摘要。来源可追溯，不代表记录已重新核实。</p>
      {loading && <p role="status">正在读取交接记录…</p>}
      {error && <p role="alert">{error} <button type="button" onClick={() => void refresh()}>重试</button></p>}
      {!loading && !error && (
        <>
          <section className="relay-panel">
            <div className="relay-panel-header"><h2>交接摘要</h2><button type="button" onClick={() => void copyHandoff()} disabled={!handoff}>{copied ? '已复制' : '复制交接摘要'}</button></div>
            <p className="relay-hint">复制后可粘贴到新聊天窗口。此功能不会自动向其他聊天注入内容，也不会上传聊天记录。</p>
            <textarea aria-label="跨窗口交接摘要" readOnly value={handoff} rows={10} />
          </section>
          <section className="relay-panel">
            <h2>来源记录（{sources.length}）</h2>
            {sources.length === 0 ? <p>暂无可交接记录</p> : (
              <ul className="relay-sources">{sources.map(item => (
                <li key={`${item.kind}:${item.id}`}>
                  <button type="button" onClick={() => navigate(item.href)}>{item.label} →</button>
                  <small>{item.kind} · 更新于 {item.updatedAt}</small>
                  <p>{item.content}</p>
                </li>
              ))}</ul>
            )}
          </section>
        </>
      )}
    </main>
  )
}

export default MemoryRelayPage
