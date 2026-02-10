import { decideInsecureHttpPolicy, isTailscaleHost, isLocalhostBinding } from '../../../src/web/network-policy'

describe('network-policy', () => {
  it('detects localhost', () => {
    expect(isLocalhostBinding('localhost')).toBe(true)
    expect(isLocalhostBinding('127.0.0.1')).toBe(true)
    expect(isLocalhostBinding('::1')).toBe(true)
  })

  it('detects tailscale hosts', () => {
    expect(isTailscaleHost('100.64.0.1')).toBe(true)
    expect(isTailscaleHost('100.127.255.255')).toBe(true)
    expect(isTailscaleHost('100.63.0.1')).toBe(false)
    expect(isTailscaleHost('100.128.0.1')).toBe(false)
    expect(isTailscaleHost('mybox.ts.net')).toBe(true)
    expect(isTailscaleHost('example.com')).toBe(false)
  })

  it('decides policy correctly', () => {
    expect(decideInsecureHttpPolicy('localhost', false).allow).toBe(true)
    expect(decideInsecureHttpPolicy('100.100.100.100', false).reason).toBe('tailscale')
    expect(decideInsecureHttpPolicy('192.168.1.10', false).allow).toBe(false)
    expect(decideInsecureHttpPolicy('192.168.1.10', true).reason).toBe('override')
  })
})
