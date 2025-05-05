	"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/lib/auth-context';
import { toast } from "sonner";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import Link from 'next/link'; // Import Link
import { Folder, File, Trash2, Upload, FolderPlus, ArrowLeft, Edit, RefreshCw, X, BookOpen } from 'lucide-react'; // Add BookOpen icon
import { HPKV_API_KEY_PARAM, HPKV_API_URL_PARAM } from '@/lib/constants';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress"; // Import Progress component

interface FileEntry {
    name: string;
    isDir: boolean;
    // Add other metadata if needed later (size, mtime etc.)
}

// Helper function for API calls within the component
async function callApi(endpoint: string, options: RequestInit, errorMessagePrefix: string) {
    const response = await fetch(endpoint, options);
    if (!response.ok) {
        let errorMsg = `${errorMessagePrefix}. Status: ${response.status}`;
        try {
            const errorData = await response.json();
            errorMsg = errorData.error || errorMsg;
        } catch (e) { /* Ignore JSON parsing error */ }
        throw new Error(errorMsg);
    }
    return response.json();
}

export default function FileManager() {
    const { apiKey, apiUrl, logout } = useAuth();
    const [currentPath, setCurrentPath] = useState<string>("/");
    const [entries, setEntries] = useState<FileEntry[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [editingFile, setEditingFile] = useState<FileEntry | null>(null);
    const [fileContent, setFileContent] = useState<string>("");
    const [isEditorLoading, setIsEditorLoading] = useState<boolean>(false);
    const [uploadProgress, setUploadProgress] = useState<number | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const getApiHeaders = useCallback(() => ({
        [HPKV_API_KEY_PARAM]: apiKey || '',
        [HPKV_API_URL_PARAM]: apiUrl || '',
    }), [apiKey, apiUrl]);

    const fetchEntries = useCallback(async (path: string, showToast = false) => {
        if (!apiKey || !apiUrl) return;
        setIsLoading(true);
        setError(null);
        const toastId = showToast ? toast.loading(`Loading ${path}...`) : undefined;
        try {
            const data = await callApi(
                `/api/list?path=${encodeURIComponent(path)}`,
                { headers: getApiHeaders() },
                'Failed to list directory'
            );
            data.sort((a: FileEntry, b: FileEntry) => {
                if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
                return a.name.localeCompare(b.name);
            });
            setEntries(data);
            if (toastId) toast.success(`Loaded ${path}`, { id: toastId });
        } catch (err: any) {
            console.error("Error fetching directory listing:", err);
            setError(err.message);
            if (toastId) toast.error(err.message, { id: toastId });
            else toast.error(err.message);
            setEntries([]);
        } finally {
            setIsLoading(false);
        }
    }, [apiKey, apiUrl, getApiHeaders]);

    useEffect(() => {
        fetchEntries(currentPath);
    }, [currentPath, fetchEntries]);

    const handleNavigate = (entry: FileEntry) => {
        if (entry.isDir) {
            const newPath = currentPath === "/" ? `/${entry.name}` : `${currentPath}/${entry.name}`;
            setCurrentPath(newPath);
        } else {
            handleEdit(entry); // Open editor on file click
        }
    };

    const handleGoUp = () => {
        if (currentPath === "/") return;
        const parts = currentPath.split("/").filter(p => p);
        parts.pop();
        const newPath = parts.length === 0 ? "/" : `/${parts.join("/")}`;
        setCurrentPath(newPath);
    };

    const handleDelete = async (entry: FileEntry) => {
        const pathToDelete = currentPath === "/" ? `/${entry.name}` : `${currentPath}/${entry.name}`;
        if (!confirm(`Are you sure you want to delete '${entry.name}'?`)) return;

        const toastId = toast.loading(`Deleting ${entry.name}...`);
        try {
            await callApi(
                `/api/delete?path=${encodeURIComponent(pathToDelete)}`,
                { method: 'DELETE', headers: getApiHeaders() },
                `Failed to delete ${entry.name}`
            );
            toast.success(`${entry.name} deleted successfully.`, { id: toastId });
            fetchEntries(currentPath); // Refresh list
        } catch (err: any) {
            console.error("Delete error:", err);
            toast.error(err.message, { id: toastId });
        }
    };

    const handleCreateDir = async () => {
        const dirName = prompt("Enter new directory name:");
        if (!dirName || dirName.includes("/")) {
            if (dirName !== null) toast.error("Invalid directory name.");
            return;
        }
        const newDirPath = currentPath === "/" ? `/${dirName}` : `${currentPath}/${dirName}`;
        const toastId = toast.loading(`Creating directory ${dirName}...`);
        try {
            await callApi(
                `/api/mkdir?path=${encodeURIComponent(newDirPath)}`,
                { method: 'POST', headers: getApiHeaders() },
                `Failed to create directory ${dirName}`
            );
            toast.success(`Directory ${dirName} created.`, { id: toastId });
            fetchEntries(currentPath); // Refresh list
        } catch (err: any) {
            console.error("Mkdir error:", err);
            toast.error(err.message, { id: toastId });
        }
    };

    const handleUploadClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files || files.length === 0) return;
        const file = files[0];
        const filePath = currentPath === "/" ? `/${file.name}` : `${currentPath}/${file.name}`;
        
        const toastId = toast.loading(`Uploading ${file.name}...`);
        setUploadProgress(0);

        try {
            // Read file as ArrayBuffer, then convert to Base64
            const reader = new FileReader();
            reader.onload = async (loadEvent) => {
                if (!loadEvent.target?.result) {
                    toast.error("Failed to read file.", { id: toastId });
                    setUploadProgress(null);
                    return;
                }
                const arrayBuffer = loadEvent.target.result as ArrayBuffer;
                const base64String = Buffer.from(arrayBuffer).toString('base64');

                // Use fetch with XMLHttpRequest for progress tracking (or modify API to support chunked upload status)
                // Simple POST for now, no granular progress within the single request
                try {
                    await callApi(
                        `/api/write?path=${encodeURIComponent(filePath)}&offset=0`,
                        {
                            method: 'POST',
                            headers: getApiHeaders(),
                            body: base64String // Send base64 data
                        },
                        `Failed to upload ${file.name}`
                    );
                    toast.success(`${file.name} uploaded successfully.`, { id: toastId });
                    fetchEntries(currentPath); // Refresh list
                } catch (uploadErr: any) {
                     console.error("Upload error:", uploadErr);
                     toast.error(uploadErr.message, { id: toastId });
                } finally {
                     setUploadProgress(null);
                     // Reset file input
                     if(fileInputRef.current) fileInputRef.current.value = "";
                }
            };
            reader.onerror = () => {
                toast.error("Error reading file for upload.", { id: toastId });
                setUploadProgress(null);
            };
            // Simulate progress for demo - replace with actual XHR progress later if needed
            reader.onprogress = (event) => {
                 if (event.lengthComputable) {
                    const percentComplete = Math.round((event.loaded / event.total) * 100);
                    setUploadProgress(percentComplete);
                 }
            };
            reader.readAsArrayBuffer(file);

        } catch (err: any) {
            console.error("File selection/read error:", err);
            toast.error(err.message || "An error occurred during file selection.", { id: toastId });
            setUploadProgress(null);
            if(fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    const handleEdit = async (entry: FileEntry) => {
        if (entry.isDir) return;
        setEditingFile(entry);
        setIsEditorLoading(true);
        setFileContent(""); // Clear previous content
        const filePath = currentPath === "/" ? `/${entry.name}` : `${currentPath}/${entry.name}`;
        const toastId = toast.loading(`Loading ${entry.name} for editing...`);
        try {
            // Fetch metadata first to get size
            const metaResponse = await fetch(`/api/metadata?path=${encodeURIComponent(filePath)}`, { headers: getApiHeaders() });
            if (!metaResponse.ok) throw new Error("Failed to get file metadata.");
            const metadata = await metaResponse.json();
            const fileSize = metadata.size || 0;

            if (fileSize > 1024 * 1024 * 5) { // Limit editor to 5MB for performance
                 throw new Error("File is too large to edit in the browser (> 5MB).");
            }

            // Fetch content using the read API
            const contentResponse = await fetch(`/api/read?path=${encodeURIComponent(filePath)}&offset=0&size=${fileSize}`, {
                 headers: getApiHeaders()
            });
            if (!contentResponse.ok) {
                throw new Error(`Failed to read file content. Status: ${contentResponse.status}`);
            }
            const content = await contentResponse.text(); // Assuming text file
            setFileContent(content);
            toast.success(`Loaded ${entry.name}.`, { id: toastId });
        } catch (err: any) {
            console.error("Edit error:", err);
            toast.error(err.message, { id: toastId });
            setEditingFile(null); // Close editor on error
        } finally {
            setIsEditorLoading(false);
        }
    };

    const handleSaveEdit = async () => {
        if (!editingFile) return;
        const filePath = currentPath === "/" ? `/${editingFile.name}` : `${currentPath}/${editingFile.name}`;
        const toastId = toast.loading(`Saving ${editingFile.name}...`);
        setIsEditorLoading(true);
        try {
            const base64Content = Buffer.from(fileContent).toString('base64');
            await callApi(
                `/api/write?path=${encodeURIComponent(filePath)}&offset=0`,
                {
                    method: 'POST',
                    headers: getApiHeaders(),
                    body: base64Content
                },
                `Failed to save ${editingFile.name}`
            );
            // TODO: Implement truncate if new content is smaller than old content?
            // The current write API implicitly truncates if the written size < metadata size, 
            // but only if the write starts at offset 0 and covers the new size. Needs verification.
            // A dedicated truncate API might be better.
            toast.success(`${editingFile.name} saved successfully.`, { id: toastId });
            setEditingFile(null); // Close editor
            fetchEntries(currentPath); // Refresh list (optional, maybe just update metadata locally)
        } catch (err: any) {
            console.error("Save error:", err);
            toast.error(err.message, { id: toastId });
        } finally {
            setIsEditorLoading(false);
        }
    };

    return (
        <div className="container mx-auto p-4">
            {/* Header */} 
            <div className="flex justify-between items-center mb-4">
                <h1 className="text-2xl font-semibold">HPKV Cloud</h1>
                <Button variant="outline" onClick={logout}>Logout</Button>
            </div>

            {/* Path Breadcrumbs/Display */} 
            <div className="mb-4 p-2 border rounded bg-muted text-muted-foreground overflow-x-auto whitespace-nowrap">
                Current Path: {currentPath}
            </div>

            {/* Action Buttons */} 
            <div className="flex items-center gap-2 mb-4 flex-wrap">
                <Button variant="outline" size="icon" onClick={handleGoUp} disabled={currentPath === "/" || isLoading} title="Go Up">
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" onClick={() => fetchEntries(currentPath, true)} disabled={isLoading} title="Refresh">
                    <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} /> Refresh
                </Button>
                <Button variant="outline" onClick={handleCreateDir} disabled={isLoading} title="Create Directory">
                    <FolderPlus className="mr-2 h-4 w-4" /> Create Directory
                </Button>
                <Button variant="outline" onClick={handleUploadClick} disabled={isLoading} title="Upload File">
                    <Upload className="mr-2 h-4 w-4" /> Upload File
                </Button>
                <Link href="/docs" passHref legacyBehavior>
                    <a target="_blank" rel="noopener noreferrer">
                        <Button variant="outline" title="API Documentation">
                            <BookOpen className="mr-2 h-4 w-4" /> API Docs
                        </Button>
                    </a>
                </Link>
                <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileSelected} 
                    className="hidden" 
                />
            </div>

            {/* Upload Progress */} 
            {uploadProgress !== null && (
                <div className="mb-4">
                    <Progress value={uploadProgress} className="w-full" />
                    <p className="text-sm text-muted-foreground text-center mt-1">Uploading... {uploadProgress}%</p>
                </div>
            )}

            {/* Loading/Error State */} 
            {isLoading && <p className="text-center p-4">Loading directory...</p>}
            {error && <p className="text-red-500 text-center p-4">Error: {error}</p>}
            
            {/* File Table */} 
            {!isLoading && !error && (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[50px]"></TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {entries.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={3} className="text-center text-muted-foreground py-4">
                                    Directory is empty
                                </TableCell>
                            </TableRow>
                        )}
                        {entries.map((entry) => (
                            <TableRow key={entry.name}>
                                <TableCell>
                                    {entry.isDir ? <Folder className="h-5 w-5 text-blue-500" /> : <File className="h-5 w-5 text-gray-500" />}
                                </TableCell>
                                <TableCell 
                                    className={`font-medium ${entry.isDir ? 'cursor-pointer hover:underline' : 'cursor-pointer hover:underline'}`}
                                    onClick={() => handleNavigate(entry)}
                                >
                                    {entry.name}
                                </TableCell>
                                <TableCell className="text-right space-x-1">
                                    {!entry.isDir && (
                                         <Button variant="ghost" size="icon" onClick={() => handleEdit(entry)} title="Edit">
                                            <Edit className="h-4 w-4" />
                                        </Button>
                                    )}
                                    <Button variant="ghost" size="icon" onClick={() => handleDelete(entry)} title="Delete">
                                        <Trash2 className="h-4 w-4 text-red-500" />
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            )}

            {/* Editor Dialog */} 
            <Dialog open={!!editingFile} onOpenChange={(isOpen) => !isOpen && setEditingFile(null)}>
                <DialogContent className="sm:max-w-[80vw] h-[80vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle>Edit File: {editingFile?.name}</DialogTitle>
                    </DialogHeader>
                    <div className="flex-grow overflow-auto py-4">
                        {isEditorLoading ? (
                            <p>Loading file content...</p>
                        ) : (
                            <Textarea 
                                value={fileContent}
                                onChange={(e) => setFileContent(e.target.value)}
                                className="h-full w-full resize-none font-mono text-sm"
                                placeholder="File content..."
                            />
                        )}
                    </div>
                    <DialogFooter className="sm:justify-end">
                         <DialogClose asChild>
                            <Button type="button" variant="secondary" disabled={isEditorLoading}>
                                Cancel
                            </Button>
                        </DialogClose>
                        <Button type="button" onClick={handleSaveEdit} disabled={isEditorLoading}>
                            {isEditorLoading ? "Saving..." : "Save Changes"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

