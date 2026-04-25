import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import Constants from 'expo-constants'
import { Directory, File, Paths } from 'expo-file-system'
import * as FileSystem from 'expo-file-system/legacy'

import type { ModelId } from '../store/slices/inference'

const HASH_CHUNK_BYTES = 4 * 1024 * 1024
const VERIFY_YIELD_CHUNKS = 8
const DOWNLOAD_ATTEMPTS = 2
const MIN_FREE_SPACE_BUFFER_BYTES = 768 * 1024 * 1024

type AssetVerification = 'sha256' | 'size'

export type ModelAsset = {
  readonly filename: string
  readonly url: string
  readonly sizeBytes: number
  readonly sha256: string
}

export type ModelSpec = {
  readonly id: ModelId
  readonly label: string
  readonly model: ModelAsset
  readonly projector: ModelAsset
}

export type ModelDownloadStage = 'checking' | 'available' | 'downloading' | 'verifying' | 'downloaded'

export type ModelDownloadProgress = {
  readonly model: ModelSpec
  readonly assetLabel: 'LLM' | 'Projector'
  readonly bytesReceived: number
  readonly bytesExpected: number
  readonly stage: ModelDownloadStage
}

export type EnsuredModelAssets = {
  readonly modelPath: string
  readonly projectorPath: string
  readonly spec: ModelSpec
}

export type EnsuredModelFile = {
  readonly modelPath: string
  readonly spec: ModelSpec
}

export type EnsuredProjectorFile = {
  readonly projectorPath: string
  readonly spec: ModelSpec
}

type AssetManifest = {
  readonly filename: string
  readonly url: string
  readonly sizeBytes: number
  readonly sha256: string
  readonly verification: AssetVerification
}

const extra = Constants.expoConfig?.extra as Record<string, string | undefined> | undefined

const envValue = (key: string): string | undefined => process.env[key] ?? extra?.[key]

const assetUrl = (key: string, localKey: string, fallback: string): string =>
  envValue(localKey) ?? envValue(key) ?? fallback

const assetHash = (key: string, fallback: string): string => envValue(key) ?? fallback

const verificationMode = (): AssetVerification => {
  const value = envValue('EXPO_PUBLIC_MODEL_ASSET_VERIFICATION')
  if (value === 'strict') return 'sha256'
  if (value === 'sha256') return 'sha256'
  if (value === 'size') return 'size'
  if (value === 'fast') return 'size'
  return __DEV__ ? 'size' : 'sha256'
}

export const GEMMA_MODEL_SPECS = {
  'gemma-4-E2B': {
    id: 'gemma-4-E2B',
    label: 'Gemma 4 E2B',
    model: {
      filename: 'gemma-4-E2B-it-Q4_K_M.gguf',
      url: assetUrl(
        'EXPO_PUBLIC_GEMMA_E2B_GGUF_URL',
        'EXPO_PUBLIC_GEMMA_E2B_GGUF_LOCAL_URL',
        'https://huggingface.co/unsloth/gemma-4-E2B-it-GGUF/resolve/main/gemma-4-E2B-it-Q4_K_M.gguf',
      ),
      sizeBytes: 3_106_735_776,
      sha256: assetHash(
        'EXPO_PUBLIC_GEMMA_E2B_GGUF_SHA256',
        'ac0069ebccd39925d836f24a88c0f0c858d20578c29b21ab7cedce66ee576845',
      ),
    },
    projector: {
      filename: 'mmproj-gemma-4-E2B-it-BF16.gguf',
      url: assetUrl(
        'EXPO_PUBLIC_GEMMA_E2B_MMPROJ_URL',
        'EXPO_PUBLIC_GEMMA_E2B_MMPROJ_LOCAL_URL',
        'https://huggingface.co/unsloth/gemma-4-E2B-it-GGUF/resolve/main/mmproj-BF16.gguf',
      ),
      sizeBytes: 986_833_856,
      sha256: assetHash(
        'EXPO_PUBLIC_GEMMA_E2B_MMPROJ_SHA256',
        '5399938a59d07b2ad2c30a7e6e9e51519eab4f696f68eb7e9a0e0bc360b4af34',
      ),
    },
  },
  'gemma-4-E4B': {
    id: 'gemma-4-E4B',
    label: 'Gemma 4 E4B',
    model: {
      filename: 'gemma-4-E4B-it-Q4_K_M.gguf',
      url: assetUrl(
        'EXPO_PUBLIC_GEMMA_E4B_GGUF_URL',
        'EXPO_PUBLIC_GEMMA_E4B_GGUF_LOCAL_URL',
        'https://huggingface.co/unsloth/gemma-4-E4B-it-GGUF/resolve/main/gemma-4-E4B-it-Q4_K_M.gguf',
      ),
      sizeBytes: 4_977_169_088,
      sha256: assetHash(
        'EXPO_PUBLIC_GEMMA_E4B_GGUF_SHA256',
        'dff0ffba4c90b4082d70214d53ce9504a28d4d8d998276dcb3b8881a656c742a',
      ),
    },
    projector: {
      filename: 'mmproj-gemma-4-E4B-it-BF16.gguf',
      url: assetUrl(
        'EXPO_PUBLIC_GEMMA_E4B_MMPROJ_URL',
        'EXPO_PUBLIC_GEMMA_E4B_MMPROJ_LOCAL_URL',
        'https://huggingface.co/unsloth/gemma-4-E4B-it-GGUF/resolve/main/mmproj-BF16.gguf',
      ),
      sizeBytes: 991_552_448,
      sha256: assetHash(
        'EXPO_PUBLIC_GEMMA_E4B_MMPROJ_SHA256',
        '6d521435bed84c9aade3685f4bc3bce5898dec2b1f1d17f7452ebfaeedc375fb',
      ),
    },
  },
} as const satisfies Record<ModelId, ModelSpec>

const modelInFlight = new Map<ModelId, Promise<EnsuredModelFile>>()
const projectorInFlight = new Map<ModelId, Promise<EnsuredProjectorFile>>()
const assetsInFlight = new Map<ModelId, Promise<EnsuredModelAssets>>()

const modelsDirectory = (): Directory => new Directory(Paths.document, 'models')

const ensureModelsDirectory = (): Directory => {
  const directory = modelsDirectory()
  directory.create({ intermediates: true, idempotent: true })
  return directory
}

const assetFile = (asset: ModelAsset): File => new File(modelsDirectory(), asset.filename)

const manifestFile = (asset: ModelAsset): File => new File(modelsDirectory(), `${asset.filename}.manifest.json`)

const progress = (
  model: ModelSpec,
  assetLabel: 'LLM' | 'Projector',
  stage: ModelDownloadStage,
  bytesReceived: number,
  bytesExpected: number,
): ModelDownloadProgress => ({ model, assetLabel, stage, bytesReceived, bytesExpected })

const deleteFileIfExists = (file: File): void => {
  if (file.exists) file.delete()
}

const deleteManifestIfExists = (asset: ModelAsset): void => {
  deleteFileIfExists(manifestFile(asset))
}

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

const yieldToApp = (): Promise<void> => delay(0)

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const readManifest = (asset: ModelAsset): AssetManifest | null => {
  const file = manifestFile(asset)
  if (!file.exists) return null

  try {
    const parsed: unknown = JSON.parse(file.textSync())
    if (!isRecord(parsed)) return null
    if (
      parsed.filename !== asset.filename ||
      parsed.sizeBytes !== asset.sizeBytes ||
      parsed.sha256 !== asset.sha256
    ) {
      return null
    }

    if (parsed.verification !== 'sha256' && parsed.verification !== 'size') {
      return null
    }

    if (verificationMode() === 'sha256' && parsed.verification !== 'sha256') {
      return null
    }

    return parsed as AssetManifest
  } catch {
    return null
  }
}

const writeManifest = (asset: ModelAsset, verification: AssetVerification): void => {
  const manifest: AssetManifest = {
    filename: asset.filename,
    url: asset.url,
    sizeBytes: asset.sizeBytes,
    sha256: asset.sha256,
    verification,
  }
  const file = manifestFile(asset)
  if (!file.exists) file.create({ intermediates: true, overwrite: true })
  file.write(JSON.stringify(manifest))
}

const hashFileSha256 = async (file: File, onBytesRead?: (bytesRead: number) => void): Promise<string> => {
  const hasher = sha256.create()
  const handle = file.open()
  let bytesRead = 0
  let chunksRead = 0

  try {
    while (true) {
      const chunk = handle.readBytes(HASH_CHUNK_BYTES)
      if (chunk.length === 0) break
      hasher.update(chunk)
      bytesRead += chunk.length
      chunksRead += 1
      onBytesRead?.(bytesRead)

      if (chunksRead % VERIFY_YIELD_CHUNKS === 0) {
        await yieldToApp()
      }
    }
  } finally {
    handle.close()
  }

  return bytesToHex(hasher.digest())
}

const isAvailable = (asset: ModelAsset): boolean => {
  const file = assetFile(asset)
  return file.exists && file.size === asset.sizeBytes && readManifest(asset) !== null
}

const verifyAsset = async (
  asset: ModelAsset,
  file: File,
  onBytesVerified?: (bytesVerified: number) => void,
): Promise<void> => {
  if (file.size !== asset.sizeBytes) {
    throw new Error(`${asset.filename} has ${file.size} bytes; expected ${asset.sizeBytes}.`)
  }

  const digest = await hashFileSha256(file, onBytesVerified)
  if (digest !== asset.sha256) {
    throw new Error(`${asset.filename} SHA-256 mismatch: got ${digest}, expected ${asset.sha256}.`)
  }
}

const assertEnoughSpaceForDownload = (asset: ModelAsset): void => {
  const available = Paths.availableDiskSpace
  const required = asset.sizeBytes + MIN_FREE_SPACE_BUFFER_BYTES

  if (available > 0 && available < required) {
    throw new Error(
      `${asset.filename} needs ${Math.ceil(required / 1024 / 1024)} MB free; only ${Math.floor(available / 1024 / 1024)} MB is available.`,
    )
  }
}

const verifyWithProgress = async (
  spec: ModelSpec,
  asset: ModelAsset,
  assetLabel: 'LLM' | 'Projector',
  file: File,
  onProgress?: (progress: ModelDownloadProgress) => void,
): Promise<AssetVerification> => {
  const mode = verificationMode()

  if (mode === 'size') {
    onProgress?.(progress(spec, assetLabel, 'verifying', asset.sizeBytes, asset.sizeBytes))
    if (file.size !== asset.sizeBytes) {
      throw new Error(`${asset.filename} has ${file.size} bytes; expected ${asset.sizeBytes}.`)
    }
    return 'size'
  }

  onProgress?.(progress(spec, assetLabel, 'verifying', 0, asset.sizeBytes))
  await verifyAsset(asset, file, (bytesVerified) => {
    onProgress?.(progress(spec, assetLabel, 'verifying', bytesVerified, asset.sizeBytes))
  })
  return 'sha256'
}

const recoverFinalAsset = async (
  spec: ModelSpec,
  asset: ModelAsset,
  assetLabel: 'LLM' | 'Projector',
  target: File,
  onProgress?: (progress: ModelDownloadProgress) => void,
): Promise<string | null> => {
  if (!target.exists) return null

  if (isAvailable(asset)) {
    onProgress?.(progress(spec, assetLabel, 'available', asset.sizeBytes, asset.sizeBytes))
    return target.uri
  }

  if (target.size !== asset.sizeBytes) {
    deleteFileIfExists(target)
    deleteManifestIfExists(asset)
    return null
  }

  try {
    const verification = await verifyWithProgress(spec, asset, assetLabel, target, onProgress)
    writeManifest(asset, verification)
    onProgress?.(progress(spec, assetLabel, 'available', asset.sizeBytes, asset.sizeBytes))
    return target.uri
  } catch (error) {
    deleteFileIfExists(target)
    deleteManifestIfExists(asset)
    throw error
  }
}

const recoverCompletePartial = async (
  spec: ModelSpec,
  asset: ModelAsset,
  assetLabel: 'LLM' | 'Projector',
  partial: File,
  target: File,
  onProgress?: (progress: ModelDownloadProgress) => void,
): Promise<string | null> => {
  if (!partial.exists) return null

  if (partial.size < asset.sizeBytes) {
    onProgress?.(progress(spec, assetLabel, 'downloading', partial.size, asset.sizeBytes))
    return null
  }

  if (partial.size > asset.sizeBytes) {
    deleteFileIfExists(partial)
    return null
  }

  try {
    const verification = await verifyWithProgress(spec, asset, assetLabel, partial, onProgress)
    deleteFileIfExists(target)
    partial.move(target)
    writeManifest(asset, verification)
    onProgress?.(progress(spec, assetLabel, 'downloaded', asset.sizeBytes, asset.sizeBytes))
    return target.uri
  } catch (error) {
    deleteFileIfExists(partial)
    deleteManifestIfExists(asset)
    throw error
  }
}

const downloadToPartial = async (
  spec: ModelSpec,
  asset: ModelAsset,
  assetLabel: 'LLM' | 'Projector',
  partial: File,
  onProgress?: (progress: ModelDownloadProgress) => void,
): Promise<void> => {
  deleteFileIfExists(partial)
  assertEnoughSpaceForDownload(asset)
  onProgress?.(progress(spec, assetLabel, 'downloading', 0, asset.sizeBytes))

  const download = FileSystem.createDownloadResumable(
    asset.url,
    partial.uri,
    {
      cache: false,
      sessionType: FileSystem.FileSystemSessionType.BACKGROUND,
    },
    (event) => {
      onProgress?.(
        progress(
          spec,
          assetLabel,
          'downloading',
          event.totalBytesWritten,
          event.totalBytesExpectedToWrite > 0 ? event.totalBytesExpectedToWrite : asset.sizeBytes,
        ),
      )
    },
  )

  const result = await download.downloadAsync()
  if (result === undefined) throw new Error(`${asset.filename} download was cancelled.`)
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`${asset.filename} download failed with HTTP ${result.status}.`)
  }
}

const ensureAsset = async (
  spec: ModelSpec,
  asset: ModelAsset,
  assetLabel: 'LLM' | 'Projector',
  onProgress?: (progress: ModelDownloadProgress) => void,
): Promise<string> => {
  ensureModelsDirectory()
  onProgress?.(progress(spec, assetLabel, 'checking', 0, asset.sizeBytes))

  const target = assetFile(asset)
  let lastError: unknown = null

  try {
    const recoveredTarget = await recoverFinalAsset(spec, asset, assetLabel, target, onProgress)
    if (recoveredTarget !== null) return recoveredTarget
  } catch (error) {
    lastError = error
  }

  const partial = new File(modelsDirectory(), `${asset.filename}.download`)
  try {
    const recoveredPartial = await recoverCompletePartial(spec, asset, assetLabel, partial, target, onProgress)
    if (recoveredPartial !== null) return recoveredPartial
  } catch (error) {
    lastError = error
  }

  for (let attempt = 1; attempt <= DOWNLOAD_ATTEMPTS; attempt += 1) {
    try {
      await downloadToPartial(spec, asset, assetLabel, partial, onProgress)
      const downloaded = await recoverCompletePartial(spec, asset, assetLabel, partial, target, onProgress)
      if (downloaded !== null) return downloaded
    } catch (error) {
      const recoveredAfterFailure = await recoverCompletePartial(spec, asset, assetLabel, partial, target, onProgress)
      if (recoveredAfterFailure !== null) return recoveredAfterFailure

      lastError = error
      if (attempt < DOWNLOAD_ATTEMPTS) {
        await delay(1000 * attempt)
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`${asset.filename} download failed.`)
}

const ensureModelFileInternal = async (
  spec: ModelSpec,
  onProgress?: (progress: ModelDownloadProgress) => void,
): Promise<EnsuredModelFile> => {
  const modelPath = await ensureAsset(spec, spec.model, 'LLM', onProgress)
  return { modelPath, spec }
}

const ensureProjectorFileInternal = async (
  spec: ModelSpec,
  onProgress?: (progress: ModelDownloadProgress) => void,
): Promise<EnsuredProjectorFile> => {
  const projectorPath = await ensureAsset(spec, spec.projector, 'Projector', onProgress)
  return { projectorPath, spec }
}

const ensureModelAssetsInternal = async (
  spec: ModelSpec,
  onProgress?: (progress: ModelDownloadProgress) => void,
): Promise<EnsuredModelAssets> => {
  const { modelPath } = await ensureModelFileInternal(spec, onProgress)
  const projectorPath = await ensureAsset(spec, spec.projector, 'Projector', onProgress)
  return { modelPath, projectorPath, spec }
}

export const ensureModelFile = (
  modelId: ModelId,
  onProgress?: (progress: ModelDownloadProgress) => void,
): Promise<EnsuredModelFile> => {
  const existing = modelInFlight.get(modelId)
  if (existing !== undefined) return existing

  const next = ensureModelFileInternal(GEMMA_MODEL_SPECS[modelId], onProgress).finally(() => {
    modelInFlight.delete(modelId)
  })
  modelInFlight.set(modelId, next)
  return next
}

export const ensureProjectorFile = (
  modelId: ModelId,
  onProgress?: (progress: ModelDownloadProgress) => void,
): Promise<EnsuredProjectorFile> => {
  const existing = projectorInFlight.get(modelId)
  if (existing !== undefined) return existing

  const next = ensureProjectorFileInternal(GEMMA_MODEL_SPECS[modelId], onProgress).finally(() => {
    projectorInFlight.delete(modelId)
  })
  projectorInFlight.set(modelId, next)
  return next
}

export const ensureModelAssets = (
  modelId: ModelId,
  onProgress?: (progress: ModelDownloadProgress) => void,
): Promise<EnsuredModelAssets> => {
  const existing = assetsInFlight.get(modelId)
  if (existing !== undefined) return existing

  const next = ensureModelAssetsInternal(GEMMA_MODEL_SPECS[modelId], onProgress).finally(() => {
    assetsInFlight.delete(modelId)
  })
  assetsInFlight.set(modelId, next)
  return next
}
