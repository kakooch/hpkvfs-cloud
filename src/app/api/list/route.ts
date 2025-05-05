import { NextResponse } from "next/server";
import { callHpkVApi } from "@/lib/hpkv-api";
import { METADATA_SUFFIX, HPKV_API_KEY_PARAM, HPKV_API_URL_PARAM } from "@/lib/constants";

interface ListItem {
  key: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const path = searchParams.get("path"); // The directory path to list
  const apiKey = request.headers.get(HPKV_API_KEY_PARAM);
  const apiUrl = request.headers.get(HPKV_API_URL_PARAM);

  if (!path) {
    return NextResponse.json({ error: "Path parameter is required" }, { status: 400 });
  }
  if (!apiKey || !apiUrl) {
    return NextResponse.json({ error: "API key and API URL headers are required" }, { status: 401 });
  }

  // Ensure path ends with / for prefix matching, unless it's the root
  const prefix = path === "/" ? "/" : path.endsWith("/") ? path : `${path}/`;

  try {
    const { data, error, status } = await callHpkVApi<{ items: ListItem[] }>({ 
      method: "GET", 
      apiKey, 
      apiUrl, 
      path: "/list", 
      params: { prefix: prefix, delimiter: "/" } // Use delimiter to simulate directory structure
    });

    if (error) {
      return NextResponse.json({ error: `Failed to list keys: ${error}` }, { status });
    }

    if (!data || !data.items) {
      return NextResponse.json({ error: "Invalid response from HPKV list API" }, { status: 500 });
    }

    const entries: { name: string; isDir: boolean }[] = [];
    const processedPrefixes = new Set<string>();

    for (const item of data.items) {
      // Skip the directory's own metadata key if listing root
      if (prefix === "/" && item.key === "/.__meta__") continue;
      // Skip the directory's own metadata key if listing a subdirectory
      if (item.key === `${prefix.slice(0, -1)}${METADATA_SUFFIX}`) continue;

      // Check if it's a metadata key (file or directory)
      if (item.key.endsWith(METADATA_SUFFIX)) {
        const fullPath = item.key.substring(0, item.key.length - METADATA_SUFFIX.length);
        // Extract the name relative to the prefix
        if (fullPath.startsWith(prefix)) {
          const name = fullPath.substring(prefix.length);
          // Only include direct children (no slashes in the name)
          if (name && !name.includes("/")) {
            // We need to determine if it's a file or directory. 
            // A simple heuristic: if a key exists without .__meta__, it's likely a file's chunk.
            // A more robust way requires fetching metadata, but for listing, we might infer.
            // Let's assume metadata means it *could* be a dir or file.
            // We need the actual metadata to be sure, but for a basic list, let's mark based on key.
            // A better approach would be to fetch metadata for each, but that's slow.
            // Compromise: Assume metadata key = directory unless a chunk key also exists?
            // Simplest for now: just return the name. UI will fetch metadata on click.
            entries.push({ name: name, isDir: false }); // Default to file, UI can fetch metadata to confirm
          }
        }
      } else if (item.key.startsWith(prefix)) {
          // Handle potential subdirectories indicated by delimiter
          const relativePath = item.key.substring(prefix.length);
          const parts = relativePath.split('/');
          if (parts.length > 1 && parts[0]) { // It's a subdirectory
              const dirName = parts[0];
              if (!processedPrefixes.has(dirName)) {
                  entries.push({ name: dirName, isDir: true });
                  processedPrefixes.add(dirName);
              }
          }
      }
    }

    // TODO: Refine isDir logic. Currently relies heavily on delimiter or assumes file.
    // A better list would fetch metadata for each entry, but that's slow.
    // Maybe the UI fetches metadata lazily?

    // Remove duplicates that might arise from different listing methods
    const uniqueEntries = Array.from(new Map(entries.map(e => [e.name, e])).values());

    return NextResponse.json(uniqueEntries, { status: 200 });

  } catch (err: any) {
    console.error("Error listing directory:", err);
    return NextResponse.json({ error: `Internal server error: ${err.message}` }, { status: 500 });
  }
}

