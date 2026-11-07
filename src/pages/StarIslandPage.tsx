import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../supabase/client'
import { nextCloudUpdatedAt, readLocalPetCache, saveLocalJson, storageKeysFor } from './starIslandStorage'
import './StarIslandPage.css'

type PetState = {
  pet_id: string
  name: string
  level: number
  experience: number
  hunger: number
  joy: number
  bond: number
  stardust: number
  star_candy: number
  growth_stage: string
  star_pattern: string
}

type StarIslandPageProps = { user: User | null }

const INITIAL_STATE: PetState = {
  pet_id: 'xing-tuan',
  name: '星团',
  level: 1,
  experience: 0,
  hunger: 72,
  joy: 72,
  bond: 10,
  stardust: 3,
  star_candy: 3,
  growth_stage: '初生期',
  star_pattern: '尚未显现',
}

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value))
const loadLocalState = (key: string): PetState => {
  const cached = readLocalPetCache(key)
  return cached ? { ...INITIAL_STATE, ...cached.state } as PetState : INITIAL_STATE
}

const FIRST_DIARY_ENTRY = '第一次见面：星团把星星糖吃了一半，另一半紧紧抱在怀里。'
const loadLocalDiary = (key: string): string[] => {
  try {
    const raw = window.localStorage.getItem(key)
    const entries: unknown = raw ? JSON.parse(raw) : null
    return Array.isArray(entries) && entries.every(entry => typeof entry === 'string')
      ? entries.slice(0, 6)
      : [FIRST_DIARY_ENTRY]
  } catch {
    return [FIRST_DIARY_ENTRY]
  }
}

const writeCloudSnapshot = async (
  userId: string,
  state: PetState,
  baseUpdatedAt: string | null,
) => {
  if (!supabase) throw new Error('Supabase client is unavailable')
  const nextVersion = nextCloudUpdatedAt(baseUpdatedAt)
  const payload = { user_id: userId, ...state, updated_at: nextVersion }

  if (baseUpdatedAt === null) {
    const { data, error } = await supabase
      .from('pet_states')
      .insert(payload)
      .select('updated_at')
      .maybeSingle()
    return { data, error, nextVersion: data?.updated_at ?? nextVersion }
  }

  const { data, error } = await supabase
    .from('pet_states')
    .update(payload)
    .eq('user_id', userId)
    .eq('pet_id', state.pet_id)
    .eq('updated_at', baseUpdatedAt)
    .select('updated_at')
    .maybeSingle()
  return { data, error, nextVersion: data?.updated_at ?? nextVersion }
}

const StarIslandSession = ({ user }: StarIslandPageProps) => {
  const { pet: storageKey, diary: diaryKey } = storageKeysFor(user?.id ?? null)
  const [pet, setPet] = useState<PetState>(INITIAL_STATE)
  const [ready, setReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [cloudWriteReady, setCloudWriteReady] = useState(!user)
  const [cloudBaseUpdatedAt, setCloudBaseUpdatedAt] = useState<string | null>(null)
  const [message, setMessage] = useState('星团正蜷在星窝里，等你来找它。')
  const [rename, setRename] = useState(INITIAL_STATE.name)
  const [diary, setDiary] = useState<string[]>(() => loadLocalDiary(diaryKey))

  useEffect(() => {
    try { window.localStorage.setItem(diaryKey, JSON.stringify(diary)) } catch { /* Storage may be disabled. */ }
  }, [diary, diaryKey])

  useEffect(() => {
    let cancelled = false
    const restore = async () => {
      const localCache = readLocalPetCache(storageKey)
      const restoreLocal = () => {
        const cached = loadLocalState(storageKey)
        setPet(cached)
        setRename(cached.name)
      }

      try {
        if (user && supabase) {
          if (localCache?.pendingCloudSync) {
            const cached = loadLocalState(storageKey)
            const baseUpdatedAt = localCache.cloudBaseUpdatedAt
            setPet(cached)
            setRename(cached.name)

            if (baseUpdatedAt === undefined) {
              setCloudWriteReady(false)
              setMessage('本地待同步进度缺少可信的云端版本基线，已保留在本机并进入只读模式，避免覆盖云端存档。')
              return
            }

            setCloudBaseUpdatedAt(baseUpdatedAt)
            setCloudWriteReady(false)
            const { data, error, nextVersion } = await writeCloudSnapshot(user.id, cached, baseUpdatedAt)
            if (cancelled) return
            if (error) {
              setCloudWriteReady(false)
              setMessage('本地待同步进度已保留，但云端同步失败；互动已暂停，刷新后会重新进行版本校验。')
              console.error('[star-island] pending sync failed', error)
            } else if (!data) {
              setCloudWriteReady(false)
              setMessage('云端存档已在其他设备更新或发生变化。本地进度仍保留，已停止自动覆盖。')
            } else {
              setCloudBaseUpdatedAt(nextVersion)
              setCloudWriteReady(true)
              saveLocalJson(storageKey, { ...cached, _cloudBaseUpdatedAt: nextVersion })
              setMessage('本地待同步进度已通过云端版本校验并同步。')
            }
          } else {
            const { data, error } = await supabase
              .from('pet_states')
              .select('pet_id,name,level,experience,hunger,joy,bond,stardust,star_candy,growth_stage,star_pattern,updated_at')
              .eq('user_id', user.id)
              .eq('pet_id', INITIAL_STATE.pet_id)
              .maybeSingle()
            if (cancelled) return
            if (error) {
              restoreLocal()
              setCloudWriteReady(false)
              setMessage('云端读取失败，已显示本地缓存；为避免覆盖云端进度，当前暂为只读模式。恢复连接后请刷新。')
            } else if (data) {
              const { updated_at: baseUpdatedAt, ...cloudState } = data
              const restored = { ...INITIAL_STATE, ...cloudState } as PetState
              setPet(restored)
              setRename(restored.name)
              setCloudBaseUpdatedAt(baseUpdatedAt)
              setCloudWriteReady(true)
              saveLocalJson(storageKey, { ...restored, _cloudBaseUpdatedAt: baseUpdatedAt })
            } else if (localCache) {
              const cached = loadLocalState(storageKey)
              setPet(cached)
              setRename(cached.name)
              if (localCache.cloudBaseUpdatedAt === null) {
                setCloudBaseUpdatedAt(null)
                setCloudWriteReady(true)
                saveLocalJson(storageKey, { ...cached, _cloudBaseUpdatedAt: null })
              } else {
                setCloudWriteReady(false)
                setMessage('云端目前没有存档，但本地缓存缺少“云端为空”的可信基线。已保留本地数据并进入只读模式。')
              }
            } else {
              setPet(INITIAL_STATE)
              setRename(INITIAL_STATE.name)
              setCloudBaseUpdatedAt(null)
              setCloudWriteReady(true)
              saveLocalJson(storageKey, { ...INITIAL_STATE, _cloudBaseUpdatedAt: null })
            }
          }
        } else {
          restoreLocal()
          setCloudWriteReady(!user)
          if (user) setMessage('云端存档服务未连接；已显示本地缓存，当前暂为只读模式。')
        }
      } catch (error) {
        if (!cancelled) {
          restoreLocal()
          if (user) setCloudWriteReady(false)
          setMessage(user
            ? '云端状态无法确认，已保留本地缓存并进入只读模式。恢复连接后刷新可重新校验。'
            : '本地存档暂时无法读取。')
          console.error('[star-island] restore failed', error)
        }
      } finally {
        if (!cancelled) setReady(true)
      }
    }
    void restore()
    return () => { cancelled = true }
  }, [user, storageKey])

  const persist = useCallback(async (next: PetState) => {
    if (user && !cloudWriteReady) {
      setMessage('云端状态尚未确认或存在版本冲突，已暂停互动，避免覆盖已有存档。')
      return
    }
    const localSaved = saveLocalJson(storageKey, user
      ? { ...next, _pendingCloudSync: true, _cloudBaseUpdatedAt: cloudBaseUpdatedAt }
      : next)
    if (!user || !supabase) {
      setMessage(localSaved ? '已保存在这台设备上；登录并配置云端存档后即可跨设备继续。' : '当前浏览器无法保存本地存档，请检查存储权限。')
      return
    }
    setSaving(true)
    try {
      const { data, error, nextVersion } = await writeCloudSnapshot(user.id, next, cloudBaseUpdatedAt)
      if (error) {
        setCloudWriteReady(false)
        setMessage(localSaved
          ? '本地待同步进度已保留，但云端写入失败；互动已暂停，刷新后会重新进行版本校验。'
          : '本地与云端存档均未确认成功；互动已暂停，请检查存储权限或稍后刷新。')
        console.error('[star-island] save failed', error)
      } else if (!data) {
        setCloudWriteReady(false)
        setMessage('云端存档版本已变化。本地进度仍保留，已停止自动覆盖，请先处理版本冲突。')
      } else {
        setCloudBaseUpdatedAt(nextVersion)
        setCloudWriteReady(true)
        if (localSaved) saveLocalJson(storageKey, { ...next, _cloudBaseUpdatedAt: nextVersion })
        setMessage('星团的成长已经通过版本校验保存到云端。')
      }
    } catch (error) {
      setCloudWriteReady(false)
      setMessage(localSaved
        ? '本地待同步进度已保留，但云端状态无法确认；互动已暂停，刷新后会重新进行版本校验。'
        : '本地与云端均未确认保存成功，请稍后刷新。')
      console.error('[star-island] save failed', error)
    } finally {
      setSaving(false)
    }
  }, [user, storageKey, cloudWriteReady, cloudBaseUpdatedAt])

  const act = useCallback((kind: 'feed' | 'pet' | 'play' | 'stay') => {
    let next: PetState
    let line = ''
    if (kind === 'feed') {
      if (pet.star_candy <= 0) {
        setMessage('星星糖吃完啦。先陪星团探索花园，找找新的星尘吧。')
        return
      }
      next = { ...pet, star_candy: pet.star_candy - 1, hunger: clamp(pet.hunger + 22), joy: clamp(pet.joy + 7), bond: clamp(pet.bond + 2), experience: pet.experience + 8 }
      line = '星团抱住星星糖，星核亮了一小会儿。'
    } else if (kind === 'pet') {
      next = { ...pet, joy: clamp(pet.joy + 10), bond: clamp(pet.bond + 4), experience: pet.experience + 5 }
      line = '你轻轻摸了摸云团，星团舒服得眯起眼睛。'
    } else if (kind === 'play') {
      next = { ...pet, hunger: clamp(pet.hunger - 8), joy: clamp(pet.joy + 16), bond: clamp(pet.bond + 3), stardust: pet.stardust + 1, experience: pet.experience + 12 }
      line = '星团追着萤光绕了花园一圈，捡到 1 点星尘。'
    } else {
      next = { ...pet, joy: clamp(pet.joy + 5), bond: clamp(pet.bond + 5), experience: pet.experience + 6 }
      line = '你们一起看了一会儿月亮。没有任务，只是待在一起。'
    }
    if (next.experience >= next.level * 30) {
      next = {
        ...next,
        experience: next.experience - next.level * 30,
        level: next.level + 1,
        growth_stage: next.level + 1 >= 5 ? '蜕变期' : '成长期',
        star_pattern: '第一道微光星纹',
      }
      line += ' 星核忽然闪亮——星团升级了！'
    }
    setPet(next)
    setMessage(line)
    setDiary(currentDiary => [line, ...currentDiary].slice(0, 6))
    void persist(next)
  }, [pet, persist])

  const saveName = () => {
    const name = rename.trim().slice(0, 16)
    if (!name) return
    const next = { ...pet, name }
    setPet(next)
    void persist(next)
    setMessage(`以后就叫你 ${name} 啦。`)
  }

  const meterStyle = (value: number): CSSProperties => ({ '--meter-value': `${value}%` } as CSSProperties)

  if (!ready) return <main className="star-island"><div className="star-island__loading">正在找回星团的记忆……</div></main>

  return (
    <main className="star-island">
      <div className="star-island__sky" aria-hidden="true"><i>✦</i><i>✧</i><i>·</i><i>✦</i><i>✧</i><i>·</i><i>✦</i></div>
      <header className="star-island__header">
        <a href="#/" className="star-island__back">← 回到小窝</a>
        <div><p className="star-island__eyebrow">MOONLIGHT GARDEN · PET JOURNAL</p><h1>月光花园</h1><p>每一段被认真记住的经历，都会成为星屿灵身上的微光。</p></div>
        <span className="star-island__save">{saving ? '存档中…' : user && !cloudWriteReady ? '只读恢复' : user ? '云端存档' : '本地模式'}</span>
      </header>

      <section className="star-island__hero glass-panel">
        <div className="star-island__scene">
          <div className="star-island__moon" />
          <div className="star-island__island" />
          <div className="star-island__pet" aria-label={pet.name}>
            <span className="star-island__pet-glow" />
            <span className="star-island__pet-star">✦</span>
            <span className="star-island__pet-face"><i /><i /><b>⌣</b></span>
            <span className="star-island__pet-name">{pet.name}</span>
          </div>
          <div className="star-island__floating-star star-a">✧</div><div className="star-island__floating-star star-b">✦</div><div className="star-island__floating-star star-c">·</div>
        </div>
        <div className="star-island__pet-info">
          <div className="star-island__level-row"><span className="star-island__stage">{pet.growth_stage}</span><span>LV. {pet.level}</span></div>
          <h2>{pet.name} <span>✧</span></h2>
          <p className="star-island__description">{pet.level < 2 ? '一团刚刚来到花园的柔软云朵，正在学习什么叫安心。' : '星核里有了新的光。它开始记得你们一起经历过的事。'}</p>
          <div className="star-island__xp"><div><span>成长进度</span><span>{pet.experience} / {pet.level * 30} XP</span></div><div className="star-island__track"><span style={{ width: `${Math.min(100, pet.experience / (pet.level * 30) * 100)}%` }} /></div></div>
          <div className="star-island__stats">
            <div><span>饱腹</span><strong>{pet.hunger}%</strong><div className="star-island__meter" style={meterStyle(pet.hunger)}><span /></div></div>
            <div><span>心情</span><strong>{pet.joy}%</strong><div className="star-island__meter" style={meterStyle(pet.joy)}><span /></div></div>
            <div><span>羁绊</span><strong>{pet.bond}%</strong><div className="star-island__meter" style={meterStyle(pet.bond)}><span /></div></div>
          </div>
          <div className="star-island__inventory"><span>✦ 星尘 <b>{pet.stardust}</b></span><span>糖果 <b>{pet.star_candy}</b></span><span>星纹 <b>{pet.star_pattern}</b></span></div>
        </div>
      </section>

      <section className="star-island__lower">
        <div className="star-island__panel glass-panel">
          <div className="star-island__panel-heading"><div><p className="star-island__eyebrow">SPEND A LITTLE TIME</p><h2>陪星团一会儿</h2></div><span>今天不用赶进度</span></div>
          <p className="star-island__message" role="status">{message}</p>
          <div className="star-island__actions">
            <button onClick={() => act('feed')} disabled={saving || (!!user && !cloudWriteReady) || pet.star_candy <= 0}>🍬 喂星星糖</button>
            <button onClick={() => act('pet')} disabled={saving || (!!user && !cloudWriteReady)}>☁️ 摸摸云团</button>
            <button onClick={() => act('play')} disabled={saving || (!!user && !cloudWriteReady)}>✨ 追逐萤光</button>
            <button onClick={() => act('stay')} disabled={saving || (!!user && !cloudWriteReady)}>🌙 一起发呆</button>
          </div>
          <div className="star-island__rename"><label htmlFor="pet-name">给它取个新名字</label><div><input id="pet-name" value={rename} maxLength={16} disabled={!!user && !cloudWriteReady} onChange={event => setRename(event.target.value)} /><button onClick={saveName} disabled={saving || (!!user && !cloudWriteReady)}>记下名字</button></div></div>
        </div>
        <aside className="star-island__panel glass-panel">
          <div className="star-island__panel-heading"><div><p className="star-island__eyebrow">LITTLE MEMORIES</p><h2>花园手记</h2></div><span>最近 6 条</span></div>
          <ol className="star-island__diary">{diary.map((entry, index) => <li key={`${index}-${entry}`}><span>✧</span>{entry}</li>)}</ol>
          <p className="star-island__note">下一步：把重要经历写入仓鼠窝事件线，并让星屿灵的外形随成长逐渐变化。</p>
        </aside>
      </section>
      <footer className="star-island__footer">星团 · 初生于月光花园 <span>✦</span> 每一次互动都会留下微小的回响</footer>
    </main>
  )
}

// Remount state when the signed-in account changes; never render the previous account's pet.
const StarIslandPage = ({ user }: StarIslandPageProps) => (
  <StarIslandSession key={user?.id ?? 'guest'} user={user} />
)

export default StarIslandPage
