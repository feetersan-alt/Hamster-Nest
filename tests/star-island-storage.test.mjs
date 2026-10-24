import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

const helperSource = readFileSync(new URL('../src/pages/starIslandStorage.ts', import.meta.url), 'utf8')
const pageSource = readFileSync(new URL('../src/pages/StarIslandPage.tsx', import.meta.url), 'utf8')
const compiled = ts.transpileModule(helperSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
const { storageKeysFor } = await import(`data:text/javascript,${encodeURIComponent(compiled)}`)

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
  assert.match(pageSource, /localStorage\.setItem\(storageKey,/)
  assert.match(pageSource, /loadLocalDiary\(diaryKey\)/)
  assert.match(pageSource, /localStorage\.setItem\(diaryKey,/)
  assert.doesNotMatch(pageSource, /moonlight-garden-pet-state-v1/)
})
