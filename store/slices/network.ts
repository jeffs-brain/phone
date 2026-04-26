import type { Slice } from '../types'

export type NetworkStatus = 'unknown' | 'online' | 'offline'

export type SetNetworkStateInput = {
  readonly status: NetworkStatus
  readonly type: string | null
  readonly isInternetReachable: boolean | null
}

export type NetworkSlice = {
  networkStatus: NetworkStatus
  networkType: string | null
  isInternetReachable: boolean | null
  isNetworkAvailable: boolean
  setNetworkState: (input: SetNetworkStateInput) => void
}

export const createNetworkSlice: Slice<NetworkSlice> = (set) => ({
  networkStatus: 'unknown',
  networkType: null,
  isInternetReachable: null,
  isNetworkAvailable: true,

  setNetworkState: ({ status, type, isInternetReachable }) =>
    set({
      networkStatus: status,
      networkType: type,
      isInternetReachable,
      isNetworkAvailable: status !== 'offline',
    }, false, 'network/setNetworkState'),
})
