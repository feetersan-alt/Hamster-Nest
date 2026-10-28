// Never reuse a guest or another account's pet and diary cache.
export const storageKeysFor = (userId: string | null) => {
  const scope = userId ?? 'guest'
  return {
    pet: `moonlight-garden-pet-state-v2:${scope}`,
    diary: `moonlight-garden-diary-v1:${scope}`,
  }
}

/** Keep cloud saving functional when browser storage is unavailable or blocked. */
export const saveLocalJson = (
  key: string,
  value: unknown,
  getStorage: () => Pick<Storage, 'setItem'> = () => window.localStorage,
): boolean => {
  try {
    getStorage().setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

/** A locally saved pet can be newer than the last successful cloud write. */
export const hasPendingCloudSync = (
  key: string,
  getStorage: () => Pick<Storage, 'getItem'> = () => window.localStorage,
): boolean => {
  try {
    const raw = getStorage().getItem(key)
    if (!raw) return false
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false
    const state = parsed as Record<string, unknown>
    // A broken pending marker must never replace a valid cloud save with defaults.
    return state._pendingCloudSync === true
      && state.pet_id === 'xing-tuan'
      && typeof state.name === 'string'
      && typeof state.growth_stage === 'string'
      && typeof state.star_pattern === 'string'
      && ['level', 'experience', 'hunger', 'joy', 'bond', 'stardust', 'star_candy']
        .every(field => typeof state[field] === 'number' && Number.isFinite(state[field]))
  } catch {
    return false
  }
}
