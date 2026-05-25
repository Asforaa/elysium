import type { ResolvedDownload } from '@elysium/shared';

export interface GopeedClientOptions {
  baseUrl?: string;
  token?: string;
}

export interface GopeedCreateTaskResponse {
  id?: string;
  [key: string]: unknown;
}

const DEFAULT_GOPEED_BASE_URL = 'http://127.0.0.1:9999';

export class GopeedClient {
  private readonly baseUrl: string;
  private readonly token?: string;

  constructor(options: GopeedClientOptions = {}) {
    this.baseUrl =
      options.baseUrl ?? process.env.GOPEED_BASE_URL ?? DEFAULT_GOPEED_BASE_URL;
    this.token = options.token ?? process.env.GOPEED_API_TOKEN;
  }

  async createTask(
    download: ResolvedDownload,
  ): Promise<GopeedCreateTaskResponse> {
    if (!download.directUrl) {
      throw new Error('Gopeed task creation requires a direct URL');
    }

    const response = await fetch(new URL('/api/v1/tasks', this.baseUrl), {
      body: JSON.stringify({
        req: {
          url: download.directUrl,
        },
      }),
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      },
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error(
        `Gopeed task creation failed: ${response.status} ${response.statusText}`,
      );
    }

    return response.json() as Promise<GopeedCreateTaskResponse>;
  }
}
