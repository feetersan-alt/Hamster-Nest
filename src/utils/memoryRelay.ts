import type { EventThread, MemoEntry, MemoryEntry } from '../types'

export type RelaySource = {
  kind: 'event' | 'memo' | 'memory'
  id: string
  label: string
  updatedAt: string
  content: string
  href: string
}

const normalized = (text: string) => text.replace(/\s+/g, ' ').trim()
const snippet = (text: string, limit = 220) => {
  const value = normalized(text)
  return value.length > limit ? `${value.slice(0, limit)}…` : value
}

export const buildMemoryRelay = (
  threads: EventThread[],
  memos: MemoEntry[],
  memories: MemoryEntry[],
  now = new Date(),
): { generatedAt: string; sources: RelaySource[]; handoff: string } => {
  const events: RelaySource[] = threads
    .filter((item) => item.status === 'active')
    .map((item) => ({
      kind: 'event' as const,
      id: item.id,
      label: item.title,
      updatedAt: item.updatedAt,
      content: snippet(item.currentStatus || '暂无当前状态'),
      href: `/events/${item.id}`,
    }))
  const notes: RelaySource[] = memos
    .filter((item) => item.isPinned)
    .map((item) => ({
      kind: 'memo' as const,
      id: item.id,
      label: '置顶备忘',
      updatedAt: item.updatedAt,
      content: snippet(item.content),
      href: '/memo',
    }))
  const confirmed: RelaySource[] = memories
    .filter((item) => item.status === 'confirmed' && !item.isDeleted)
    .map((item) => ({
      kind: 'memory' as const,
      id: item.id,
      label: '已确认记忆',
      updatedAt: item.updatedAt,
      content: snippet(item.content),
      href: '/memories',
    }))
  const sources = [...events, ...notes, ...confirmed]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 20)
  const generatedAt = now.toISOString()
  const lines = [
    '【仓鼠窝 · 跨窗口交接摘要】',
    `生成时间：${generatedAt}`,
    '说明：以下仅摘录现有记录，未自动核实真实性；若与新信息冲突，以重新核验为准。',
    ...sources.map((item, index) =>
      `${index + 1}. [${item.kind}:${item.id}] ${item.label}（更新：${item.updatedAt}）\n${item.content}`),
  ]
  if (sources.length === 0) lines.push('暂无可供交接的进行中事件、置顶备忘或已确认记忆。')
  return { generatedAt, sources, handoff: lines.join('\n\n') }
}
