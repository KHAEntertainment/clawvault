/**
 * Default Config Tests
 *
 * Tests for default secret templates and configuration defaults.
 */

import {
  getDefaultConfig,
  getSecretTemplate,
  getSecretTemplateNames,
  createFromTemplate
} from '../../../src/config/defaults.js'

describe('getDefaultConfig', () => {
  it('should return a valid config structure', () => {
    const config = getDefaultConfig()

    expect(config).toHaveProperty('version')
    expect(config).toHaveProperty('secrets')
    expect(config).toHaveProperty('gateway')

    expect(config.version).toBe(1)
    expect(typeof config.secrets).toBe('object')
    expect(typeof config.gateway).toBe('object')
  })

  it('should include gateway configuration', () => {
    const config = getDefaultConfig()

    expect(config.gateway.restartOnUpdate).toBe(true)
    expect(Array.isArray(config.gateway.services)).toBe(true)
    expect(config.gateway.services).toContain('openclaw-gateway.service')
  })
})

describe('Default Secret Templates', () => {
  it('should include OPENAI_API_KEY template', () => {
    const config = getDefaultConfig()

    expect(config.secrets.OPENAI_API_KEY).toBeDefined()
    expect(config.secrets.OPENAI_API_KEY.provider).toBe('openai')
    expect(config.secrets.OPENAI_API_KEY.environmentVar).toBe('OPENAI_API_KEY')
    expect(config.secrets.OPENAI_API_KEY.validation).toBeDefined()
    expect(config.secrets.OPENAI_API_KEY.validation?.pattern).toBe('^sk-[a-zA-Z0-9]{48}$')
    expect(config.secrets.OPENAI_API_KEY.validation?.minLength).toBe(51)
    expect(config.secrets.OPENAI_API_KEY.validation?.maxLength).toBe(51)
  })

  it('should include ANTHROPIC_API_KEY template', () => {
    const config = getDefaultConfig()

    expect(config.secrets.ANTHROPIC_API_KEY).toBeDefined()
    expect(config.secrets.ANTHROPIC_API_KEY.provider).toBe('anthropic')
    expect(config.secrets.ANTHROPIC_API_KEY.environmentVar).toBe('ANTHROPIC_API_KEY')
    expect(config.secrets.ANTHROPIC_API_KEY.validation).toBeDefined()
    expect(config.secrets.ANTHROPIC_API_KEY.validation?.pattern).toBe('^sk-ant-[a-zA-Z0-9_-]{95}$')
    expect(config.secrets.ANTHROPIC_API_KEY.validation?.minLength).toBe(100)
    expect(config.secrets.ANTHROPIC_API_KEY.validation?.maxLength).toBe(100)
  })

  it('should include GEMINI_API_KEY template', () => {
    const config = getDefaultConfig()

    expect(config.secrets.GEMINI_API_KEY).toBeDefined()
    expect(config.secrets.GEMINI_API_KEY.provider).toBe('google')
    expect(config.secrets.GEMINI_API_KEY.environmentVar).toBe('GEMINI_API_KEY')
    expect(config.secrets.GEMINI_API_KEY.validation?.minLength).toBe(30)
  })

  it('should include DISCORD_BOT_TOKEN template', () => {
    const config = getDefaultConfig()

    expect(config.secrets.DISCORD_BOT_TOKEN).toBeDefined()
    expect(config.secrets.DISCORD_BOT_TOKEN.provider).toBe('discord')
    expect(config.secrets.DISCORD_BOT_TOKEN.environmentVar).toBe('DISCORD_BOT_TOKEN')
    expect(config.secrets.DISCORD_BOT_TOKEN.validation?.pattern).toBe('^[A-Za-z0-9_\\-.]{50,}$')
    expect(config.secrets.DISCORD_BOT_TOKEN.validation?.minLength).toBe(50)
  })

  it('should have all required fields for each template', () => {
    const config = getDefaultConfig()

    for (const [name, definition] of Object.entries(config.secrets)) {
      expect(definition.description).toBeTruthy()
      expect(definition.description.length).toBeGreaterThan(0)

      expect(definition.environmentVar).toBeTruthy()
      expect(definition.environmentVar.length).toBeGreaterThan(0)

      expect(definition.provider).toBeTruthy()
      expect(definition.provider.length).toBeGreaterThan(0)

      expect(typeof definition.required).toBe('boolean')

      expect(Array.isArray(definition.gateways)).toBe(true)
      expect(definition.gateways.length).toBeGreaterThan(0)
    }
  })
})

describe('getSecretTemplate', () => {
  it('should return a template for existing secrets', () => {
    const openaiTemplate = getSecretTemplate('OPENAI_API_KEY')

    expect(openaiTemplate).toBeDefined()
    expect(openaiTemplate?.provider).toBe('openai')
  })

  it('should return undefined for non-existent templates', () => {
    const nonexistent = getSecretTemplate('NONEXISTENT_KEY')

    expect(nonexistent).toBeUndefined()
  })
})

describe('getSecretTemplateNames', () => {
  it('should return all template names', () => {
    const names = getSecretTemplateNames()

    expect(Array.isArray(names)).toBe(true)
    expect(names).toContain('OPENAI_API_KEY')
    expect(names).toContain('ANTHROPIC_API_KEY')
    expect(names).toContain('GEMINI_API_KEY')
    expect(names).toContain('DISCORD_BOT_TOKEN')
  })

  it('should return at least 4 templates', () => {
    const names = getSecretTemplateNames()

    expect(names.length).toBeGreaterThanOrEqual(4)
  })
})

describe('createFromTemplate', () => {
  it('should create a secret definition from a template', () => {
    const custom = createFromTemplate('OPENAI_API_KEY', 'MY_CUSTOM_KEY')

    expect(custom).toBeDefined()
    expect(custom?.provider).toBe('openai')
    expect(custom?.environmentVar).toBe('MY_CUSTOM_KEY')
  })

  it('should update description with custom name', () => {
    const custom = createFromTemplate('OPENAI_API_KEY', 'MY_API_KEY')

    // Description should reference the new name
    expect(custom?.description).toContain('MY_API_KEY')
  })

  it('should return null for non-existent template', () => {
    const custom = createFromTemplate('NONEXISTENT', 'MY_KEY')

    expect(custom).toBeNull()
  })

  it('should copy validation rules from template', () => {
    const custom = createFromTemplate('OPENAI_API_KEY', 'MY_KEY')

    expect(custom?.validation).toBeDefined()
    expect(custom?.validation?.pattern).toBe('^sk-[a-zA-Z0-9]{48}$')
    expect(custom?.validation?.minLength).toBe(51)
  })
})

describe('Template Validation Patterns', () => {
  it('OPENAI_API_KEY pattern should match valid keys', () => {
    const config = getDefaultConfig()
    const pattern = config.secrets.OPENAI_API_KEY.validation?.pattern

    expect(pattern).toBeDefined()
    if (!pattern) throw new Error('Pattern should be defined')

    const regex = new RegExp(pattern)
    expect(regex.test('sk-' + 'a'.repeat(48))).toBe(true)
    expect(regex.test('sk-1234567890abcdef')).toBe(false) // Too short
  })

  it('ANTHROPIC_API_KEY pattern should match valid keys', () => {
    const config = getDefaultConfig()
    const pattern = config.secrets.ANTHROPIC_API_KEY.validation?.pattern

    expect(pattern).toBeDefined()
    if (!pattern) throw new Error('Pattern should be defined')

    const regex = new RegExp(pattern)
    expect(regex.test('sk-ant-' + 'a'.repeat(95))).toBe(true)
    expect(regex.test('sk-ant-api123-')).toBe(false) // Too short
  })

  it('DISCORD_BOT_TOKEN pattern should match valid tokens', () => {
    const config = getDefaultConfig()
    const pattern = config.secrets.DISCORD_BOT_TOKEN.validation?.pattern

    expect(pattern).toBeDefined()
    if (!pattern) throw new Error('Pattern should be defined')

    const regex = new RegExp(pattern)
    expect(regex.test('MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNA.abc.def')).toBe(true)
    expect(regex.test('short')).toBe(false) // Too short
  })
})

describe('Security: No secret values in defaults', () => {
  it('should never include actual secret values', () => {
    const config = getDefaultConfig()

    for (const [name, definition] of Object.entries(config.secrets)) {
      // Check that there's no 'value' property
      expect('value' in definition).toBe(false)

      // Check that validation doesn't contain actual secrets
      expect(definition.validation).not.toHaveProperty('value')
    }
  })

  it('should only define patterns and constraints, not actual values', () => {
    const config = getDefaultConfig()
    const configString = JSON.stringify(config)

    // These should NOT appear in the defaults
    expect(configString).not.toContain('sk-ant-api')
    expect(configString).not.toContain('sk-1234')
    expect(configString).not.toMatch(/discord.*token.*MTIz/i)
  })
})
