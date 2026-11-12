import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { ADMIN_PASSWORD, imageBlob, loginAs, startServer } from './helpers.js'

let server
let baseUrl
before(async () => { server = await startServer(); baseUrl = server.baseUrl })
after(() => server?.stop())

const admin = () => loginAs(baseUrl, 'admin', ADMIN_PASSWORD)
const me = async (client) => (await client.call('GET', '/api/auth/me')).json.user

async function uploadAvatar(client, blob, name = 'me.png') {
  const form = new FormData()
  form.append('image', blob, name)
  return client.call('POST', '/api/auth/avatar', form)
}

describe('user avatar', () => {
  test('starts empty and anonymous requests are refused', async () => {
    const client = await admin()
    assert.equal((await me(client)).avatar, '')
    assert.equal((await fetch(`${baseUrl}/api/auth/avatar`, { method: 'PUT' })).status, 401)
    assert.equal((await fetch(`${baseUrl}/api/users/anyone/avatar`)).status, 401)
  })

  test('choosing a preset is saved; unknown presets are refused', async () => {
    const client = await admin()
    const ok = await client.call('PUT', '/api/auth/avatar', { preset: 'helmet-yellow' })
    assert.equal(ok.status, 200)
    assert.equal(ok.json.user.avatar, 'preset:helmet-yellow')
    assert.equal((await me(client)).avatar, 'preset:helmet-yellow')
    assert.equal((await client.call('PUT', '/api/auth/avatar', { preset: 'not-a-preset' })).status, 400)
    assert.equal((await client.call('PUT', '/api/auth/avatar', {})).status, 400)
    assert.equal((await me(client)).avatar, 'preset:helmet-yellow')
  })

  test('uploading a photo stores it and serves it back to signed-in users', async () => {
    const client = await admin()
    const result = await uploadAvatar(client, await imageBlob())
    assert.equal(result.status, 200, JSON.stringify(result.json))
    const avatar = result.json.user.avatar
    assert.match(avatar, /^photo:[0-9a-f-]+\.jpg$/)
    const served = await fetch(`${baseUrl}/api/users/${result.json.user.id}/avatar`, { headers: { cookie: client.cookie } })
    assert.equal(served.status, 200)
    assert.match(served.headers.get('content-type'), /image\/jpeg/)
    assert.ok((await served.arrayBuffer()).byteLength > 50)
    assert.equal((await fetch(`${baseUrl}/api/users/${result.json.user.id}/avatar`)).status, 401)
  })

  test('files that are not real images, or are too large, are refused and change nothing', async () => {
    const client = await admin()
    const before = (await me(client)).avatar
    const fake = await uploadAvatar(client, new Blob(['not an image'], { type: 'image/png' }), 'fake.png')
    assert.equal(fake.status, 400)
    const wrongType = await uploadAvatar(client, new Blob(['hello'], { type: 'text/plain' }), 'x.txt')
    assert.equal(wrongType.status, 400)
    const huge = await uploadAvatar(client, new Blob([new Uint8Array(5 * 1024 * 1024)], { type: 'image/png' }), 'big.png')
    assert.equal(huge.status, 400)
    assert.equal((await me(client)).avatar, before)
  })

  test('replacing the photo or picking a preset removes the old file; deleting clears the avatar', async () => {
    const client = await admin()
    const first = (await uploadAvatar(client, await imageBlob())).json.user
    const second = (await uploadAvatar(client, await imageBlob())).json.user
    assert.notEqual(first.avatar, second.avatar)
    const preset = await client.call('PUT', '/api/auth/avatar', { preset: 'engineer-white' })
    assert.equal(preset.json.user.avatar, 'preset:engineer-white')
    assert.equal((await fetch(`${baseUrl}/api/users/${first.id}/avatar`, { headers: { cookie: client.cookie } })).status, 404)
    const cleared = await client.call('DELETE', '/api/auth/avatar')
    assert.equal(cleared.status, 200)
    assert.equal(cleared.json.user.avatar, '')
  })
})
