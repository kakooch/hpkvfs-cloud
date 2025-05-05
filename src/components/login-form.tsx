	"use client";

import React, { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export function LoginForm() {
  const [apiKey, setApiKey] = useState('');
  const [apiUrl, setApiUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const auth = useAuth();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    // Basic validation
    if (!apiKey || !apiUrl) {
        toast.error("API Key and API URL are required.");
        setIsLoading(false);
        return;
    }
    try {
        // Attempt a simple API call to validate credentials (e.g., get root metadata)
        const response = await fetch(`/api/metadata?path=/`, {
            headers: {
                'hpkv-api-key': apiKey,
                'hpkv-api-url': apiUrl,
            }
        });
        if (!response.ok) {
            let errorMsg = `Login failed. Status: ${response.status}`;
            try {
                const errorData = await response.json();
                errorMsg = errorData.error || errorMsg;
            } catch (e) { /* Ignore JSON parsing error */ }
            // Handle specific case where root metadata doesn't exist yet (which is okay)
            if (response.status === 404 && errorMsg.includes("Metadata not found")) {
                 // Proceed with login even if root is not initialized
                 auth.login(apiKey, apiUrl);
                 toast.success("Login successful (root will be initialized if needed).");
            } else {
                throw new Error(errorMsg);
            }
        } else {
             auth.login(apiKey, apiUrl);
             toast.success("Login successful.");
        }
    } catch (error: any) {
        console.error("Login error:", error);
        toast.error(error.message || "An unexpected error occurred during login.");
    } finally {
        setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
        <Card className="w-full max-w-sm">
            <CardHeader>
                <CardTitle className="text-2xl">HPKV Cloud Login</CardTitle>
                <CardDescription>
                Enter your HPKV API endpoint and key to access your filesystem.
                </CardDescription>
            </CardHeader>
            <form onSubmit={handleSubmit}>
                <CardContent className="grid gap-4">
                    <div className="grid gap-2">
                        <Label htmlFor="apiUrl">API URL</Label>
                        <Input 
                            id="apiUrl" 
                            type="url" 
                            placeholder="https://api-eu-1.hpkv.io" 
                            required 
                            value={apiUrl}
                            onChange={(e) => setApiUrl(e.target.value)}
                            disabled={isLoading}
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="apiKey">API Key</Label>
                        <Input 
                            id="apiKey" 
                            type="password" 
                            required 
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            disabled={isLoading}
                        />
                    </div>
                </CardContent>
                <CardFooter>
                    <Button type="submit" className="w-full" disabled={isLoading}>
                        {isLoading ? "Verifying..." : "Sign in"}
                    </Button>
                </CardFooter>
            </form>
        </Card>
    </div>
  );
}

