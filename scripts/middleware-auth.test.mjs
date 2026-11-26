import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'

async function importEsmFromFile(relativePath) {
  const source = await fs.readFile(path.join(process.cwd(), relativePath), 'utf8')
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
  return import(moduleUrl)
}

const { config, default: middleware } = await importEsmFromFile('middleware.js')
const { default: authHandler, createSessionToken } = await importEsmFromFile('api/auth.js')

async function withEnv(overrides, callback) {
  const previous = new Map()
  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key])
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }

  try {
    await callback()
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  }
}

function matchesMiddleware(pathname) {
  return new RegExp(`^${config.matcher[0]}$`).test(pathname)
}

function invokeAuthHandler({ method = 'POST', headers = {}, body = {}, query = {}, remoteAddress = '127.0.0.1' } = {}) {
  const responseHeaders = new Map()
  let statusCode = 200
  let jsonBody
  let ended = false

  const res = {
    setHeader(name, value) {
      responseHeaders.set(name.toLowerCase(), value)
    },
    status(code) {
      statusCode = code
      return this
    },
    json(payload) {
      jsonBody = payload
      ended = true
      return this
    },
    end() {
      ended = true
      return this
    },
  }

  const req = {
    method,
    headers,
    body,
    query,
    socket: { remoteAddress },
  }

  authHandler(req, res)
  return { statusCode, headers: responseHeaders, body: jsonBody, ended }
}

function extractCookiePair(setCookieHeader) {
  const first = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader
  assert.equal(typeof first, 'string', 'Set-Cookie header should be present')
  return first.split(';')[0]
}

test('matcher sends every API path including dotted API paths through middleware and skips only known static paths', () => {
  for (const gatedPath of [
    '/',
    '/api',
    '/api/models',
    '/api/x.y',
    '/api/v1.0/models',
    '/api/v1.0/users',
    '/api/auth',
    '/api/authx',
    '/api/authentic',
    '/favicon.ico/bypass',
  ]) {
    assert.equal(matchesMiddleware(gatedPath), true, `${gatedPath} should match middleware`)
  }

  for (const staticPath of [
    '/_next/static/chunk.js',
    '/_next/image',
    '/favicon.ico',
    '/manifest.webmanifest',
    '/robots.txt',
    '/assets/app.js',
    '/pwa/icon-192.png',
  ]) {
    assert.equal(matchesMiddleware(staticPath), false, `${staticPath} should bypass middleware`)
  }
})

test('middleware bypasses only the exact auth endpoint and gates dotted API paths', async () => {
  await withEnv({ ACCESS_PASSWORD: 'test-secret-password' }, async () => {
    assert.equal(await middleware(new Request('https://example.com/api/auth')), undefined)

    for (const pathname of [
      '/api',
      '/api/models',
      '/api/x.y',
      '/api/v1.0/users',
      '/api/auth/',
      '/api/authx',
      '/api/authentic',
    ]) {
      const response = await middleware(new Request(`https://example.com${pathname}`))
      assert.equal(response?.status, 200, `${pathname} should require authentication`)
      assert.match(await response.text(), /Access Verification/)
    }
  })
})

test('middleware rejects plaintext password cookie, expired tokens, and tampered tokens', async () => {
  await withEnv({ ACCESS_PASSWORD: 'plaintext-password-123', ACCESS_SESSION_SECRET: undefined }, async () => {
    const plaintextReq = new Request('https://example.com/api/models', {
      headers: { cookie: 'vercel_access_token=plaintext-password-123' },
    })
    const plaintextRes = await middleware(plaintextReq)
    assert.equal(plaintextRes?.status, 200)
    assert.match(await plaintextRes.text(), /Access Verification/)

    const expiredToken = createSessionToken('plaintext-password-123', Date.now() - 8 * 24 * 60 * 60 * 1000)
    const expiredRes = await middleware(
      new Request('https://example.com/api/models', {
        headers: { cookie: `vercel_access_token=${expiredToken}` },
      })
    )
    assert.equal(expiredRes?.status, 200)
    assert.match(await expiredRes.text(), /Access Verification/)

    const validToken = createSessionToken('plaintext-password-123')
    const tamperedToken = `${validToken.slice(0, -1)}${validToken.endsWith('A') ? 'B' : 'A'}`
    const tamperedRes = await middleware(
      new Request('https://example.com/api/models', {
        headers: { cookie: `vercel_access_token=${tamperedToken}` },
      })
    )
    assert.equal(tamperedRes?.status, 200)
    assert.match(await tamperedRes.text(), /Access Verification/)
  })
})

test('api/auth issues HMAC-signed HttpOnly cookie accepted by middleware without leaking password or wildcard CORS', async () => {
  await withEnv(
    {
      ACCESS_PASSWORD: 'super-secret-passphrase',
      ACCESS_SESSION_SECRET: 'separate-hmac-signing-key',
      NODE_ENV: 'production',
    },
    async () => {
      const result = invokeAuthHandler({
        method: 'POST',
        headers: {
          host: 'example.com',
          origin: 'https://example.com',
          'x-forwarded-proto': 'https',
          'x-real-ip': '198.51.100.10',
        },
        body: { action: 'verify', password: 'super-secret-passphrase' },
      })

      assert.equal(result.statusCode, 200)
      assert.equal(result.body?.success, true)
      assert.equal(result.headers.get('access-control-allow-origin'), undefined)

      const setCookie = result.headers.get('set-cookie')
      assert.ok(Array.isArray(setCookie) && setCookie.length === 1)
      const cookieHeader = setCookie[0]
      assert.equal(cookieHeader.includes('super-secret-passphrase'), false, 'cookie must not contain plaintext password')
      assert.match(cookieHeader, /\bHttpOnly\b/)
      assert.match(cookieHeader, /\bSameSite=Strict\b/)
      assert.match(cookieHeader, /\bSecure\b/)

      const cookiePair = extractCookiePair(setCookie)
      const accepted = await middleware(
        new Request('https://example.com/api/v1.0/users', {
          headers: { cookie: cookiePair },
        })
      )
      assert.equal(accepted, undefined, 'middleware must accept token issued by api/auth')

      const logout = invokeAuthHandler({
        method: 'GET',
        headers: { 'x-forwarded-proto': 'https' },
        query: { action: 'logout' },
      })
      assert.equal(logout.statusCode, 200)
      assert.equal(logout.headers.get('access-control-allow-origin'), undefined)
      assert.match(logout.headers.get('set-cookie')[0], /Max-Age=0/)
      assert.match(logout.headers.get('set-cookie')[0], /\bSecure\b/)
    }
  )
})

test('api/auth sets Secure flag on HTTPS proxy requests even outside NODE_ENV=production', async () => {
  await withEnv(
    {
      ACCESS_PASSWORD: 'https-test-password',
      ACCESS_SESSION_SECRET: undefined,
      NODE_ENV: 'development',
      VERCEL: undefined,
    },
    async () => {
      const httpsResult = invokeAuthHandler({
        method: 'POST',
        headers: {
          host: 'app.example',
          origin: 'https://app.example',
          'x-forwarded-proto': 'https',
          'x-real-ip': '198.51.100.11',
        },
        body: { action: 'verify', password: 'https-test-password' },
      })
      assert.equal(httpsResult.statusCode, 200)
      assert.match(httpsResult.headers.get('set-cookie')[0], /\bSecure\b/)

      const httpResult = invokeAuthHandler({
        method: 'POST',
        headers: {
          host: 'localhost:3000',
          origin: 'http://localhost:3000',
          'x-real-ip': '198.51.100.12',
        },
        body: { action: 'verify', password: 'https-test-password' },
      })
      assert.equal(httpResult.statusCode, 200)
      assert.doesNotMatch(httpResult.headers.get('set-cookie')[0], /\bSecure\b/)
    }
  )
})

test('api/auth rejects cross-origin POST requests with 403 and emits no CORS wildcard', async () => {
  await withEnv({ ACCESS_PASSWORD: 'origin-test-password' }, async () => {
    const crossOrigin = invokeAuthHandler({
      method: 'POST',
      headers: {
        host: 'app.example',
        origin: 'https://evil.example',
        'x-real-ip': '198.51.100.13',
      },
      body: { action: 'verify', password: 'origin-test-password' },
    })
    assert.equal(crossOrigin.statusCode, 403)
    assert.equal(crossOrigin.headers.get('access-control-allow-origin'), undefined)
    assert.equal(crossOrigin.headers.get('set-cookie'), undefined)

    const crossSiteFetch = invokeAuthHandler({
      method: 'POST',
      headers: {
        host: 'app.example',
        'sec-fetch-site': 'cross-site',
        'x-real-ip': '198.51.100.14',
      },
      body: { action: 'verify', password: 'origin-test-password' },
    })
    assert.equal(crossSiteFetch.statusCode, 403)
    assert.equal(crossSiteFetch.headers.get('access-control-allow-origin'), undefined)
  })
})

test('api/auth rate limits repeated wrong passwords per IP with 429', async () => {
  await withEnv({ ACCESS_PASSWORD: 'rate-limit-password' }, async () => {
    const attackerIp = '203.0.113.55'
    for (let attempt = 1; attempt <= 15; attempt += 1) {
      const res = invokeAuthHandler({
        method: 'POST',
        headers: {
          host: 'app.example',
          origin: 'https://app.example',
          'x-forwarded-for': `198.51.100.1, ${attackerIp}`,
        },
        body: { action: 'verify', password: `wrong-${attempt}` },
      })
      assert.equal(res.statusCode, 401, `attempt ${attempt} should return 401`)
    }

    const blocked = invokeAuthHandler({
      method: 'POST',
      headers: {
        host: 'app.example',
        origin: 'https://app.example',
        'x-forwarded-for': `192.0.2.99, ${attackerIp}`,
      },
      body: { action: 'verify', password: 'rate-limit-password' },
    })
    assert.equal(blocked.statusCode, 429)
    assert.ok(Number(blocked.headers.get('retry-after')) >= 1)

    const otherIp = invokeAuthHandler({
      method: 'POST',
      headers: {
        host: 'app.example',
        origin: 'https://app.example',
        'x-real-ip': '203.0.113.56',
      },
      body: { action: 'verify', password: 'rate-limit-password' },
    })
    assert.equal(otherIp.statusCode, 200, 'separate IP must not share the blocked bucket')
  })
})

test('middleware and api/auth respect ACCESS_PASSWORD unset and REQUIRE_ACCESS_PASSWORD=1 fail-closed mode', async () => {
  await withEnv({ ACCESS_PASSWORD: undefined, REQUIRE_ACCESS_PASSWORD: undefined }, async () => {
    assert.equal(await middleware(new Request('https://example.com/api/models')), undefined)
  })

  await withEnv({ ACCESS_PASSWORD: undefined, REQUIRE_ACCESS_PASSWORD: '1' }, async () => {
    const mwRes = await middleware(new Request('https://example.com/api/models'))
    assert.equal(mwRes?.status, 503)

    const apiRes = invokeAuthHandler({ method: 'POST', body: { action: 'verify', password: 'any' } })
    assert.equal(apiRes.statusCode, 503)
  })
})
