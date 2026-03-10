import test from 'node:test'
import assert from 'node:assert/strict'

import { decodeJwtPayload, hasAdminClaim } from './auth-helpers.mjs'

function encodeBase64Url(value) {
  return Buffer.from(value, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function createJwt(payload) {
  const header = encodeBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = encodeBase64Url(JSON.stringify(payload))
  return `${header}.${body}.signature`
}

test('decodeJwtPayload returns the JWT payload object', () => {
  const token = createJwt({ sub: 'user-123', app_metadata: { is_admin: true } })

  assert.deepEqual(decodeJwtPayload(token), {
    sub: 'user-123',
    app_metadata: { is_admin: true },
  })
})

test('hasAdminClaim accepts a boolean admin flag from app_metadata', () => {
  const token = createJwt({ app_metadata: { is_admin: true } })

  assert.equal(hasAdminClaim(token), true)
})

test('hasAdminClaim rejects tokens without an admin flag', () => {
  const token = createJwt({ app_metadata: {} })

  assert.equal(hasAdminClaim(token), false)
})

test('hasAdminClaim accepts the string form used by some JWT serializers', () => {
  const token = createJwt({ app_metadata: { is_admin: 'true' } })

  assert.equal(hasAdminClaim(token), true)
})
