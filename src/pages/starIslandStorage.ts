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
  const integer = (key: string, min: number, max = Number.MAX_SAFE_INTEGER) => {
    const value = state[key]
    return typeof value === 'number' && Number.isSafeInteger(value)
      && value >= min && value <= max
  }

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

export type LocalPetCache = {
  state: Record<string, unknown>
  pendingCloudSync: boolean
  cloudBaseUpdatedAt: string | null | undefined
}

const isValidCloudBaseUpdatedAt = (value: unknown): value is string =>
  typeof value === 'string' && Number.isFinite(Date.parse(value))

/** Read a validated local snapshot and its cloud-version baseline. */
export const readLocalPetCache = (
  key: string,
  getStorage: () => Pick<Storage, 'getItem'> = () => window.localStorage,
): LocalPetCache | null => {
  try {
    const raw = getStorage().getItem(key)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null

    const record = parsed as Record<string, unknown>
    const { _pendingCloudSync, _cloudBaseUpdatedAt, ...state } = record
    if (!isValidPetState(state)) return null

    const hasBaseline = Object.prototype.hasOwnProperty.call(record, '_cloudBaseUpdatedAt')
    const cloudBaseUpdatedAt = !hasBaseline
      ? undefined
      : _cloudBaseUpdatedAt === null
        ? null
        : isValidCloudBaseUpdatedAt(_cloudBaseUpdatedAt)
          ? _cloudBaseUpdatedAt
          : undefined

    return {
      state,
      pendingCloudSync: _pendingCloudSync === true,
      cloudBaseUpdatedAt,
    }
  } catch {
    return null
  }
}

/** Keep the pending flag check tolerant of blocked or malformed browser storage. */
export const hasPendingCloudSync = (
  key: string,
  getStorage: () => Pick<Storage, 'getItem'> = () => window.localStorage,
): boolean => readLocalPetCache(key, getStorage)?.pendingCloudSync ?? false

/** Produce a version strictly newer than the baseline, even if the local clock has not advanced. */
export const nextCloudUpdatedAt = (baseUpdatedAt: string | null, now = Date.now()): string => {
  const baseTime = baseUpdatedAt === null ? Number.NEGATIVE_INFINITY : Date.parse(baseUpdatedAt)
  const minimum = Number.isFinite(baseTime) ? baseTime + 1 : 0
  return new Date(Math.max(now, minimum)).toISOString()
}

/** A signed-in save is safe only after a successful cloud read or a known pending write. */
export const canWriteCloud = ({
  authenticated,
  cloudStateKnown,
  pendingSync,
}: {
  authenticated: boolean
  cloudStateKnown: boolean
  pendingSync: boolean
}): boolean => !authenticated || cloudStateKnown || pendingSync
