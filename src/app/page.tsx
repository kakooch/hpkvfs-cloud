	"use client";

import React from 'react';
import { useAuth } from '@/lib/auth-context';
import { LoginForm } from '@/components/login-form';
import FileManager from '@/components/file-manager'; // Import the new component

export default function Home() {
  const { isAuthenticated } = useAuth();

  return (
    <main className="min-h-screen">
      {isAuthenticated ? (
        <FileManager /> // Render FileManager if authenticated
      ) : (
        <LoginForm /> // Render LoginForm if not authenticated
      )}
    </main>
  );
}

