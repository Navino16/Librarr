import { describe, it, expect } from 'vitest';
import { buildServerUrl } from '@server/lib/serverUrl';

describe('buildServerUrl', () => {
  describe('positional arguments', () => {
    it('builds http url', () => {
      expect(buildServerUrl('localhost', 8080, false)).toBe('http://localhost:8080');
    });

    it('builds https url', () => {
      expect(buildServerUrl('example.com', 443, true)).toBe('https://example.com:443');
    });

    it('appends baseUrl', () => {
      expect(buildServerUrl('host', 80, false, 'api')).toBe('http://host:80/api');
    });

    it('strips leading slash from baseUrl', () => {
      expect(buildServerUrl('host', 80, false, '/api')).toBe('http://host:80/api');
    });

    it('strips trailing slash from baseUrl', () => {
      expect(buildServerUrl('host', 80, false, 'api/')).toBe('http://host:80/api');
    });

    it('strips both leading and trailing slashes from baseUrl', () => {
      expect(buildServerUrl('host', 80, false, '/api/')).toBe('http://host:80/api');
    });

    it('handles baseUrl with nested path', () => {
      expect(buildServerUrl('host', 80, false, '/v1/api/')).toBe('http://host:80/v1/api');
    });

    it('handles undefined baseUrl', () => {
      expect(buildServerUrl('host', 80, false, undefined)).toBe('http://host:80');
    });

    it('handles empty string baseUrl', () => {
      expect(buildServerUrl('host', 80, false, '')).toBe('http://host:80');
    });
  });

  describe('object argument', () => {
    it('builds http url from config object', () => {
      expect(buildServerUrl({ hostname: 'localhost', port: 8080, useSsl: false })).toBe(
        'http://localhost:8080'
      );
    });

    it('builds https url from config object', () => {
      expect(buildServerUrl({ hostname: 'secure.io', port: 443, useSsl: true })).toBe(
        'https://secure.io:443'
      );
    });

    it('appends baseUrl from config object', () => {
      expect(
        buildServerUrl({ hostname: 'host', port: 80, useSsl: false, baseUrl: 'api' })
      ).toBe('http://host:80/api');
    });

    it('normalizes baseUrl slashes from config object', () => {
      expect(
        buildServerUrl({ hostname: 'host', port: 80, useSsl: false, baseUrl: '/api/' })
      ).toBe('http://host:80/api');
    });

    it('handles undefined baseUrl in config object', () => {
      expect(
        buildServerUrl({ hostname: 'host', port: 3000, useSsl: false, baseUrl: undefined })
      ).toBe('http://host:3000');
    });
  });

  describe('edge cases', () => {
    it('handles IP address hostname', () => {
      expect(buildServerUrl('192.168.1.1', 9090, false)).toBe('http://192.168.1.1:9090');
    });

    it('handles high port number', () => {
      expect(buildServerUrl('host', 65535, true)).toBe('https://host:65535');
    });

    it('handles port 0', () => {
      expect(buildServerUrl('host', 0, false)).toBe('http://host:0');
    });
  });
});
