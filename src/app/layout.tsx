import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context"; // Import AuthProvider
import { ThemeProvider } from "@/components/theme-provider"; // Assuming theme provider exists
import { Toaster } from "@/components/ui/sonner" // Import Toaster for notifications

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "HPKVFS Cloud",
  description: "Web interface for HPKV filesystem",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
        >
            <AuthProvider> {/* Wrap application with AuthProvider */} 
                {children}
                <Toaster /> {/* Add Toaster for notifications */} 
            </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

