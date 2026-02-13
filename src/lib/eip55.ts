/**
 * EIP-55: Mixed-case checksum address encoding
 * https://eips.ethereum.org/EIPS/eip-55
 */

import { keccak_256 } from '@noble/hashes/sha3.js';
import { bytesToHex } from '@noble/hashes/utils.js';

/**
 * Convert an Ethereum address to its EIP-55 checksummed form.
 * Returns the original string unchanged if it's not a valid 40-hex-char address.
 */
export function toChecksumAddress(address: string): string {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return address;

  const addr = address.slice(2).toLowerCase();
  const hash = bytesToHex(keccak_256(new TextEncoder().encode(addr)));

  return (
    '0x' +
    addr
      .split('')
      .map((c, i) => (parseInt(hash[i], 16) >= 8 ? c.toUpperCase() : c))
      .join('')
  );
}
