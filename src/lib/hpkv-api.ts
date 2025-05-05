import { HPKV_API_URL_PARAM, HPKV_API_KEY_PARAM } from "./constants";

interface HpkVRequestOptions {
  method: "GET" | "POST" | "DELETE";
  apiKey: string;
  apiUrl: string;
  path: string; // e.g., "/record", "/list"
  body?: Record<string, any> | null;
  params?: Record<string, string>;
}

export async function callHpkVApi<T = any>(options: HpkVRequestOptions): Promise<{ data: T | null; error: string | null; status: number }> {
  const { method, apiKey, apiUrl, path, body = null, params = {} } = options;

  if (!apiKey || !apiUrl) {
    return { data: null, error: "API key or API URL is missing", status: 400 };
  }

  const url = new URL(path, apiUrl);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.append(key, value);
  });

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
  };

  try {
    const response = await fetch(url.toString(), {
      method: method,
      headers: headers,
      body: body ? JSON.stringify(body) : null,
    });

    if (!response.ok) {
      let errorBody = "Unknown error";
      try {
        errorBody = await response.text();
      } catch (e) { /* Ignore parsing error */ }
      console.error(`HPKV API Error (${response.status}): ${errorBody}`);
      return { data: null, error: `HPKV API Error (${response.status}): ${errorBody.substring(0, 200)}`, status: response.status };
    }

    // Handle DELETE success which might have no content
    if (response.status === 204 || method === "DELETE") {
        return { data: { success: true } as T, error: null, status: response.status };
    }

    const data: T = await response.json();
    return { data, error: null, status: response.status };

  } catch (error: any) {
    console.error("Network or fetch error calling HPKV API:", error);
    return { data: null, error: `Network error: ${error.message || "Unknown fetch error"}`, status: 500 };
  }
}

