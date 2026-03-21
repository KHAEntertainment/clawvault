/**
 * Error response handling tests
 *
 * Tests for centralized error response formatting across API endpoints.
 * Verifies consistent error structure and appropriate messages for different status codes.
 */

import { request } from 'supertest'
import express from 'express'
import { createServer } from '../../src/web/index.js'

describe('Web API Error Responses', () => {
  let app: express.Application
  let server: any
  let token: string
  let close: () => Promise<void>

  beforeAll(async () => {
    app = await createServer(
      { storage: { list: async () => ['TEST_SECRET'], has: async () => true, set: async () => {}, remove: async () => {} } as any },
      { port: 18789, host: 'localhost' }
    )
    token = 'test-token'
    server = app.listen(18789)
  })

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  describe('errorResponse helper', () => {
    it('should return 400 with validation error message', async () => {
      const response = await request(app)
        .post('/api/submit')
        .set('Authorization', `Bearer ${token}`)
        .send({ secretName: '', secretValue: 'test-value' })

      expect(response.status).toBe(400)
      expect(response.body.success).toBe(false)
      expect(response.body.message).toContain('Invalid request')
      expect(response.body.message).not.toContain('Missing or invalid secretName')
    })

    it('should return 401 with unauthorized message', async () => {
      const response = await request(app)
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

      const testApp = await createServer(
        { storage: mockStorage, port: 18790, host: 'localhost' },
        'test-token-500'
      )
      const testServer = testApp.listen(18790)

      try {
        const response = await request(testApp)
          .post('/api/submit')
          .set('Authorization', `Bearer test-token-500`)
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
      // Send 31 requests to hit rate limit (max is 30)
      const promises = []
      for (let i = 0; i < 31; i++) {
        promises.push(
          request(app)
            .post('/api/submit')
            .set('Authorization', `Bearer ${token}`)
            .send({ secretName: `TEST_${i}`, secretValue: 'test-value' })
        )
      }

      await Promise.all(promises)

      const response = await request(app)
        .post('/api/submit')
        .set('Authorization', `Bearer ${token}`)
        .send({ secretName: 'TEST_32', secretValue: 'test-value' })

      expect(response.status).toBe(429)
      expect(response.body.success).toBe(false)
      expect(response.body.message).toBe('Rate limit exceeded. Please wait 15 minutes before trying again.')
    })
  })

  describe('security: error responses', () => {
    it('should never include secret values in error messages', async () => {
      const response = await request(app)
        .post('/api/submit')
        .set('Authorization', `Bearer ${token}`)
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

      const testApp = await createServer(
        { storage: mockStorage, port: 18791, host: 'localhost' },
        'test-token-internal'
      )
      const testServer = testApp.listen(18791)

      try {
        const response = await request(testApp)
          .post('/api/submit')
          .set('Authorization', `Bearer test-token-internal`)
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
      // Send 31 requests to hit rate limit
      const promises = []
      for (let i = 0; i < 31; i++) {
        promises.push(
          request(app)
            .post('/api/submit')
            .set('Authorization', `Bearer ${token}`)
            .send({ secretName: `TEST_${i}`, secretValue: 'test-value' })
        )
      }

      await Promise.all(promises)

      const response = await request(app)
        .post('/api/submit')
        .set('Authorization', `Bearer ${token}`)
        .send({ secretName: 'TEST_32', secretValue: 'test-value' })

      expect(response.body.success).toBe(false)
      expect(response.body.message).toBe('Rate limit exceeded. Please wait 15 minutes before trying again.')
      // Should not reveal window size (15 minutes * 60 * 1000 ms)
      expect(response.body.message).not.toContain('900000')
      expect(response.body.message).not.toContain('15')
    })
  })
})
