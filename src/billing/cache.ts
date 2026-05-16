export interface ProCacheEntry {
  active: boolean
  currentPeriodEnd: number | null
  updatedAt: number
}

const cache = new Map<string, ProCacheEntry>()

export function setProCache(
  framerUserId: string,
  active: boolean,
  currentPeriodEnd: number | null,
): void {
  cache.set(framerUserId, {
    active,
    currentPeriodEnd,
    updatedAt: Date.now(),
  })
}

export function getProCache(framerUserId: string): ProCacheEntry | undefined {
  return cache.get(framerUserId)
}

export function clearProCache(framerUserId: string): void {
  cache.delete(framerUserId)
}
