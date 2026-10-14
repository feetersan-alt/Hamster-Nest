import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const overview = read('../src/pages/OverviewPage.tsx')
const app = read('../src/App.tsx')
const home = read('../src/pages/HomePage.tsx')

test('overview uses existing authenticated read-only data queries', () => {
  for (const name of ['listTodoDashboard', 'listMemoEntries', 'listEventThreads', 'listTimelineEntriesByMonth']) {
    assert.match(overview, new RegExp(name + '\\('))
  }
  assert.doesNotMatch(overview, /(?:create|update|delete)(?:Todo|Memo|Event|Timeline)/)
})

test('overview route is behind the existing auth guard', () => {
  assert.match(app, /path="\/overview"[\s\S]*?<RequireAuth ready=\{authReady\} user=\{user\}>[\s\S]*?<OverviewPage \/>/)
})

test('home page exposes overview icon and route', () => {
  assert.match(home, /id: "overview", defaultEmoji: "[^"]+", label: "生活总览", route: "\/overview"/)
  assert.match(home, /DEFAULT_PAGE2_ICON_ORDER = \["overview"/)
})

test('overview shows loading, empty state and retry controls', () => {
  assert.match(overview, /正在读取记录/)
  assert.match(overview, /暂无近期待办/)
  assert.match(overview, /暂无进行中的事件线/)
  assert.match(overview, /暂无备忘录/)
  assert.match(overview, /本月暂无时间轴记录/)
  assert.match(overview, /重试/)
})
