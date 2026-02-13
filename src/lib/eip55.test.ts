import { describe, it, expect } from 'vitest';
import { toChecksumAddress } from './eip55';

describe('toChecksumAddress', () => {
  // EIP-55 spec test vectors from https://eips.ethereum.org/EIPS/eip-55
  it('checksums all-caps address', () => {
    expect(toChecksumAddress('0x52908400098527886E0F7030069857D2E4169EE7'))
      .toBe('0x52908400098527886E0F7030069857D2E4169EE7');
    expect(toChecksumAddress('0x8617E340B3D01FA5F11F306F4090FD50E238070D'))
      .toBe('0x8617E340B3D01FA5F11F306F4090FD50E238070D');
  });

  it('checksums all-lowercase address', () => {
    expect(toChecksumAddress('0xde709f2102306220921060314715629080e2fb77'))
      .toBe('0xde709f2102306220921060314715629080e2fb77');
    expect(toChecksumAddress('0x27b1fdb04752bbc536007a920d24acb045561c26'))
      .toBe('0x27b1fdb04752bbc536007a920d24acb045561c26');
  });

  it('checksums mixed-case addresses (standard EIP-55 vectors)', () => {
    expect(toChecksumAddress('0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed'))
      .toBe('0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed');
    expect(toChecksumAddress('0xfb6916095ca1df60bb79ce92ce3ea74c37c5d359'))
      .toBe('0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359');
    expect(toChecksumAddress('0xdbf03b407c01e7cd3cbea99509d93f8dddc8c6fb'))
      .toBe('0xdbF03B407c01E7cD3CBea99509d93f8DDDC8C6FB');
    expect(toChecksumAddress('0xd1220a0cf47c7b9be7a2e6ba89f429762e7b9adb'))
      .toBe('0xD1220A0cf47c7B9Be7A2E6BA89F429762e7b9aDb');
  });

  it('checksums the Lighter wallet address correctly', () => {
    expect(toChecksumAddress('0x7fda5a2fe9bf63d2f073bbbad04adafefa50a927'))
      .toBe('0x7fda5a2fe9Bf63d2F073BbBaD04adaFEfA50A927');
  });

  it('is idempotent (already checksummed address)', () => {
    const addr = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed';
    expect(toChecksumAddress(addr)).toBe(addr);
  });

  it('returns non-address strings unchanged', () => {
    expect(toChecksumAddress('')).toBe('');
    expect(toChecksumAddress('not-an-address')).toBe('not-an-address');
    expect(toChecksumAddress('0x123')).toBe('0x123');
  });

  it('returns addresses without 0x prefix unchanged', () => {
    expect(toChecksumAddress('5aaeb6053f3e94c9b9a09f33669435e7ef1beaed'))
      .toBe('5aaeb6053f3e94c9b9a09f33669435e7ef1beaed');
  });
});
