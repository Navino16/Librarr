import { describe, it, expect } from 'vitest';
import { validateConnectionTarget } from '@server/utils/validateHostname';

describe('validateConnectionTarget — hostname validation', () => {
  it('rejects falsy hostname', async () => {
    expect(await validateConnectionTarget(null, undefined)).toBe('hostname is required');
    expect(await validateConnectionTarget(undefined, undefined)).toBe('hostname is required');
    expect(await validateConnectionTarget('', undefined)).toBe('hostname is required');
    expect(await validateConnectionTarget(0, undefined)).toBe('hostname is required');
  });

  it('rejects non-string hostname', async () => {
    expect(await validateConnectionTarget(123, undefined)).toBe('hostname is required');
    expect(await validateConnectionTarget(true, undefined)).toBe('hostname is required');
  });

  it('rejects hostname that is empty after trim', async () => {
    expect(await validateConnectionTarget('   ', undefined)).toBe(
      'hostname must be between 1 and 253 characters'
    );
  });

  it('rejects hostname longer than 253 chars', async () => {
    const long = 'a'.repeat(254);
    expect(await validateConnectionTarget(long, undefined)).toBe(
      'hostname must be between 1 and 253 characters'
    );
  });

  it('accepts localhost and private IPs', async () => {
    expect(await validateConnectionTarget('localhost', undefined)).toBeNull();
    expect(await validateConnectionTarget('127.0.0.1', undefined)).toBeNull();
    expect(await validateConnectionTarget('10.0.0.1', undefined)).toBeNull();
    expect(await validateConnectionTarget('192.168.1.1', undefined)).toBeNull();
  });

  it('accepts public IPs and hostnames', async () => {
    expect(await validateConnectionTarget('8.8.8.8', undefined)).toBeNull();
    expect(await validateConnectionTarget('example.com', undefined)).toBeNull();
  });
});

describe('validateConnectionTarget — port validation', () => {
  it('rejects port 0', async () => {
    expect(await validateConnectionTarget('localhost', 0)).toBe('port must be between 1 and 65535');
  });

  it('rejects negative port', async () => {
    expect(await validateConnectionTarget('localhost', -1)).toBe('port must be between 1 and 65535');
  });

  it('rejects port > 65535', async () => {
    expect(await validateConnectionTarget('localhost', 65536)).toBe(
      'port must be between 1 and 65535'
    );
  });

  it('rejects NaN port string', async () => {
    expect(await validateConnectionTarget('localhost', 'abc')).toBe(
      'port must be between 1 and 65535'
    );
  });

  it('accepts valid ports', async () => {
    expect(await validateConnectionTarget('localhost', 1)).toBeNull();
    expect(await validateConnectionTarget('localhost', 443)).toBeNull();
    expect(await validateConnectionTarget('localhost', 65535)).toBeNull();
  });

  it('accepts string port that parses to a valid number', async () => {
    expect(await validateConnectionTarget('localhost', '8080')).toBeNull();
  });

  it('skips port validation when port is undefined or null', async () => {
    expect(await validateConnectionTarget('localhost', undefined)).toBeNull();
    expect(await validateConnectionTarget('localhost', null)).toBeNull();
  });
});
