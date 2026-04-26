import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { AccessToken } from 'livekit-server-sdk'

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
