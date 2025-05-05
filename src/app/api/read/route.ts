import { NextResponse } from "next/server";
import { callHpkVApi } from "@/lib/hpkv-api";
import { METADATA_SUFFIX, CHUNK_SUFFIX, MAX_CHUNK_SIZE, HPKV_API_KEY_PARAM, HPKV_API_URL_PARAM } from "@/lib/constants";

interface Metadata {
  mode: number;
  uid: number;
  gid: number;
  size: number;
  atime: number;
  mtime: number;
  ctime: number;
  num_chunks?: number; // Optional, might not be present in older metadata
}

// Helper to get metadata
async function getMetadata(path: string, apiKey: string, apiUrl: string): Promise<{ metadata: Metadata | null; error: string | null; status: number }> {
  const metadataKey = `${path}${METADATA_SUFFIX}`;
  const { data, error, status } = await callHpkVApi<{ value: string }>({ 
    method: "GET", 
    apiKey, 
    apiUrl, 
    path: "/record", 
    params: { key: metadataKey } 
  });

  if (error) {
    return { metadata: null, error: `Failed to get metadata: ${error}`, status };
  }
  if (!data || !data.value) {
    return { metadata: null, error: "Metadata not found or invalid format", status: 404 };
  }

  try {
    const metadataObject = JSON.parse(data.value);
    // Add num_chunks if missing (calculate from size)
    if (metadataObject.size > 0 && metadataObject.num_chunks === undefined) {
        metadataObject.num_chunks = Math.ceil(metadataObject.size / MAX_CHUNK_SIZE);
    }
    return { metadata: metadataObject, error: null, status: 200 };
  } catch (parseError: any) {
    return { metadata: null, error: `Failed to parse metadata JSON: ${parseError.message}`, status: 500 };
  }
}

// Helper to get a specific chunk
async function getChunk(path: string, chunkIndex: number, apiKey: string, apiUrl: string): Promise<{ chunkData: string | null; error: string | null; status: number }> {
    const chunkKey = `${path}${CHUNK_SUFFIX}${chunkIndex}`;
    const { data, error, status } = await callHpkVApi<{ value: string }>({ 
        method: "GET", 
        apiKey, 
        apiUrl, 
        path: "/record", 
        params: { key: chunkKey } 
    });

    if (error) {
        // Treat 404 as empty chunk potentially, but log other errors
        if (status !== 404) {
            console.error(`Error fetching chunk ${chunkKey}: ${error}`);
        }
        return { chunkData: null, error: status === 404 ? null : `Failed to get chunk ${chunkIndex}: ${error}`, status };
    }
    return { chunkData: data?.value ?? null, error: null, status: 200 };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const path = searchParams.get("path");
  const offsetStr = searchParams.get("offset");
  const sizeStr = searchParams.get("size");
  const apiKey = request.headers.get(HPKV_API_KEY_PARAM);
  const apiUrl = request.headers.get(HPKV_API_URL_PARAM);

  if (!path || offsetStr === null || sizeStr === null) {
    return NextResponse.json({ error: "Path, offset, and size parameters are required" }, { status: 400 });
  }
  if (!apiKey || !apiUrl) {
    return NextResponse.json({ error: "API key and API URL headers are required" }, { status: 401 });
  }

  const offset = parseInt(offsetStr, 10);
  const size = parseInt(sizeStr, 10);

  if (isNaN(offset) || isNaN(size) || offset < 0 || size < 0) {
    return NextResponse.json({ error: "Invalid offset or size" }, { status: 400 });
  }

  if (size === 0) {
    return new Response(null, { status: 200 }); // Read of size 0 is valid, return empty
  }

  try {
    // 1. Get metadata to find total size and number of chunks
    const { metadata, error: metaError, status: metaStatus } = await getMetadata(path, apiKey, apiUrl);
    if (metaError || !metadata) {
      return NextResponse.json({ error: metaError || "Metadata not found" }, { status: metaStatus });
    }

    // Check if it's a directory
    if ((metadata.mode & 0o170000) === 0o040000) { // S_IFDIR
        return NextResponse.json({ error: "Path is a directory" }, { status: 400 });
    }

    const fileSize = metadata.size;
    if (offset >= fileSize) {
      return new Response(null, { status: 200 }); // Offset is beyond file size, return empty
    }

    const readSize = Math.min(size, fileSize - offset);
    if (readSize <= 0) {
        return new Response(null, { status: 200 }); // Nothing to read
    }

    const numChunks = metadata.num_chunks ?? Math.ceil(fileSize / MAX_CHUNK_SIZE);
    const startChunk = Math.floor(offset / MAX_CHUNK_SIZE);
    const endChunk = Math.floor((offset + readSize - 1) / MAX_CHUNK_SIZE);

    let combinedData = "";
    let bytesRead = 0;

    // 2. Read necessary chunks
    for (let i = startChunk; i <= endChunk && i < numChunks; i++) {
      const { chunkData, error: chunkError, status: chunkStatus } = await getChunk(path, i, apiKey, apiUrl);
      
      if (chunkError) {
        // If a chunk is missing (404), treat it as empty/sparse, otherwise it's a real error
        if (chunkStatus !== 404) {
            return NextResponse.json({ error: chunkError }, { status: chunkStatus });
        }
        // If chunkData is null due to 404, effectively skip adding data from this chunk
      }

      const chunkContent = chunkData || ""; // Treat null (missing chunk) as empty string
      const chunkStartOffset = i * MAX_CHUNK_SIZE;
      
      // Calculate the portion of this chunk we need
      const readStartInChunk = Math.max(0, offset - chunkStartOffset);
      const readEndInChunk = Math.min(chunkContent.length, offset + readSize - chunkStartOffset);
      const bytesToReadFromChunk = Math.max(0, readEndInChunk - readStartInChunk);

      if (bytesToReadFromChunk > 0) {
          combinedData += chunkContent.substring(readStartInChunk, readEndInChunk);
          bytesRead += bytesToReadFromChunk;
      }
      
      // Optimization: Stop if we have read enough bytes
      if (bytesRead >= readSize) {
          break;
      }
    }

    // Ensure we don't return more data than requested if calculations were slightly off
    if (combinedData.length > readSize) {
        combinedData = combinedData.substring(0, readSize);
    }

    // Return the combined data as plain text
    // Note: This assumes text data. Binary data would need base64 encoding/decoding.
    // For simplicity, we'll handle as text for now.
    return new Response(combinedData, { 
        status: 200, 
        headers: { 'Content-Type': 'application/octet-stream' } // Use octet-stream for generic data
    });

  } catch (err: any) {
    console.error("Error reading file:", err);
    return NextResponse.json({ error: `Internal server error: ${err.message}` }, { status: 500 });
  }
}

