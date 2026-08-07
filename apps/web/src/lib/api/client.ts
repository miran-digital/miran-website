export type ApiRequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown;
};

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const baseUrl = process.env.API_BASE_URL ?? 'http://localhost:3001';
  const response = await fetch(new URL(path, baseUrl), {
    ...options,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      ...options.headers
    }
  });

  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}`);
  }

  return response.json() as Promise<T>;
}
