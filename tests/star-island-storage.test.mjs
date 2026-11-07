import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

const helperSource = readFileSync(new URL('../src/pages/starIslandStorage.ts', import.meta.url), 'utf8')
const pageSource = readFileSync(new URL('../src/pages/StarIslandPage.tsx', import.meta.url), 'utf8')
const compiled = ts.transpileModule(helperSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
const { storageKeysFor, saveLocalJson, hasPendingCloudSync, readLocalPetCache, nextCloudUpdatedAt, isValidPetState, canWriteCloud } = await import(`data:text/javascript,${encodeURIComponent(compiled)}`)

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
  assert.match(pageSource, /readLocalPetCache\(storageKey\)/)
  assert.match(pageSource, /if \(localSaved\) saveLocalJson\(storageKey, next\)/)
})

test('pending cloud marker is stored with the pet and detected on reload', () => {
  const key = storageKeysFor('account-a').pet
  const state = { pet_id: 'xing-tuan', name: '星团', level: 4, experience: 8, hunger: 72, joy: 72, bond: 10, stardust: 3, star_candy: 3, growth_stage: '成长期', star_pattern: '第一道微光星纹', _pendingCloudSync: true }
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

test('corrupt pending cache never authorizes overwriting the cloud save', () => {
  const state = { pet_id: 'xing-tuan', name: '星团', level: 4, experience: 8, hunger: 72, joy: 72, bond: 10, stardust: 3, star_candy: 3, growth_stage: '成长期', star_pattern: '第一道微光星纹', _pendingCloudSync: true }
  const read = value => () => ({ getItem: () => JSON.stringify(value) })
  assert.equal(hasPendingCloudSync('pet', read({ _pendingCloudSync: true })), false)
  assert.equal(hasPendingCloudSync('pet', read({ ...state, pet_id: 'another-pet' })), false)
  assert.equal(hasPendingCloudSync('pet', read({ ...state, level: 'broken' })), false)
  assert.equal(hasPendingCloudSync('pet', read({ ...state, star_candy: null })), false)
  assert.equal(hasPendingCloudSync('pet', read(state)), true)
})


test('invalid local cache is rejected instead of displayed or synced over valid cloud data', () => {
  const valid = { pet_id: 'xing-tuan', name: '星团', level: 4, experience: 8, hunger: 72, joy: 72, bond: 10, stardust: 3, star_candy: 3, growth_stage: '成长期', star_pattern: '第一道微光星纹' }
  const pending = value => () => ({ getItem: () => JSON.stringify({ ...value, _pendingCloudSync: true }) })
  assert.equal(isValidPetState(valid), true)
  for (const invalid of [
    { ...valid, level: -1 },
    { ...valid, experience: -1 },
    { ...valid, hunger: 101 },
    { ...valid, bond: Number.POSITIVE_INFINITY },
    { ...valid, star_candy: 1.5 },
    { ...valid, name: '' },
    { ...valid, pet_id: 'other-pet' },
    { ...valid, stardust: -1 },
  ]) {
    assert.equal(isValidPetState(invalid), false)
    assert.equal(hasPendingCloudSync('pet', pending(invalid)), false)
  }
  assert.equal(hasPendingCloudSync('pet', pending(valid)), true)
  assert.match(pageSource, /isValidPetState\(saved\) \?/)
})

test('pending cache retains its cloud-version baseline without mixing metadata into pet state', () => {
  const key = storageKeysFor('account-a').pet
  const state = { pet_id: 'xing-tuan', name: '星团', level: 4, experience: 8, hunger: 72, joy: 72, bond: 10, stardust: 3, star_candy: 3, growth_stage: '成长期', star_pattern: '第一道微光星纹' }
  const store = new Map()
  const storage = {
    setItem: (k, v) => store.set(k, v),
    getItem: k => store.get(k) ?? null,
  }
  const baseline = '2026-11-06T12:00:00.000Z'
  assert.equal(saveLocalJson(key, { ...state, _pendingCloudSync: true, _cloudBaseUpdatedAt: baseline }, () => storage), true)
  const cached = readLocalPetCache(key, () => storage)
  assert.equal(cached?.pendingCloudSync, true)
  assert.equal(cached?.cloudBaseUpdatedAt, baseline)
  assert.deepEqual(cached?.state, state)

  assert.equal(saveLocalJson(key, { ...state, _pendingCloudSync: true, _cloudBaseUpdatedAt: null }, () => storage), true)
  assert.equal(readLocalPetCache(key, () => storage)?.cloudBaseUpdatedAt, null)
})

test('legacy pending cache without a valid cloud baseline is retained but cannot be auto-synced safely', () => {
  const key = 'pet'
  const state = { pet_id: 'xing-tuan', name: '星团', level: 4, experience: 8, hunger: 72, joy: 72, bond: 10, stardust: 3, star_candy: 3, growth_stage: '成长期', star_pattern: '第一道微光星纹' }
  const read = value => () => ({ getItem: () => JSON.stringify(value) })
  const legacy = readLocalPetCache(key, read({ ...state, _pendingCloudSync: true }))
  assert.equal(legacy?.pendingCloudSync, true)
  assert.equal(legacy?.cloudBaseUpdatedAt, undefined)
  const malformed = readLocalPetCache(key, read({ ...state, _pendingCloudSync: true, _cloudBaseUpdatedAt: 'not-a-date' }))
  assert.equal(malformed?.pendingCloudSync, true)
  assert.equal(malformed?.cloudBaseUpdatedAt, undefined)
})

test('next cloud version is strictly newer than its baseline even when the local clock has not advanced', () => {
  const baseline = '2026-11-06T12:00:00.123Z'
  const next = nextCloudUpdatedAt(baseline, Date.parse(baseline))
  assert.equal(next, '2026-11-06T12:00:00.124Z')
  assert.ok(Date.parse(next) > Date.parse(baseline))
  assert.ok(Date.parse(nextCloudUpdatedAt(null, 1000)) >= 1000)
})

test('pending restore and cloud writes use compare-and-swap rather than blind upsert', () => {
  assert.match(pageSource, /const localCache = readLocalPetCache\(storageKey\)/)
  assert.match(pageSource, /const baseUpdatedAt = localCache\.cloudBaseUpdatedAt/)
  assert.match(pageSource, /if \(baseUpdatedAt === undefined\)/)
  assert.match(pageSource, /\.eq\('updated_at', baseUpdatedAt\)/)
  assert.match(pageSource, /\.insert\(payload\)/)
  assert.match(pageSource, /\.update\(payload\)/)
  assert.match(pageSource, /updated_at: nextVersion/)
  assert.match(pageSource, /else if \(!data\)/)
  assert.doesNotMatch(pageSource, /\.upsert\(/)
})

test('pet_states migration grants browser access under RLS', () => {
  const migration = readFileSync(new URL('../supabase/migrations/20261018000000_create_pet_states.sql', import.meta.url), 'utf8')
  assert.match(migration, /alter table public\.pet_states enable row level security;/i)
  assert.match(migration, /revoke all on table public\.pet_states from anon;/i)
  assert.match(migration, /grant select, insert, update, delete on table public\.pet_states to authenticated;/i)
  assert.match(migration, /with check \(auth\.uid\(\) = user_id\)/i)
})

test('authenticated cloud writes require a known cloud state or a pending sync', () => {
  assert.equal(canWriteCloud({ authenticated: false, cloudStateKnown: false, pendingSync: false }), true)
  assert.equal(canWriteCloud({ authenticated: true, cloudStateKnown: false, pendingSync: false }), false)
  assert.equal(canWriteCloud({ authenticated: true, cloudStateKnown: true, pendingSync: false }), true)
  assert.equal(canWriteCloud({ authenticated: true, cloudStateKnown: false, pendingSync: true }), true)
  assert.match(pageSource, /if \(user && !cloudWriteReady\)/)
  assert.match(pageSource, /只读模式/)
  assert.match(pageSource, /disabled=\{saving \|\| \(!!user && !cloudWriteReady\) \|\| pet\.star_candy <= 0\}/)
  assert.match(pageSource, /disabled=\{saving \|\| \(!!user && !cloudWriteReady\)\}/)
})
