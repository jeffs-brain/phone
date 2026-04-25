import '../global.css'

import { useEffect } from 'react'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import { readRuntimeMarker, clearRuntimeMarker, describeRuntimeMarker } from '../services/runtime-marker'
import { storeApi } from '../store'

export default function RootLayout() {
  useEffect(() => {
    void readRuntimeMarker()
      .then(async (marker) => {
        if (marker === null) return
        const state = storeApi.get()
        state._setModelId(marker.modelId)
        state._setModelError(describeRuntimeMarker(marker))
        state._setModelStatus('error')
        await clearRuntimeMarker()
      })
      .catch(() => undefined)
  }, [])

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: '#0a0a0f' },
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
