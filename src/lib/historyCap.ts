/**
 * Pure bounds for the in-memory transcript. Long sessions otherwise grow the
 * per-agent message arrays and the global tool-result map without limit, which
 * costs memory and bloats rendering. These helpers keep both bounded while
 * preserving the store's immutable-update style.
 */

/** Returns the last `max` items, or the same array unchanged when under cap. */
export function capMessages<T>(list: readonly T[], max: number): readonly T[] {
  if (list.length <= max) return list;
  return list.slice(list.length - max);
}

/**
 * Returns a new record with `key=value` set, evicting the oldest
 * insertion-ordered key when the size would exceed `max`. Updating an existing
 * key never grows the record. Never mutates the input.
 */
export function capRecord<V>(
  record: Readonly<Record<string, V>>,
  key: string,
  value: V,
  max: number,
): Record<string, V> {
  // Updating an existing key: just copy + overwrite, no eviction.
  if (key in record) return { ...record, [key]: value };

  const keys = Object.keys(record);
  if (keys.length < max) return { ...record, [key]: value };

  // Over cap: drop the oldest keys so the result lands at exactly `max`.
  const evict = keys.length - max + 1;
  const next: Record<string, V> = {};
  for (const k of keys.slice(evict)) next[k] = record[k] as V;
  next[key] = value;
  return next;
}
