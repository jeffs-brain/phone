import type * as DocumentPicker from 'expo-document-picker'
import * as FileSystem from 'expo-file-system/legacy'
import type * as ImagePicker from 'expo-image-picker'
import * as ImageManipulator from 'expo-image-manipulator'

import type { ContentPart } from '../../store/types'

export type ImageContentPart = Extract<ContentPart, { type: 'image' }>
export type FileContentPart = Extract<ContentPart, { type: 'file' }>

const IMAGE_FILE_MAX_BYTES = 10 * 1024 * 1024
const VISION_IMAGE_MAX_SIDE = 1024
const VISION_IMAGE_QUALITY = 0.82
const TEXT_FILE_MAX_BYTES = 256 * 1024
const TEXT_FILE_EXTENSIONS = [
  '.txt',
  '.md',
  '.markdown',
  '.json',
  '.csv',
  '.tsv',
  '.xml',
  '.yaml',
  '.yml',
  '.log',
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.py',
  '.rb',
  '.go',
  '.rs',
  '.java',
  '.kt',
  '.swift',
  '.c',
  '.cpp',
  '.h',
  '.hpp',
  '.sql',
] as const

const SUPPORTED_LLAMA_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.bmp', '.gif'] as const
const SUPPORTED_LLAMA_IMAGE_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/bmp', 'image/gif'] as const

export const imagePartFromLibraryAsset = (asset: ImagePicker.ImagePickerAsset): ImageContentPart => ({
  type: 'image',
  uri: asset.uri,
  name: asset.fileName ?? undefined,
  mimeType: asset.mimeType ?? undefined,
  width: asset.width,
  height: asset.height,
})

export const imagePartFromDocumentAsset = (asset: DocumentPicker.DocumentPickerAsset): ImageContentPart => ({
  type: 'image',
  uri: asset.uri,
  name: asset.name,
  mimeType: asset.mimeType,
})

export const isSupportedLlamaImage = (part: ImageContentPart): boolean => {
  const mimeType = part.mimeType?.toLowerCase()
  if (
    mimeType !== undefined &&
    SUPPORTED_LLAMA_IMAGE_MIME_TYPES.some((supported) => supported === mimeType)
  ) {
    return true
  }

  const name = (part.name ?? part.uri).toLowerCase()
  return SUPPORTED_LLAMA_IMAGE_EXTENSIONS.some((extension) => name.endsWith(extension))
}

export const assertReadableLlamaImage = async (part: ImageContentPart): Promise<ImageContentPart> => {
  const info = await FileSystem.getInfoAsync(part.uri)
  if (!info.exists || info.isDirectory) {
    throw new Error('Selected image could not be read.')
  }
  if ('size' in info && typeof info.size === 'number' && info.size <= 0) {
    throw new Error('Selected image is empty.')
  }
  if ('size' in info && typeof info.size === 'number' && info.size > IMAGE_FILE_MAX_BYTES) {
    throw new Error(`Selected image is larger than ${Math.round(IMAGE_FILE_MAX_BYTES / 1024 / 1024)} MB.`)
  }
  if (!isSupportedLlamaImage(part)) {
    throw new Error('Choose a JPEG, PNG, BMP, or GIF image.')
  }
  return part
}

const normalisedImageName = (name: string | undefined): string => {
  if (name === undefined || name.trim() === '') return 'jeff-vision-image.jpg'
  return name.replace(/\.[^.]+$/, '') + '.jpg'
}

const resizeAction = (part: ImageContentPart): ImageManipulator.Action[] => {
  const width = part.width ?? 0
  const height = part.height ?? 0
  const longestSide = Math.max(width, height)
  if (longestSide <= VISION_IMAGE_MAX_SIDE || longestSide <= 0) return []

  const scale = VISION_IMAGE_MAX_SIDE / longestSide
  return [{
    resize: {
      width: Math.round(width * scale),
      height: Math.round(height * scale),
    },
  }]
}

export const normaliseImageForLlama = async (part: ImageContentPart): Promise<ImageContentPart> => {
  const readablePart = await assertReadableLlamaImage(part)
  const result = await ImageManipulator.manipulateAsync(
    readablePart.uri,
    resizeAction(readablePart),
    {
      compress: VISION_IMAGE_QUALITY,
      format: ImageManipulator.SaveFormat.JPEG,
    },
  )

  return assertReadableLlamaImage({
    type: 'image',
    uri: result.uri,
    name: normalisedImageName(readablePart.name),
    mimeType: 'image/jpeg',
    width: result.width,
    height: result.height,
  })
}

const isTextDocument = (asset: DocumentPicker.DocumentPickerAsset): boolean => {
  const mimeType = asset.mimeType?.toLowerCase()
  if (mimeType?.startsWith('text/') === true) return true
  if (
    mimeType === 'application/json' ||
    mimeType === 'application/xml' ||
    mimeType === 'application/yaml' ||
    mimeType === 'application/x-yaml' ||
    mimeType === 'text/markdown'
  ) {
    return true
  }

  const lowerName = asset.name.toLowerCase()
  return TEXT_FILE_EXTENSIONS.some((extension) => lowerName.endsWith(extension))
}

export const filePartFromDocument = async (asset: DocumentPicker.DocumentPickerAsset): Promise<FileContentPart> => {
  if (!isTextDocument(asset)) {
    throw new Error(`${asset.name} is not a text file Jeff can read yet.`)
  }

  if (asset.size !== undefined && asset.size > TEXT_FILE_MAX_BYTES) {
    throw new Error(`${asset.name} is larger than ${Math.round(TEXT_FILE_MAX_BYTES / 1024)} KB.`)
  }

  const info = await FileSystem.getInfoAsync(asset.uri)
  if (!info.exists || info.isDirectory) {
    throw new Error(`${asset.name} could not be read.`)
  }
  if ('size' in info && typeof info.size === 'number' && info.size > TEXT_FILE_MAX_BYTES) {
    throw new Error(`${asset.name} is larger than ${Math.round(TEXT_FILE_MAX_BYTES / 1024)} KB.`)
  }

  const text = await FileSystem.readAsStringAsync(asset.uri, {
    encoding: FileSystem.EncodingType.UTF8,
  })
  const trimmed = text.trim()
  if (trimmed === '') throw new Error(`${asset.name} is empty.`)

  return {
    type: 'file',
    name: asset.name,
    text: trimmed,
    uri: asset.uri,
    ...(asset.mimeType === undefined ? {} : { mimeType: asset.mimeType }),
    ...(asset.size === undefined ? {} : { size: asset.size }),
  }
}
