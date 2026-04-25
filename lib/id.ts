import * as Crypto from 'expo-crypto'

export const createId = (prefix: string): string => `${prefix}-${Crypto.randomUUID()}`
