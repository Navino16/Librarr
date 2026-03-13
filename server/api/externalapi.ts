import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import logger from '../logger';

interface ExternalApiOptions {
  baseUrl: string;
  headers?: Record<string, string>;
  rateLimit?: number; // minimum ms between requests
  retries?: number;   // max retry attempts for transient errors (default 2)
}

const RETRYABLE_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
]);

function isRetryable(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  if (error.code && RETRYABLE_CODES.has(error.code)) return true;
  const status = error.response?.status;
  return status === 429 || (!!status && status >= 500);
}

export default class ExternalApi {
  protected axios: AxiosInstance;
  private rateLimitMs: number;
  private hostname: string;
  private maxRetries: number;

  // Static per-host rate limiting so all instances targeting the same host share timing
  private static lastRequestTimeByHost = new Map<string, number>();

  constructor(options: ExternalApiOptions) {
    this.rateLimitMs = options.rateLimit || 0;
    this.maxRetries = options.retries ?? 2;
    try {
      this.hostname = new URL(options.baseUrl).hostname;
    } catch {
      this.hostname = options.baseUrl;
    }
    this.axios = axios.create({
      baseURL: options.baseUrl,
      headers: {
        'Accept': 'application/json',
        ...options.headers,
      },
      timeout: 15000,
    });

    this.axios.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response) {
          logger.warn(`External API error: ${error.response.status} from ${error.config?.url}`, {
            status: error.response.status,
            url: error.config?.url,
          });
        }
        throw error;
      }
    );
  }

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        if (attempt < this.maxRetries && isRetryable(error)) {
          const delay = 500 * 2 ** attempt; // 500ms, 1s
          logger.debug(`Retrying request (attempt ${attempt + 1}/${this.maxRetries}) after ${delay}ms`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        throw error;
      }
    }
    throw lastError;
  }

  protected async get<T>(
    path: string,
    config?: AxiosRequestConfig
  ): Promise<T> {
    return this.withRetry(async () => {
      await this.rateLimit();
      const response = await this.axios.get<T>(path, config);
      return response.data;
    });
  }

  protected async post<T>(
    path: string,
    data?: unknown,
    config?: AxiosRequestConfig
  ): Promise<T> {
    return this.withRetry(async () => {
      await this.rateLimit();
      const response = await this.axios.post<T>(path, data, config);
      return response.data;
    });
  }

  private async rateLimit(): Promise<void> {
    if (this.rateLimitMs === 0) return;

    const now = Date.now();
    const lastTime = ExternalApi.lastRequestTimeByHost.get(this.hostname) || 0;
    // Reserve the slot immediately to prevent concurrent calls from
    // reading the same lastTime and firing simultaneously.
    const next = Math.max(now, lastTime + this.rateLimitMs);
    ExternalApi.lastRequestTimeByHost.set(this.hostname, next);
    const delay = next - now;
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
