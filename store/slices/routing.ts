import type { RouteDecision, Slice } from '../types'

export type RoutingSlice = {
  lastDecision: RouteDecision | null
  setLastDecision: (decision: RouteDecision) => void
  clearLastDecision: () => void
}

export const createRoutingSlice: Slice<RoutingSlice> = (set) => ({
  lastDecision: null,
  setLastDecision: (lastDecision) => set({ lastDecision }, false, 'routing/setLastDecision'),
  clearLastDecision: () => set({ lastDecision: null }, false, 'routing/clearLastDecision'),
})
