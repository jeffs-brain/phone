import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { AccessToken } from 'livekit-server-sdk'

const loadDotEnv = () => {
  const here = dirname(fileURLToPath(import.meta.url))
  const envPath = resolve(here, '..', '.env')
  if (!existsSync(envPath)) return

  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const separator = trimmed.indexOf('=')
    if (separator === -1) continue
    const key = trimmed.slice(0, separator).trim()
    const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '')
    if (key && process.env[key] === undefined) process.env[key] = value
  }
}

loadDotEnv()

const requiredEnv = (name) => {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

const json = (response, status, body) => {
  response.writeHead(status, {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'content-type': 'application/json',
  })
  response.end(JSON.stringify(body))
}

const tokenPayload = async () => {
  const roomName = `${process.env.VOICE_V2_ROOM_PREFIX ?? 'jeff-voice'}-${randomUUID()}`
  const identity = `phone-${randomUUID()}`
  const token = new AccessToken(requiredEnv('LIVEKIT_API_KEY'), requiredEnv('LIVEKIT_API_SECRET'), {
    identity,
    ttl: 10 * 60,
  })
  token.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  })

  return {
    serverUrl: requiredEnv('LIVEKIT_URL'),
    roomName,
    identity,
    token: await token.toJwt(),
  }
}

const server = createServer((request, response) => {
  if (request.method === 'OPTIONS') {
    json(response, 204, {})
    return
  }

  if (request.method !== 'GET' || request.url !== '/voice/livekit-token') {
    json(response, 404, { error: 'not_found' })
    return
  }

  tokenPayload()
    .then((payload) => json(response, 200, payload))
    .catch((error) => json(response, 500, {
      error: error instanceof Error ? error.message : String(error),
    }))
})

server.listen(Number(process.env.PORT ?? 8787), '0.0.0.0')
