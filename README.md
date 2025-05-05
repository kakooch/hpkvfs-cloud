# HPKVFS Cloud

This project provides a web-based interface (`hpkvfs-cloud`) for interacting with an HPKV (High Performance Key-Value) store-  mirroring the filesystem logic implemented in the `hpkvfs` FUSE client.

It allows users to log in using their HPKV API endpoint and key, browse the key-value store as a filesystem, view/edit text files, upload files, create directories, and delete files/directories.

## Features

*   **Web-based File Management:** Access your HPKV store through a browser.
*   **Authentication:** Secure login using your HPKV API URL and API Key (stored in Session Storage).
*   **Filesystem Operations:**
    *   List directory contents.
    *   Navigate directories.
    *   Create directories (`mkdir`).
    *   Upload files (handles chunking for files > 3KB, matching `hpkvfs` logic).
    *   Download/View files (handles chunking).
    *   Edit simple text files (up to 5MB).
    *   Delete files and empty directories (`unlink`, `rmdir`).
*   **Chunking Compatibility:** Uses the same chunking mechanism (`.chunkN` keys, ~3KB chunks) and metadata format (`.__meta__` keys) as the `hpkvfs` FUSE client, allowing seamless switching between the web UI and the mounted filesystem.
*   **API Documentation:** Integrated OpenAPI (Swagger) documentation for the backend API routes, accessible via the UI.
*   **UI:** Built with Next.js, TypeScript, Tailwind CSS, and shadcn/ui for a modern and responsive interface.
*   **User Feedback:** Provides loading indicators, progress bars for uploads, and toast notifications for operations and errors.

## Project Structure

*   `/src/app/api/`: Backend API routes (Next.js Route Handlers) for interacting with HPKV.
*   `/src/app/docs/`: Page for displaying API documentation.
*   `/src/app/page.tsx`: Main application page (renders Login or File Manager).
*   `/src/components/`: Reusable UI components (Login Form, File Manager, shadcn/ui components).
*   `/src/lib/`: Core logic, constants, and context (authentication, HPKV API calls).
*   `/public/openapi.yaml`: OpenAPI specification file.

## Getting Started

### Prerequisites

*   Node.js (v18 or later recommended)
*   npm (or pnpm/yarn)
*   An HPKV account with an API URL and API Key.

### Installation

1.  Clone the repository or download and extract the source code archive.
2.  Navigate to the project directory:
    ```bash
    cd hpkvfs-cloud
    ```
3.  Install dependencies:
    ```bash
    npm install
    ```

### Running Locally

1.  Start the development server:
    ```bash
    npm run dev
    ```
2.  Open your browser and navigate to `http://localhost:3000` (or the specified port).
3.  Log in using your HPKV API URL and API Key.

### Building for Production

1.  Build the application:
    ```bash
    npm run build
    ```
2.  Start the production server:
    ```bash
    npm start
    ```

### Deployment

This Next.js application is suitable for deployment on platforms like Vercel, Netlify, or other Node.js hosting environments.

## API Documentation

The backend API routes provided by this application are documented using the OpenAPI standard.

*   The specification file is located at `/public/openapi.yaml`.
*   You can access the interactive documentation (rendered using Redoc via CDN) by clicking the "API Docs" button within the file manager interface or by navigating directly to `/docs` when the application is running.

## Validation and Cross-Compatibility

It is highly recommended to test the compatibility between `hpkvfs-cloud` and the `hpkvfs` FUSE client:

1.  Run `hpkvfs-cloud` (locally or deployed).
2.  Mount the `hpkvfs` FUSE client on your system, connecting to the same HPKV endpoint and using the same API key.
3.  Perform file operations (create, write, delete, mkdir) in the web UI and verify the changes appear correctly in the FUSE mount.
4.  Perform file operations in the FUSE mount and verify the changes appear correctly when refreshing the web UI.

This ensures the chunking and metadata logic are consistent across both tools.

## License

This project is licensed under the MIT License. See the `LICENSE` file (if included) for details.

