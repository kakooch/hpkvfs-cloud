import { NextResponse } from "next/server";
import { callHpkVApi } from "@/lib/hpkv-api";
import { 
    METADATA_SUFFIX, 
    DEFAULT_DIR_MODE, 
    HPKV_API_KEY_PARAM, 
    HPKV_API_URL_PARAM 
} from "@/lib/constants";

interface Metadata {
  mode: number;
  uid: number;
  gid: number;
  size: number;
  atime: number;
  mtime: number;
  ctime: number;
  num_chunks?: number;
}

// Helper to get metadata
async function getMetadata(path: string, apiKey: string, apiUrl: string): Promise<{ metadata: Metadata | null; error: string | null; status: number }> {
  const metadataKey = path === "/" ? "/.__meta__" : `${path}${METADATA_SUFFIX}`;
  const { data, error, status } = await callHpkVApi<{ value: string }>({ 
    method: "GET", 
    apiKey, 
    apiUrl, 
    path: "/record", 
    params: { key: metadataKey } 
  });

  if (status === 404) {
      return { metadata: null, error: null, status: 404 }; // Not found is not an error here
  }
  if (error) {
    return { metadata: null, error: `Failed to get metadata: ${error}`, status };
  }
  if (!data || !data.value) {
    return { metadata: null, error: "Metadata found but invalid format", status: 500 };
  }

  try {
    const metadataObject = JSON.parse(data.value);
    // No need to calculate num_chunks for directories
    return { metadata: metadataObject, error: null, status: 200 };
  } catch (parseError: any) {
    return { metadata: null, error: `Failed to parse metadata JSON: ${parseError.message}`, status: 500 };
  }
}

// Helper to write metadata
async function writeMetadata(path: string, metadata: Metadata, apiKey: string, apiUrl: string): Promise<{ error: string | null; status: number }> {
    const metadataKey = `${path}${METADATA_SUFFIX}`;
    const { error, status } = await callHpkVApi({ 
        method: "POST", 
        apiKey, 
        apiUrl, 
        path: "/record", 
        body: { key: metadataKey, value: JSON.stringify(metadata) } 
    });
    return { error, status };
}

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const path = searchParams.get("path");
  // Mode could be passed, but for simplicity, we use default dir mode
  // const modeStr = searchParams.get("mode"); 
  const apiKey = request.headers.get(HPKV_API_KEY_PARAM);
  const apiUrl = request.headers.get(HPKV_API_URL_PARAM);

  if (!path || path === "/") {
    return NextResponse.json({ error: "Path parameter is required and cannot be root (/)" }, { status: 400 });
  }
  if (!apiKey || !apiUrl) {
    return NextResponse.json({ error: "API key and API URL headers are required" }, { status: 401 });
  }

  // Basic validation: path should not end with /
  if (path.endsWith("/")) {
      return NextResponse.json({ error: "Directory path should not end with a slash" }, { status: 400 });
  }

  try {
    // 1. Check if path already exists
    const { metadata, error: metaError, status: metaStatus } = await getMetadata(path, apiKey, apiUrl);

    if (metaError) {
        // Error other than 404
        return NextResponse.json({ error: `Failed to check existing path: ${metaError}` }, { status: metaStatus });
    }

    if (metadata) {
        // Path exists, check if it is a directory
        if ((metadata.mode & 0o170000) === 0o040000) { // S_IFDIR
            // Already exists as a directory, idempotent success
            return NextResponse.json({ success: true, message: "Directory already exists" }, { status: 200 });
        } else {
            // Exists but is not a directory (e.g., a file)
            return NextResponse.json({ error: "Path exists but is not a directory" }, { status: 409 }); // 409 Conflict
        }
    }

    // 2. Path does not exist, create new directory metadata
    const now = Math.floor(Date.now() / 1000);
    // TODO: Get actual UID/GID from user context if possible, else use defaults
    const newMetadata: Metadata = {
        mode: DEFAULT_DIR_MODE, // Default directory permissions (rwxr-xr-x)
        uid: 1000, // Placeholder
        gid: 1000, // Placeholder
        size: 0, // Directories have 0 size in this model
        atime: now,
        mtime: now,
        ctime: now,
        // num_chunks is not relevant for directories
    };

    const { error: writeMetaError, status: writeMetaStatus } = await writeMetadata(path, newMetadata, apiKey, apiUrl);

    if (writeMetaError) {
        return NextResponse.json({ error: `Failed to create directory metadata: ${writeMetaError}` }, { status: writeMetaStatus });
    }

    return NextResponse.json({ success: true }, { status: 201 }); // 201 Created

  } catch (err: any) {
    console.error(`Error creating directory ${path}:`, err);
    return NextResponse.json({ error: `Internal server error: ${err.message}` }, { status: 500 });
  }
}

