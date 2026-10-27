import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

const helperSource = readFileSync(new URL('../src/pages/starIslandStorage.ts', import.meta.url), 'utf8')
const pageSource = readFileSync(new URL('../src/pages/StarIslandPage.tsx', import.meta.url), 'utf8')
const compiled = ts.transpileModule(helperSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
const { storageKeysFor, saveLocalJson, hasPendingCloudSync } = await import(`data:text/javascript,${encodeURIComponent(compiled)}`)

test('pet and diary cache keys are distinct for different accounts and guests', () => {
  const a = storageKeysFor('account-a')
  const b = storageKeysFor('account-b')
  const guest = storageKeysFor(null)
  assert.notEqual(a.pet, b.pet)
  assert.notEqual(a.diary, b.diary)
  assert.notEqual(a.pet, guest.pet)
  assert.notEqual(a.diary, guest.diary)
  assert.notEqual(a.pet, a.diary)
  assert.deepEqual(storageKeysFor('account-a'), a)
})

test('star island page uses scoped keys and remounts on account switch', () => {
  assert.match(pageSource, /<StarIslandSession key=\{user\?\.id \?\? 'guest'\} user=\{user\}/)
  assert.match(pageSource, /loadLocalState\(storageKey\)/)
  assert.match(pageSource, /saveLocalJson\(storageKey,/)
  assert.match(pageSource, /loadLocalDiary\(diaryKey\)/)
  assert.match(pageSource, /localStorage\.setItem\(diaryKey,/)
  assert.doesNotMatch(pageSource, /moonlight-garden-pet-state-v1/)
})

test('local cache write succeeds and serializes the state', () => {
  const calls = []
  const storage = { setItem: (key, value) => calls.push([key, value]) }
  assert.equal(saveLocalJson('pet', { name: '星团' }, () => storage), true)
  assert.deepEqual(calls, [['pet', JSON.stringify({ name: '星团' })]])
})

test('blocked storage does not interrupt cloud persistence', () => {
  const denied = () => { throw new Error('SecurityError: storage unavailable') }
  assert.equal(saveLocalJson('pet', { level: 2 }, denied), false)
  assert.equal(saveLocalJson('pet', { level: 2 }, () => ({ setItem: denied })), false)
  assert.match(pageSource, /_pendingCloudSync: true/)
  assert.match(pageSource, /hasPendingCloudSync\(storageKey\)/)
  assert.match(pageSource, /if \(localSaved\) saveLocalJson\(storageKey, next\)/)
})

test('pending cloud marker is stored with the pet and detected on reload', () => {
  const key = storageKeysFor('account-a').pet
  const state = { pet_id: 'xing-tuan', level: 4, _pendingCloudSync: true }
  const store = new Map()
  const storage = {
    setItem: (k, v) => store.set(k, v),
    getItem: k => store.get(k) ?? null,
  }
  assert.equal(saveLocalJson(key, state, () => storage), true)
  assert.equal(hasPendingCloudSync(key, () => storage), true)
  assert.equal(hasPendingCloudSync(storageKeysFor('account-b').pet, () => storage), false)
  assert.equal(saveLocalJson(key, { pet_id: 'xing-tuan', level: 4 }, () => storage), true)
  assert.equal(hasPendingCloudSync(key, () => storage), false)
})

test('blocked or malformed storage cannot crash pending detection', () => {
  const blocked = () => { throw new Error('SecurityError') }
  assert.equal(hasPendingCloudSync('pet', blocked), false)
  assert.equal(hasPendingCloudSync('pet', () => ({ getItem: () => '{invalid' })), false)
})

test('restore preserves pending local state and retries cloud upsert', () => {
  assert.match(pageSource, /if \(hasPendingCloudSync\(storageKey\)\)/)
  assert.match(pageSource, /const cached = loadLocalState\(storageKey\)/)
  assert.match(pageSource, /updated_at: new Date\(\)\.toISOString\(\)/)
  assert.match(pageSource, /const \{ _pendingCloudSync: ignored, \.\.\.saved \}/)
  assert.match(pageSource, /finally \{\s*if \(!cancelled\) setReady\(true\)/)
  assert.match(pageSource, /finally \{\s*setSaving\(false\)/)
})
