import type { ResolvedDownload } from '@elysium/shared';

export interface GopeedClientOptions {
  baseUrl?: string;
  token?: string;
}

export interface GopeedCreateTaskResponse {
  id: string;
  [key: string]: unknown;
}

export type GopeedTaskStatus =
  | 'ready'
  | 'running'
  | 'pause'
  | 'wait'
  | 'error'
  | 'done';

export interface GopeedTask {
  id: string;
  name: string;
  status: GopeedTaskStatus;
  size: number;
  progress: {
    downloaded: number;
    speed: number;
    uploaded?: number;
    uploadSpeed?: number;
  };
  createdAt?: string;
  updatedAt?: string;
}

interface GopeedResult<T> {
  code: number;
  msg: string;
  data: T;
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

    const taskId = await this.request<string>('/api/v1/tasks', {
      body: JSON.stringify({
        req: {
          url: download.directUrl,
        },
        opts: {
          ...(download.filename ? { name: download.filename } : {}),
          ...(downloadDestinationPath()
            ? { path: downloadDestinationPath() }
            : {}),
        },
      }),
      method: 'POST',
    });

    return { id: taskId };
  }

  async getTask(id: string): Promise<GopeedTask> {
    return this.request<GopeedTask>(`/api/v1/tasks/${encodeURIComponent(id)}`);
  }

  async getInfo(): Promise<unknown> {
    return this.request<unknown>('/api/v1/info');
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      accept: 'application/json',
      'content-type': 'application/json',
      ...(this.token ? { 'X-Api-Token': this.token } : {}),
      ...headersToRecord(init.headers),
    };
    const response = await fetch(new URL(path, this.baseUrl), {
      ...init,
      headers,
      signal: AbortSignal.timeout(5_000),
    });

    if (!response.ok) {
      throw new Error(
        `Gopeed request failed: ${response.status} ${await response.text()}`,
      );
    }

    const result = (await response.json()) as GopeedResult<T>;

    if (result.code !== 0) {
      throw new Error(`Gopeed request failed: ${result.msg}`);
    }

    return result.data;
  }
}

function downloadDestinationPath() {
  return process.env.ELYSIUM_DOWNLOAD_DIR;
}

function headersToRecord(headers?: HeadersInit): Record<string, string> {
  if (!headers) {
    return {};
  }

  if (headers instanceof Headers) {
    const record: Record<string, string> = {};
    headers.forEach((value, key) => {
      record[key] = value;
    });
    return record;
  }

  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }

  return headers;
}
