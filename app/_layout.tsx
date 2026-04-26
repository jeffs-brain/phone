import '../global.css'

import { useEffect } from 'react'
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import {
  readRuntimeMarker,
  clearRuntimeMarker,
  describeRuntimeMarker,
  disableGemmaVision,
  disableMultimodalGpu,
} from '../services/runtime-marker'
import { storeApi } from '../store'
import type { NetworkStatus } from '../store/slices/network'

const networkStatusFromState = (state: NetInfoState): NetworkStatus => {
  if (state.isConnected === false || state.isInternetReachable === false) return 'offline'
  if (state.isConnected === true) return 'online'
  return 'unknown'
}

const updateNetworkState = (state: NetInfoState): void => {
  storeApi.get().setNetworkState({
    status: networkStatusFromState(state),
    type: state.type,
    isInternetReachable: state.isInternetReachable,
  })
}

export default function RootLayout() {
  useEffect(() => {
    void NetInfo.fetch().then(updateNetworkState).catch(() => undefined)
    return NetInfo.addEventListener(updateNetworkState)
  }, [])

  useEffect(() => {
    void readRuntimeMarker()
      .then(async (marker) => {
        if (marker === null) return
        if (marker.stage === 'projector-load') {
          await disableMultimodalGpu()
          await disableGemmaVision()
        }
        const state = storeApi.get()
        state._setModelId(marker.modelId)
        state._setModelError(describeRuntimeMarker(marker))
        state._setModelStatus('error')
        state._setGenerationStatus('idle')
        state._setAbortController(null)
        await clearRuntimeMarker()
      })
      .catch(() => undefined)
  }, [])

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: '#FAF7F5' },
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
          <Stack.Screen name="memories" options={{ presentation: 'modal' }} />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
