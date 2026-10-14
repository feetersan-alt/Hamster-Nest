import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const relay = read('../src/utils/memoryRelay.ts')
const page = read('../src/pages/MemoryRelayPage.tsx')
const app = read('../src/App.tsx')
const home = read('../src/pages/HomePage.tsx')

test('relay includes source identifiers and timestamps', () => {
  assert.match(relay, /item\.kind}:\$\{item\.id}/)
  assert.match(relay, /item\.updatedAt/)
  assert.match(relay, /仅摘录现有记录/)
})
test('relay excludes unconfirmed memories and non-active events', () => {
  assert.match(relay, /item\.status === 'confirmed' && !item\.isDeleted/)
  assert.match(relay, /item\.status === 'active'/)
  assert.match(relay, /item\.isPinned/)
})
test('relay page only reads existing data and offers explicit copy', () => {
  for (const name of ['listEventThreads', 'listMemoEntries', 'listMemories']) assert.match(page, new RegExp(name + '\\('))
  assert.match(page, /navigator\.clipboard\.writeText\(handoff\)/)
  assert.doesNotMatch(page, /createMemory|updateMemory|deleteMemory/)
})
test('relay route is authenticated and linked from home', () => {
  assert.match(app, /path="\/memory-relay"[\s\S]*?<RequireAuth ready=\{authReady\} user=\{user\}>[\s\S]*?<MemoryRelayPage \/>/)
  assert.match(home, /id: "memory-relay"[\s\S]*?route: "\/memory-relay"/)
})
