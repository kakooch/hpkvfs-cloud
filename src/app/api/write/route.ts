import { NextResponse } from "next/server";
import { callHpkVApi } from "@/lib/hpkv-api";
import { 
    METADATA_SUFFIX, 
    CHUNK_SUFFIX, 
    MAX_CHUNK_SIZE, 
    DEFAULT_FILE_MODE, 
    HPKV_API_KEY_PARAM, 
    HPKV_API_URL_PARAM 
} from "@/lib/constants";
import { Buffer } from "buffer"; // Import Buffer for base64 handling

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

// Helper to get metadata (consider moving to a shared lib if used by many routes)
async function getMetadata(path: string, apiKey: string, apiUrl: string): Promise<{ metadata: Metadata | null; error: string | null; status: number }> {
  const metadataKey = `${path}${METADATA_SUFFIX}`;
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

// Helper to write a chunk
async function writeChunk(path: string, chunkIndex: number, chunkData: string, apiKey: string, apiUrl: string): Promise<{ error: string | null; status: number }> {
    const chunkKey = `${path}${CHUNK_SUFFIX}${chunkIndex}`;
    // Use POST which acts as upsert in HPKV
    const { error, status } = await callHpkVApi({ 
        method: "POST", 
        apiKey, 
        apiUrl, 
        path: "/record", 
        body: { key: chunkKey, value: chunkData } 
    });
    return { error, status };
}

// Helper to get a specific chunk (needed for partial writes)
async function getChunk(path: string, chunkIndex: number, apiKey: string, apiUrl: string): Promise<{ chunkData: string | null; error: string | null; status: number }> {
    const chunkKey = `${path}${CHUNK_SUFFIX}${chunkIndex}`;
    const { data, error, status } = await callHpkVApi<{ value: string }>({ 
        method: "GET", 
        apiKey, 
        apiUrl, 
        path: "/record", 
        params: { key: chunkKey } 
    });

    if (status === 404) {
        return { chunkData: null, error: null, status: 404 }; // Not found is okay, means empty chunk
    }
    if (error) {
        console.error(`Error fetching chunk ${chunkKey}: ${error}`);
        return { chunkData: null, error: `Failed to get chunk ${chunkIndex}: ${error}`, status };
    }
    return { chunkData: data?.value ?? null, error: null, status: 200 };
}

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const path = searchParams.get("path");
  const offsetStr = searchParams.get("offset");
  const apiKey = request.headers.get(HPKV_API_KEY_PARAM);
  const apiUrl = request.headers.get(HPKV_API_URL_PARAM);

  if (!path || offsetStr === null) {
    return NextResponse.json({ error: "Path and offset parameters are required" }, { status: 400 });
  }
  if (!apiKey || !apiUrl) {
    return NextResponse.json({ error: "API key and API URL headers are required" }, { status: 401 });
  }

  const offset = parseInt(offsetStr, 10);
  if (isNaN(offset) || offset < 0) {
    return NextResponse.json({ error: "Invalid offset" }, { status: 400 });
  }

  let writeDataB64: string;
  try {
    // Read the body which contains the base64 encoded data to write
    writeDataB64 = await request.text();
    if (!writeDataB64) {
        return NextResponse.json({ error: "Request body with base64 data is required" }, { status: 400 });
    }
  } catch (e: any) {
    return NextResponse.json({ error: `Failed to read request body: ${e.message}` }, { status: 400 });
  }

  let writeData: Buffer;
  try {
      writeData = Buffer.from(writeDataB64, 'base64');
  } catch (e: any) {
      return NextResponse.json({ error: `Invalid base64 data in request body: ${e.message}` }, { status: 400 });
  }
  
  const size = writeData.length;
  if (size === 0) {
      // Write of size 0 might mean truncate or just no-op, but let's ensure metadata exists.
      // We'll handle actual truncation in a separate endpoint or logic.
      // For now, just return success if size is 0.
      return NextResponse.json({ bytesWritten: 0 }, { status: 200 });
  }

  try {
    // 1. Get current metadata (or create if doesn't exist)
    let { metadata, error: metaError, status: metaStatus } = await getMetadata(path, apiKey, apiUrl);

    if (metaError) {
      return NextResponse.json({ error: metaError }, { status: metaStatus });
    }

    const now = Math.floor(Date.now() / 1000);
    let isNewFile = false;
    if (!metadata) {
      // File doesn't exist, create new metadata
      // TODO: Get actual UID/GID from user context if possible, else use defaults
      metadata = {
        mode: DEFAULT_FILE_MODE,
        uid: 1000, // Placeholder
        gid: 1000, // Placeholder
        size: 0,
        atime: now,
        mtime: now,
        ctime: now,
        num_chunks: 0
      };
      isNewFile = true;
    } else {
        // Check if it's a directory
        if ((metadata.mode & 0o170000) === 0o040000) { // S_IFDIR
            return NextResponse.json({ error: "Path is a directory" }, { status: 400 });
        }
    }

    // 2. Determine which chunks are affected
    const writeEnd = offset + size;
    const startChunk = Math.floor(offset / MAX_CHUNK_SIZE);
    const endChunk = Math.floor((writeEnd - 1) / MAX_CHUNK_SIZE);

    let currentWriteOffset = 0; // Tracks position within the input writeData

    // 3. Iterate through affected chunks, read-modify-write
    for (let i = startChunk; i <= endChunk; i++) {
      const chunkStart = i * MAX_CHUNK_SIZE;
      const chunkEnd = chunkStart + MAX_CHUNK_SIZE;

      // Get existing chunk data (might be null if new or sparse)
      const { chunkData: existingChunkStr, error: getChunkError, status: getChunkStatus } = await getChunk(path, i, apiKey, apiUrl);
      if (getChunkError) {
          return NextResponse.json({ error: getChunkError }, { status: getChunkStatus });
      }
      
      // Convert existing chunk string to Buffer
      let existingChunk = existingChunkStr ? Buffer.from(existingChunkStr, 'utf8') : Buffer.alloc(0);

      // Calculate write boundaries within this chunk
      const writeStartInChunk = Math.max(0, offset - chunkStart);
      const writeEndInChunk = Math.min(MAX_CHUNK_SIZE, writeEnd - chunkStart);
      const bytesToWriteInChunk = writeEndInChunk - writeStartInChunk;

      // Prepare the new chunk data
      const newChunkSize = Math.max(existingChunk.length, writeEndInChunk);
      const newChunk = Buffer.alloc(newChunkSize);

      // Copy prefix from existing chunk (if any)
      if (writeStartInChunk > 0) {
          existingChunk.copy(newChunk, 0, 0, Math.min(writeStartInChunk, existingChunk.length));
      }
      
      // Copy the new data from writeData
      writeData.copy(newChunk, writeStartInChunk, currentWriteOffset, currentWriteOffset + bytesToWriteInChunk);
      
      // Copy suffix from existing chunk (if any)
      if (writeEndInChunk < existingChunk.length) {
          existingChunk.copy(newChunk, writeEndInChunk, writeEndInChunk, existingChunk.length);
      }

      // Write the modified chunk back to HPKV (as utf8 string)
      const { error: writeChunkError, status: writeChunkStatus } = await writeChunk(path, i, newChunk.toString('utf8'), apiKey, apiUrl);
      if (writeChunkError) {
        return NextResponse.json({ error: `Failed to write chunk ${i}: ${writeChunkError}` }, { status: writeChunkStatus });
      }

      currentWriteOffset += bytesToWriteInChunk;
    }

    // 4. Update metadata (size, times, num_chunks)
    const newSize = Math.max(metadata.size, writeEnd);
    metadata.size = newSize;
    metadata.mtime = now;
    metadata.atime = now;
    if (isNewFile) metadata.ctime = now;
    metadata.num_chunks = Math.ceil(newSize / MAX_CHUNK_SIZE);

    const { error: metaWriteError, status: metaWriteStatus } = await writeMetadata(path, metadata, apiKey, apiUrl);
    if (metaWriteError) {
      // Attempt to rollback or log error? For now, just report.
      return NextResponse.json({ error: `Write succeeded but failed to update metadata: ${metaWriteError}` }, { status: metaWriteStatus });
    }

    return NextResponse.json({ bytesWritten: size }, { status: 200 });

  } catch (err: any) {
    console.error("Error writing file:", err);
    return NextResponse.json({ error: `Internal server error: ${err.message}` }, { status: 500 });
  }
}

