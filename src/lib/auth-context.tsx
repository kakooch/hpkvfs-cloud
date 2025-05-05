'use client';

import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';

interface AuthContextType {
  apiKey: string | null;
  apiUrl: string | null;
  isAuthenticated: boolean;
  login: (key: string, url: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

const API_KEY_STORAGE_KEY = 'hpkv_apiKey';
const API_URL_STORAGE_KEY = 'hpkv_apiUrl';

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [apiUrl, setApiUrl] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true); // Start loading

  useEffect(() => {
    // Try to load credentials from session storage on initial mount
    try {
        const storedApiKey = sessionStorage.getItem(API_KEY_STORAGE_KEY);
        const storedApiUrl = sessionStorage.getItem(API_URL_STORAGE_KEY);
        if (storedApiKey && storedApiUrl) {
            setApiKey(storedApiKey);
            setApiUrl(storedApiUrl);
            setIsAuthenticated(true);
        }
    } catch (error) {
        console.error("Could not access session storage:", error);
        // Handle environments where sessionStorage is not available or restricted
    }
    setIsLoading(false); // Finished loading
  }, []);

  const login = (key: string, url: string) => {
    try {
        sessionStorage.setItem(API_KEY_STORAGE_KEY, key);
        sessionStorage.setItem(API_URL_STORAGE_KEY, url);
        setApiKey(key);
        setApiUrl(url);
        setIsAuthenticated(true);
    } catch (error) {
        console.error("Could not write to session storage:", error);
        // Optionally notify the user
    }
  };

  const logout = () => {
    try {
        sessionStorage.removeItem(API_KEY_STORAGE_KEY);
        sessionStorage.removeItem(API_URL_STORAGE_KEY);
        setApiKey(null);
        setApiUrl(null);
        setIsAuthenticated(false);
    } catch (error) {
        console.error("Could not remove from session storage:", error);
    }
  };

  // Don't render children until loading is complete to prevent flicker
  if (isLoading) {
    return null; // Or a loading spinner
  }

  return (
    <AuthContext.Provider value={{ apiKey, apiUrl, isAuthenticated, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

