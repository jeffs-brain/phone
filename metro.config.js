const { getDefaultConfig } = require('@expo/metro-config')
const path = require('path')

const memoryPackage = path.resolve(__dirname, '../memory/sdks/rn/memory')

const config = getDefaultConfig(__dirname)

config.watchFolders = [memoryPackage]

config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
  path.resolve(memoryPackage, 'node_modules'),
]

module.exports = config
