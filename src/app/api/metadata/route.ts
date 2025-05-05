import { NextResponse } from "next/server";
import { callHpkVApi } from "@/lib/hpkv-api";
import { METADATA_SUFFIX, HPKV_API_KEY_PARAM, HPKV_API_URL_PARAM } from "@/lib/constants";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const path = searchParams.get("path");
  const apiKey = request.headers.get(HPKV_API_KEY_PARAM);
  const apiUrl = request.headers.get(HPKV_API_URL_PARAM);

  if (!path) {
    return NextResponse.json({ error: "Path parameter is required" }, { status: 400 });
  }
  if (!apiKey || !apiUrl) {
    return NextResponse.json({ error: "API key and API URL headers are required" }, { status: 401 });
  }

  const metadataKey = path === "/" ? "/.__meta__" : `${path}${METADATA_SUFFIX}`;

  try {
    const { data, error, status } = await callHpkVApi<{
      key: string;
      value: string; // Expecting JSON string
      version: number;
      createdAt: string;
      updatedAt: string;
    }>({ 
      method: "GET", 
      apiKey, 
      apiUrl, 
      path: "/record", 
      params: { key: metadataKey } 
    });

    if (error) {
      // If root metadata doesn't exist, don't treat as error yet (might be handled by auto-init later)
      // For now, just return the error from the API call
      return NextResponse.json({ error: `Failed to get metadata: ${error}` }, { status });
    }

    if (!data || !data.value) {
        return NextResponse.json({ error: "Metadata not found or invalid format" }, { status: 404 });
    }

    // Parse the inner JSON string stored in the 'value' field
    let metadataObject;
    try {
        metadataObject = JSON.parse(data.value);
    } catch (parseError: any) {
        console.error(`Failed to parse metadata JSON for key ${metadataKey}: ${data.value}`, parseError);
        return NextResponse.json({ error: `Failed to parse metadata JSON: ${parseError.message}` }, { status: 500 });
    }

    return NextResponse.json(metadataObject, { status: 200 });

  } catch (err: any) {
    console.error("Error fetching metadata:", err);
    return NextResponse.json({ error: `Internal server error: ${err.message}` }, { status: 500 });
  }
}

