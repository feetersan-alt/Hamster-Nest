import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { EventThread, MemoEntry, TimelineEntry, TodoDashboardData } from '../types'
import {
  listTodoDashboard,
  listMemoEntries,
  listEventThreads,
  listTimelineEntriesByMonth,
} from '../storage/supabaseSync'
import './OverviewPage.css'

type OverviewData = {
  todos: Awaited<ReturnType<typeof listTodoDashboard>>
  memos: MemoEntry[]
  threads: EventThread[]
  timeline: TimelineEntry[]
}

const monthRange = () => {
  const now = new Date()
  const dateKey = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  return [dateKey(new Date(now.getFullYear(), now.getMonth(), 1)), dateKey(new Date(now.getFullYear(), now.getMonth() + 1, 0))] as const
}

const OverviewPage = () => {
  const navigate = useNavigate()
  const [data, setData] = useState<OverviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    const [start, end] = monthRange()
    try {
      const [todos, memos, threads, timeline] = await Promise.all([
        listTodoDashboard(),
        listMemoEntries(),
        listEventThreads(),
        listTimelineEntriesByMonth(start, end),
      ])
      setData({ todos, memos, threads, timeline })
    } catch (err) {
      console.warn('加载生活总览失败', err)
      setError('加载失败，请检查网络后重试')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const active = data?.threads.filter((item) => item.status === 'active') ?? []
  const recentMemos = [...(data?.memos ?? [])].sort((a, b) =>
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 3)
  const recentTimeline = [...(data?.timeline ?? [])].sort((a, b) =>
    b.eventDate.localeCompare(a.eventDate)).slice(0, 3)
  const openTodos = data?.todos.nearTermOpen ?? []

  return (
    <main className="overview-page">
      <header className="overview-header">
        <button type="button" onClick={() => navigate('/')}>← 返回首页</button>
        <div><h1>生活总览</h1><p>从仓鼠窝现有记录实时读取 · 只读</p></div>
        <button type="button" onClick={() => void refresh()} disabled={loading}>刷新</button>
      </header>
      {loading && <p role="status">正在读取记录…</p>}
      {error && <p role="alert">{error} <button type="button" onClick={() => void refresh()}>重试</button></p>}
      {!loading && data && (
        <div className="overview-grid">
          <section className="overview-card">
            <div className="overview-card-head"><h2>近期待办</h2><button onClick={() => navigate('/todo')}>查看全部 →</button></div>
            <strong className="overview-count">{openTodos.length}</strong>
            <p className="overview-muted">近期未完成事项</p>
            {openTodos.length === 0 ? <p>暂无近期待办</p> :
              <ul>{openTodos.slice(0, 4).map(item => <li key={item.id}>{item.title}</li>)}</ul>}
          </section>
          <section className="overview-card">
            <div className="overview-card-head"><h2>进行中事件</h2><button onClick={() => navigate('/events')}>查看全部 →</button></div>
            <strong className="overview-count">{active.length}</strong>
            {active.length === 0 ? <p>暂无进行中的事件线</p> :
              <ul>{active.slice(0, 4).map(item => <li key={item.id}><button className="overview-text-link" onClick={() => navigate(`/events/${item.id}`)}>{item.title}</button></li>)}</ul>}
          </section>
          <section className="overview-card">
            <div className="overview-card-head"><h2>最近备忘</h2><button onClick={() => navigate('/memo')}>查看全部 →</button></div>
            {recentMemos.length === 0 ? <p>暂无备忘录</p> :
              <ul>{recentMemos.map(item => <li key={item.id}>{item.content.slice(0, 90)}{item.content.length > 90 ? '…' : ''}</li>)}</ul>}
          </section>
          <section className="overview-card">
            <div className="overview-card-head"><h2>本月时间轴</h2><button onClick={() => navigate('/timeline')}>查看全部 →</button></div>
            {recentTimeline.length === 0 ? <p>本月暂无时间轴记录</p> :
              <ul>{recentTimeline.map(item => <li key={item.id}><small>{item.eventDate}</small> {item.summary}</li>)}</ul>}
          </section>
        </div>
      )}
    </main>
  )
}

export default OverviewPage
