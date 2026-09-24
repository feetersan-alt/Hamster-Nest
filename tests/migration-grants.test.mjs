import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

// Supabase 2026-10-30 起，public 里新建的表不再自动获得 Data API 权限：建表的那份迁移
// 必须自己 GRANT，否则新项目 / preview 分支 / 本地 db reset 建出来的表 PostgREST 一律 permission denied。
// 这条测试守住「建表与授权同一份迁移」：每个 create table public.X 所在文件里，
// 必须同时有一条针对 X 的 grant 给 service_role（MCP / Edge Function 走的角色）。
// authenticated 给多少权限由各表的策略面决定，这里不强求。

const MIGRATIONS_DIR = new URL('../supabase/migrations/', import.meta.url)

const CREATE_TABLE_RE =
  /\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?(?:(?:"?(?<schema>[a-z_][a-z_0-9]*)"?)\.)?"?(?<table>[a-z_][a-z_0-9]*)"?/gi
// `on table a, b to ...` 与 `on public.a to ...` 都算；function / schema / sequence 的 grant 会被下面的
// 标识符过滤掉（它们的对象名带括号或关键字，不会长得像一张表）。
const GRANT_RE = /\bgrant\s+[^;]*?\bon\s+(?:table\s+)?(?<targets>[^;]*?)\s+to\s+(?<roles>[^;]+);/gi
const TABLE_TOKEN_RE = /^(?:"?public"?\.)?"?([a-z_][a-z_0-9]*)"?$/i

function stripComments(sql) {
  return sql.replace(/--[^\n]*/g, '')
}

export function findPublicTablesMissingGrants(sql) {
  const body = stripComments(sql)
  const granted = new Map()
  for (const match of body.matchAll(GRANT_RE)) {
    const roles = match.groups.roles
      .split(',')
      .map((role) => role.trim().toLowerCase())
    for (const target of match.groups.targets.split(',')) {
      const token = target.trim().match(TABLE_TOKEN_RE)
      if (!token) continue
      const table = token[1].toLowerCase()
      const set = granted.get(table) ?? new Set()
      roles.forEach((role) => set.add(role))
      granted.set(table, set)
    }
  }
  const missing = []
  for (const match of body.matchAll(CREATE_TABLE_RE)) {
    const schema = (match.groups.schema ?? 'public').toLowerCase()
    if (schema !== 'public') continue
    const table = match.groups.table.toLowerCase()
    if (!granted.get(table)?.has('service_role')) missing.push(table)
  }
  return [...new Set(missing)]
}

test('every migration that creates a public table grants service_role in the same file', () => {
  const dir = MIGRATIONS_DIR.pathname
  const files = readdirSync(dir).filter((name) => name.endsWith('.sql')).sort()
  assert.ok(files.length > 0, 'no migrations found')
  const offenders = []
  for (const name of files) {
    const missing = findPublicTablesMissingGrants(readFileSync(join(dir, name), 'utf8'))
    if (missing.length) offenders.push(`${name}: ${missing.join(', ')}`)
  }
  assert.deepEqual(
    offenders,
    [],
    `public tables created without a service_role GRANT in the same migration:\n${offenders.join('\n')}`,
  )
})

test('detector flags a bare create table and accepts a granted one', () => {
  assert.deepEqual(findPublicTablesMissingGrants('create table public.foo (id int);'), ['foo'])
  assert.deepEqual(findPublicTablesMissingGrants('CREATE TABLE IF NOT EXISTS bar (id int);'), ['bar'])
  assert.deepEqual(
    findPublicTablesMissingGrants(
      'create table public.foo (id int);\ngrant select, insert on table public.foo to authenticated, service_role;',
    ),
    [],
  )
  assert.deepEqual(
    findPublicTablesMissingGrants('create table public.foo (id int);\ngrant select on public.foo to authenticated;'),
    ['foo'],
  )
  assert.deepEqual(
    findPublicTablesMissingGrants(
      'create table public.a (id int);\ncreate table public.b (id int);\n' +
        'grant select on public.a, public.b to authenticated;\n' +
        'grant select, insert, update, delete\n  on public.a, public.b\n  to service_role;',
    ),
    [],
  )
  assert.deepEqual(
    findPublicTablesMissingGrants(
      'create table public.foo (id int);\ngrant execute on function public.foo() to service_role;',
    ),
    ['foo'],
  )
  assert.deepEqual(findPublicTablesMissingGrants('create table app_private.secret (id int);'), [])
  assert.deepEqual(
    findPublicTablesMissingGrants('-- create table public.commented (id int);\ncreate table public.real (id int);'),
    ['real'],
  )
})
