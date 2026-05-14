import express from "express";
import { createServer as createViteServer } from "vite";
import axios from "axios";
import path from "path";
import { fileURLToPath } from "url";
import compression from "compression";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Simple in-memory cache for proxy requests
const cache = new Map<string, { data: any; expiry: number }>();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes cache duration

const app = express();
app.use(compression());
app.use(express.json());

// Proxy Xtream API to avoid CORS
app.get("/api/proxy", async (req, res) => {
    const { url, ...params } = req.query;
    if (!url) return res.status(400).json({ error: "URL is required" });

    const fullUrl = url as string;
    const cacheKey = fullUrl + JSON.stringify(params);

    // Check cache
    const cached = cache.get(cacheKey);
    if (cached && cached.expiry > Date.now()) {
      console.log(`Serving from cache: ${fullUrl}`);
      return res.json(cached.data);
    }

    console.log(`Proxying request to: ${url}`);
    try {
      const targetUrl = new URL(url as string);
      const response = await axios.get(url as string, {
        params,
        timeout: 15000, // Reduced to 15s for Vercel Hobby limits
        maxContentLength: 100 * 1024 * 1024, // 100MB incoming limit
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': '*/*',
          'Host': targetUrl.host,
        }
      });
      
      // Store in cache if successful
      if (response.status === 200) {
        cache.set(cacheKey, {
          data: response.data,
          expiry: Date.now() + CACHE_TTL
        });
      }

      console.log(`Successfully fetched data from: ${url} (Size: ${JSON.stringify(response.data).length} bytes)`);
      res.json(response.data);
    } catch (error: any) {
      // If we got a 429 and have stale cache, serve it anyway as fallback
      if (error.response?.status === 429 && cached) {
        console.warn(`Got 429, serving stale cache for: ${fullUrl}`);
        return res.json(cached.data);
      }

      console.error(`Proxy error for ${url}:`, error.message);
      const status = error.response?.status || 500;
      const data = error.response?.data || { error: "Failed to fetch from IPTV server", details: error.message };
      res.status(status).json(data);
    }
  });

  // Video Streaming Proxy with Range support
  app.get("/api/stream", async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).send("URL is required");

    const targetUrl = url as string;
    const range = req.headers.range;

    try {
      const headers: any = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      };
      if (range) {
        headers['Range'] = range;
      }

      const response = await axios({
        method: 'get',
        url: targetUrl,
        responseType: 'stream',
        headers: headers,
        timeout: 0, // No timeout for streaming
      });

      // Forward headers from target server
      const responseHeaders = {
        'Content-Type': response.headers['content-type'] || 'video/x-matroska',
        'Content-Length': response.headers['content-length'],
        'Content-Range': response.headers['content-range'],
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*',
      };

      res.writeHead(response.status, responseHeaders);
      response.data.pipe(res);

      req.on('close', () => {
        if (response.data && response.data.destroy) {
          response.data.destroy();
        }
      });
    } catch (error: any) {
      console.error(`Streaming error for ${targetUrl}:`, error.message);
      res.status(500).send("Streaming failed");
    }
  });

async function startServer() {
  // Use PORT from environment (Hugging Face uses 7860, AI Studio uses 3000)
  const PORT = Number(process.env.PORT) || 7860;

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    console.log("Starting in development mode with Vite middleware...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Starting in production mode...");
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    
    // Handle SPA routing
    app.get('*', (req, res) => {
      const indexPath = path.join(distPath, 'index.html');
      res.sendFile(indexPath);
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

// Start server only if not on Vercel
if (process.env.NODE_ENV !== "production" || !process.env.VERCEL) {
  startServer().catch(console.error);
}

export default app;
