export type Listener<T> = (payload: T) => void;

/** 아주 작은 타입 안전 이벤트 emitter. React 쪽 구독 해제를 위해 off 함수를 돌려준다 */
export class Emitter<Events extends Record<string, unknown>> {
  private listeners = new Map<keyof Events, Set<Listener<unknown>>>();

  on<K extends keyof Events>(key: K, fn: Listener<Events[K]>): () => void {
    let set = this.listeners.get(key);
    if (!set) {
      set = new Set();
      this.listeners.set(key, set);
    }
    const target = set;
    target.add(fn as Listener<unknown>);
    return () => {
      target.delete(fn as Listener<unknown>);
    };
  }

  emit<K extends keyof Events>(key: K, payload: Events[K]): void {
    const set = this.listeners.get(key);
    if (!set) return;
    for (const fn of Array.from(set)) fn(payload);
  }

  clear(): void {
    this.listeners.clear();
  }
}
