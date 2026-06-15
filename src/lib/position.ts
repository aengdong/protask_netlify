export const GAP = 1024

/** prev/next 사이 중간값. 간격 고갈 시 NaN 반환 → 호출자가 리밸런스. */
export function between(prev: number | undefined, next: number | undefined): number {
  if (prev === undefined && next === undefined) return GAP
  if (prev === undefined) return (next as number) - GAP
  if (next === undefined) return prev + GAP
  if (next - prev < 1e-6) return NaN
  return (prev + next) / 2
}

/** 리스트 전체를 GAP 간격으로 재배치한 position 배열 */
export function rebalanced(count: number): number[] {
  return Array.from({ length: count }, (_, i) => (i + 1) * GAP)
}
