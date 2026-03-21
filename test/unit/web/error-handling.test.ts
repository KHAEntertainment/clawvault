/**
 * Error response handling tests
 *
 * Tests for centralized error response formatting across API endpoints.
 * Verifies consistent error structure and appropriate messages for different status codes.
 */

import request from 'supertest'
import express from 'express'
import { createServer } from '../../../src/web/index.js'
import { SecretRequestStore } from '../../../src/web/requests/store.js'

describe('Web API Error Responses', () => {
  let app: express.Application
  let server: any
  let token: string
  let close: () => Promise<void>

  beforeAll(async () => {
    const storage = { list: async () => ['TEST_SECRET'], has: async () => true, set: async () => {}, remove: async () => {} } as any
    const requestStore = new SecretRequestStore()
    token = 'test-token'
    app = await createServer(
      storage,
      { port: 18789, host: 'localhost', requestStore },
      token
    )
    server = app.listen(18789)
  })

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  describe('errorResponse helper', () => {
    it('should return 400 with validation error message', async () => {
      const storage1 = { list: async () => [], has: async () => true, set: async () => {}, remove: async () => {} } as any
      const requestStore1 = new SecretRequestStore()
      const token1 = 'test-token-1'
      const testApp1 = await createServer(storage1, { port: 0, host: 'localhost', requestStore: requestStore1 }, token1)

      const response = await request(testApp1)
        .post('/api/submit')
        .set('Authorization', `Bearer ${token1}`)
        .send({ secretName: '', secretValue: 'test-value' })

      expect(response.status).toBe(400)
      expect(response.body.success).toBe(false)
      expect(response.body.message).toContain('Invalid request')
      expect(response.body.message).not.toContain('Missing or invalid secretName')
    })

    it('should return 401 with unauthorized message', async () => {
      const storage2 = { list: async () => [], has: async () => true, set: async () => {}, remove: async () => {} } as any
      const requestStore2 = new SecretRequestStore()
      const token2 = 'test-token-2'
      const testApp2 = await createServer(storage2, { port: 0, host: 'localhost', requestStore: requestStore2 }, token2)

      const response = await request(testApp2)
        .post('/api/submit')
        .set('Authorization', 'invalid-token')
        .send({ secretName: 'TEST_SECRET', secretValue: 'test-value' })

      expect(response.status).toBe(401)
      expect(response.body.success).toBe(false)
      expect(response.body.message).toBe('Unauthorized. Please check your bearer token.')
    })

    it('should return 500 with server error message', async () => {
      // Mock storage.set to throw an error
      const mockStorage = {
        list: async () => [],
        has: async () => true,
        set: async () => {
          throw new Error('Storage error')
        },
        remove: async () => {}
      }

      const testRequestStore = new SecretRequestStore()
      const testToken = 'test-token-500'
      const testApp = await createServer(
        mockStorage,
        { port: 18790, host: 'localhost', requestStore: testRequestStore },
        testToken
      )
      const testServer = testApp.listen(18790)

      try {
        const response = await request(testApp)
          .post('/api/submit')
          .set('Authorization', `Bearer ${testToken}`)
          .send({ secretName: 'TEST_SECRET', secretValue: 'test-value' })

        expect(response.status).toBe(500)
        expect(response.body.success).toBe(false)
        expect(response.body.message).toBe('Server error. Please try again later.')
        expect(response.body.error).toBeUndefined() // error field should not exist in new format
      } finally {
        await new Promise<void>((resolve) => testServer.close(() => resolve()))
      }
    })

    it('should use rate limit message on 429', async () => {
      const storage3 = { list: async () => [], has: async () => true, set: async () => {}, remove: async () => {} } as any
      const requestStore3 = new SecretRequestStore()
      const token3 = 'test-token-3'
      const testApp3 = await createServer(storage3, { port: 0, host: 'localhost', requestStore: requestStore3 }, token3)

      // Send 31 requests to hit rate limit (max is 30)
      const promises = []
      for (let i = 0; i < 31; i++) {
        promises.push(
          request(testApp3)
            .post('/api/submit')
            .set('Authorization', `Bearer ${token3}`)
            .send({ secretName: `TEST_${i}`, secretValue: 'test-value' })
        )
      }

      await Promise.all(promises)

      const response = await request(testApp3)
        .post('/api/submit')
        .set('Authorization', `Bearer ${token3}`)
        .send({ secretName: 'TEST_32', secretValue: 'test-value' })

      expect(response.status).toBe(429)
      expect(response.body.success).toBe(false)
      expect(response.body.message).toBe('Rate limit exceeded. Please wait 15 minutes before trying again.')
    })
  })

  describe('security: error responses', () => {
    it('should never include secret values in error messages', async () => {
      const storage4 = { list: async () => [], has: async () => true, set: async () => {}, remove: async () => {} } as any
      const requestStore4 = new SecretRequestStore()
      const token4 = 'test-token-4'
      const testApp4 = await createServer(storage4, { port: 0, host: 'localhost', requestStore: requestStore4 }, token4)

      const response = await request(testApp4)
        .post('/api/submit')
        .set('Authorization', `Bearer ${token4}`)
        .send({ secretName: 'MY_API_KEY', secretValue: 'super-secret-password' })

      expect(response.body.success).toBe(false)
      expect(response.body.message).not.toContain('super-secret-password')
      expect(response.body.message).not.toContain('MY_API_KEY')
    })

    it('should not expose internal error details', async () => {
      const mockStorage = {
        list: async () => [],
        has: async () => true,
        set: async () => {
          throw new Error('Database connection failed: host=db.internal, port=5432')
        },
        remove: async () => {}
      }

      const testRequestStore2 = new SecretRequestStore()
      const testToken2 = 'test-token-internal'
      const testApp = await createServer(
        mockStorage,
        { port: 18791, host: 'localhost', requestStore: testRequestStore2 },
        testToken2
      )
      const testServer = testApp.listen(18791)

      try {
        const response = await request(testApp)
          .post('/api/submit')
          .set('Authorization', `Bearer ${testToken2}`)
          .send({ secretName: 'TEST_SECRET', secretValue: 'test-value' })

        expect(response.body.success).toBe(false)
        expect(response.body.message).toBe('Server error. Please try again later.')
        // Should not include internal details like host, port, etc.
        expect(response.body.message).not.toContain('db.internal')
        expect(response.body.message).not.toContain('5432')
      } finally {
        await new Promise<void>((resolve) => testServer.close(() => resolve()))
      }
    })

    it('should not include rate limit window size', async () => {
      const storage5 = { list: async () => [], has: async () => true, set: async () => {}, remove: async () => {} } as any
      const requestStore5 = new SecretRequestStore()
      const token5 = 'test-token-5'
      const testApp5 = await createServer(storage5, { port: 0, host: 'localhost', requestStore: requestStore5 }, token5)

      // Send 31 requests to hit rate limit
      const promises = []
      for (let i = 0; i < 31; i++) {
        promises.push(
          request(testApp5)
            .post('/api/submit')
            .set('Authorization', `Bearer ${token5}`)
            .send({ secretName: `TEST_${i}`, secretValue: 'test-value' })
        )
      }

      await Promise.all(promises)

      const response = await request(testApp5)
        .post('/api/submit')
        .set('Authorization', `Bearer ${token5}`)
        .send({ secretName: 'TEST_32', secretValue: 'test-value' })

      expect(response.body.success).toBe(false)
      expect(response.body.message).toBe('Rate limit exceeded. Please wait 15 minutes before trying again.')
      // Should not reveal window size (15 minutes * 60 * 1000 ms)
      expect(response.body.message).not.toContain('900000')
    })
  })
})