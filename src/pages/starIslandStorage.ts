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

/** Reject malformed or out-of-range local saves before they can replace cloud progress. */
export const isValidPetState = (value: unknown): boolean => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const state = value as Record<string, unknown>
  const integer = (key: string, min: number, max = Number.MAX_SAFE_INTEGER) =>
    typeof state[key] === 'number' && Number.isSafeInteger(state[key])
    && (state[key] as number) >= min && (state[key] as number) <= max

  return state.pet_id === 'xing-tuan'
    && typeof state.name === 'string' && state.name.trim().length > 0 && state.name.length <= 16
    && typeof state.growth_stage === 'string'
    && typeof state.star_pattern === 'string'
    && integer('level', 1)
    && integer('experience', 0)
    && integer('hunger', 0, 100)
    && integer('joy', 0, 100)
    && integer('bond', 0, 100)
    && integer('stardust', 0)
    && integer('star_candy', 0)
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
    return !!parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      && (parsed as Record<string, unknown>)._pendingCloudSync === true
      && isValidPetState(parsed)
  } catch {
    return false
  }
}
