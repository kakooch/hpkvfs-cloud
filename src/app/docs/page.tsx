	"use client";

import React from 'react';
import Head from 'next/head';

export default function ApiDocsPage() {
  return (
    <div style={{ height: '100vh', width: '100%' }}>
      <Head>
        <title>HPKV Cloud API Documentation</title>
        <meta name="description" content="API documentation for HPKV Cloud" />
        {/* Redoc styles and fonts from CDN */}
        <link href="https://fonts.googleapis.com/css?family=Montserrat:300,400,700|Roboto:300,400,700" rel="stylesheet" />
        <style>{`
          body {
            margin: 0;
            padding: 0;
          }
        `}</style>
      </Head>
      {/* Redoc element */}
      <div id="redoc-container"></div>
      {/* Redoc script from CDN */}
      <script src="https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js"></script>
      <script dangerouslySetInnerHTML={{
        __html: `
          Redoc.init('/openapi.yaml', {
            // Redoc options (optional)
            scrollYOffset: 0,
            hideDownloadButton: false,
            theme: {
                colors: {
                    primary: { main: '#327dfa' } // Example theme color
                }
            }
          }, document.getElementById('redoc-container'))
        `
      }} />
    </div>
  );
}

