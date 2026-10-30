import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../supabase/client'
import { hasPendingCloudSync, isValidPetState, saveLocalJson, storageKeysFor } from './starIslandStorage'
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
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return INITIAL_STATE
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return INITIAL_STATE
    const { _pendingCloudSync: ignored, ...saved } = parsed as Record<string, unknown>
    void ignored
    return isValidPetState(saved) ? { ...INITIAL_STATE, ...saved } as PetState : INITIAL_STATE
  } catch {
    return INITIAL_STATE
  }
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

const StarIslandSession = ({ user }: StarIslandPageProps) => {
  const { pet: storageKey, diary: diaryKey } = storageKeysFor(user?.id ?? null)
  const [pet, setPet] = useState<PetState>(INITIAL_STATE)
  const [ready, setReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('星团正蜷在星窝里，等你来找它。')
  const [rename, setRename] = useState(INITIAL_STATE.name)
  const [diary, setDiary] = useState<string[]>(() => loadLocalDiary(diaryKey))

  useEffect(() => {
    try { window.localStorage.setItem(diaryKey, JSON.stringify(diary)) } catch { /* Storage may be disabled. */ }
  }, [diary, diaryKey])

  useEffect(() => {
    let cancelled = false
    const restore = async () => {
      const restoreLocal = () => {
        const cached = loadLocalState(storageKey)
        setPet(cached)
        setRename(cached.name)
      }
      try {
        if (user && supabase) {
          if (hasPendingCloudSync(storageKey)) {
            // Never overwrite unsynced local progress with an older cloud snapshot.
            const cached = loadLocalState(storageKey)
            if (cancelled) return
            setPet(cached)
            setRename(cached.name)
            const { error } = await supabase.from('pet_states').upsert({
              user_id: user.id,
              ...cached,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'user_id,pet_id' })
            if (cancelled) return
            if (error) {
              setMessage('已找回本地进度，但云端同步仍未成功；请稍后再试。')
            } else {
              saveLocalJson(storageKey, cached)
            }
          } else {
            const { data, error } = await supabase
              .from('pet_states')
              .select('pet_id,name,level,experience,hunger,joy,bond,stardust,star_candy,growth_stage,star_pattern')
              .eq('user_id', user.id)
              .eq('pet_id', INITIAL_STATE.pet_id)
              .maybeSingle()
            if (cancelled) return
            if (data && !error) {
              const restored = { ...INITIAL_STATE, ...data } as PetState
              setPet(restored)
              setRename(restored.name)
              saveLocalJson(storageKey, restored)
            } else {
              restoreLocal()
            }
          }
        } else {
          if (cancelled) return
          restoreLocal()
        }
      } catch (error) {
        if (!cancelled) {
          restoreLocal()
          setMessage('云端暂时不可用，已尝试找回本地进度。')
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
    // Store the pending marker atomically with the pet state. A failed cloud
    // write must not let a stale cloud snapshot replace newer local progress.
    const localSaved = saveLocalJson(storageKey, user ? { ...next, _pendingCloudSync: true } : next)
    if (!user || !supabase) {
      setMessage(localSaved ? '已保存在这台设备上；登录并配置云端存档后即可跨设备继续。' : '当前浏览器无法保存本地存档，请检查存储权限。')
      return
    }
    setSaving(true)
    try {
      const { error } = await supabase.from('pet_states').upsert({
        user_id: user.id,
        ...next,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,pet_id' })
      if (error) {
        setMessage(localSaved ? '本地已保存，但云端存档未成功写入。请稍后重试。' : '本地与云端存档均未成功，请检查存储权限或稍后重试。')
        console.error('[star-island] save failed', error)
      } else {
        if (localSaved) saveLocalJson(storageKey, next)
        setMessage('星团的成长已经保存到云端。')
      }
    } catch (error) {
      setMessage(localSaved ? '本地已保存，但云端暂不可用；下次进入会重试同步。' : '本地与云端均未保存成功，请稍后重试。')
      console.error('[star-island] save failed', error)
    } finally {
      setSaving(false)
    }
  }, [user, storageKey])

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
        <span className="star-island__save">{saving ? '存档中…' : user ? '云端存档' : '本地模式'}</span>
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
            <button onClick={() => act('feed')} disabled={saving || pet.star_candy <= 0}>🍬 喂星星糖</button>
            <button onClick={() => act('pet')} disabled={saving}>☁️ 摸摸云团</button>
            <button onClick={() => act('play')} disabled={saving}>✨ 追逐萤光</button>
            <button onClick={() => act('stay')} disabled={saving}>🌙 一起发呆</button>
          </div>
          <div className="star-island__rename"><label htmlFor="pet-name">给它取个新名字</label><div><input id="pet-name" value={rename} maxLength={16} onChange={event => setRename(event.target.value)} /><button onClick={saveName} disabled={saving}>记下名字</button></div></div>
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
