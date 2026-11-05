import assert from 'node:assert/strict'
const base = process.env.TEST_BASE_URL || 'http://localhost:3000'
for (const path of ['/', '/login']) {
  const response = await fetch(base + path)
  assert.equal(response.status, 200)
  assert.match(await response.text(), /Aula al Día/)
  console.log('PASS', path)
}
for (const path of ['/dashboard', '/dashboard/private', '/auth/confirm?token_hash=bad&type=invalid']) {
  const response = await fetch(base + path, { redirect: 'manual' })
  assert.equal(response.status, 307)
  assert.equal(new URL(response.headers.get('location'), base).pathname, '/login')
  console.log('PASS', path, 'redirect /login')
}
const response = await fetch(base + '/auth/signout', { method: 'POST', headers: { origin: 'https://untrusted.example' }, redirect: 'manual' })
assert.equal(response.status, 403)
console.log('PASS cross-origin signout blocked')
