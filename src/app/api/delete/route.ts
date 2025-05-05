import { NextResponse } from "next/server";
import { callHpkVApi } from "@/lib/hpkv-api";
import { 
    METADATA_SUFFIX, 
    CHUNK_SUFFIX, 
    MAX_CHUNK_SIZE, 
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

interface ListItem {
  key: string;
  version: number;
  createdAt: string;
  updatedAt: string;
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
    if (metadataObject.size > 0 && metadataObject.num_chunks === undefined) {
        metadataObject.num_chunks = Math.ceil(metadataObject.size / MAX_CHUNK_SIZE);
    }
    return { metadata: metadataObject, error: null, status: 200 };
  } catch (parseError: any) {
    return { metadata: null, error: `Failed to parse metadata JSON: ${parseError.message}`, status: 500 };
  }
}

// Helper to list all keys with a prefix (no delimiter)
async function listAllKeysWithPrefix(prefix: string, apiKey: string, apiUrl: string): Promise<{ keys: string[] | null; error: string | null; status: number }> {
    let allKeys: string[] = [];
    let marker: string | undefined = undefined;

    try {
        do {
            const params: Record<string, string> = { prefix: prefix };
            if (marker) {
                params.marker = marker;
            }
            const { data, error, status } = await callHpkVApi<{ items: ListItem[], nextMarker?: string }>({ 
                method: "GET", 
                apiKey, 
                apiUrl, 
                path: "/list", 
                params: params
            });

            if (error) {
                return { keys: null, error: `Failed to list keys with prefix ${prefix}: ${error}`, status };
            }
            if (!data || !data.items) {
                return { keys: null, error: "Invalid response from HPKV list API", status: 500 };
            }

            allKeys = allKeys.concat(data.items.map(item => item.key));
            marker = data.nextMarker;

        } while (marker);

        return { keys: allKeys, error: null, status: 200 };

    } catch (err: any) {
        console.error(`Error listing all keys with prefix ${prefix}:`, err);
        return { keys: null, error: `Internal server error during listing: ${err.message}`, status: 500 };
    }
}

// Helper to delete a single key
async function deleteKey(key: string, apiKey: string, apiUrl: string): Promise<{ error: string | null; status: number }> {
    const { error, status } = await callHpkVApi({ 
        method: "DELETE", 
        apiKey, 
        apiUrl, 
        path: "/record", 
        params: { key: key } 
    });
    // Ignore 404 on delete, it means already gone
    if (status === 404) {
        return { error: null, status: 200 };
    }
    return { error, status };
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const path = searchParams.get("path");
  const apiKey = request.headers.get(HPKV_API_KEY_PARAM);
  const apiUrl = request.headers.get(HPKV_API_URL_PARAM);

  if (!path || path === "/") {
    return NextResponse.json({ error: "Path parameter is required and cannot be root (/)" }, { status: 400 });
  }
  if (!apiKey || !apiUrl) {
    return NextResponse.json({ error: "API key and API URL headers are required" }, { status: 401 });
  }

  try {
    // 1. Get metadata to determine if it's a file or directory
    const { metadata, error: metaError, status: metaStatus } = await getMetadata(path, apiKey, apiUrl);

    if (metaStatus === 404) {
        // Metadata doesn't exist, maybe it's just chunks? Or truly doesn't exist.
        // Let's try deleting any potential chunks anyway.
        console.warn(`Metadata not found for ${path} during delete. Attempting chunk cleanup.`);
    } else if (metaError) {
        return NextResponse.json({ error: metaError }, { status: metaStatus });
    }

    const isDirectory = metadata && (metadata.mode & 0o170000) === 0o040000; // S_IFDIR
    const metadataKey = `${path}${METADATA_SUFFIX}`;

    if (isDirectory) {
        // 2a. If directory, check if empty by listing children
        const prefix = path.endsWith("/") ? path : `${path}/`;
        const { keys: childKeys, error: listError, status: listStatus } = await listAllKeysWithPrefix(prefix, apiKey, apiUrl);
        
        if (listError) {
            return NextResponse.json({ error: `Failed to check if directory is empty: ${listError}` }, { status: listStatus });
        }

        if (childKeys && childKeys.length > 0) {
            return NextResponse.json({ error: "Directory not empty" }, { status: 400 });
        }

        // Directory is empty, delete metadata key
        const { error: deleteMetaError, status: deleteMetaStatus } = await deleteKey(metadataKey, apiKey, apiUrl);
        if (deleteMetaError) {
            return NextResponse.json({ error: `Failed to delete directory metadata: ${deleteMetaError}` }, { status: deleteMetaStatus });
        }
    } else {
        // 2b. If file (or metadata didn't exist), delete metadata and all associated chunks
        const keysToDelete: string[] = [];
        if (metadata || metaStatus === 404) { // Add metadata key if it existed or might have existed
            keysToDelete.push(metadataKey);
        }

        // Find all chunk keys associated with the file path
        const chunkPrefix = `${path}${CHUNK_SUFFIX}`;
        const { keys: chunkKeys, error: listChunkError, status: listChunkStatus } = await listAllKeysWithPrefix(chunkPrefix, apiKey, apiUrl);

        if (listChunkError) {
            // Log the error but proceed to delete metadata if possible
            console.error(`Failed to list chunks for deletion for ${path}: ${listChunkError}`);
        } else if (chunkKeys) {
            keysToDelete.push(...chunkKeys);
        }

        // Delete all keys (metadata + chunks)
        const deletePromises = keysToDelete.map(key => deleteKey(key, apiKey, apiUrl));
        const results = await Promise.all(deletePromises);

        const firstError = results.find(r => r.error);
        if (firstError) {
            // Report the first error encountered
            return NextResponse.json({ error: `Failed to delete one or more keys for ${path}: ${firstError.error}` }, { status: firstError.status });
        }
    }

    return NextResponse.json({ success: true }, { status: 200 });

  } catch (err: any) {
    console.error(`Error deleting path ${path}:`, err);
    return NextResponse.json({ error: `Internal server error: ${err.message}` }, { status: 500 });
  }
}

