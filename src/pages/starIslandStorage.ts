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
