import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware to parse JSON body
  app.use(express.json());

  // API Route for Fonnte WA Foward (Proxy to avoid CORS in browser and keeping Token Secret)
  app.post("/api/wa", async (req, res) => {
    try {
      const FONNTE_TOKEN = "1GJXoVStDBUYyVnnhyDi"; // The token from provided script
      const { target, message } = req.body;

      if (!target || !message) {
        return res.status(400).json({ success: false, error: "Missing target or message" });
      }

      const options = {
        method: "POST",
        headers: {
          "Authorization": FONNTE_TOKEN,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          target: target,
          message: message,
          countryCode: "62",
          delay: "1"
        })
      };

      const response = await fetch("https://api.fonnte.com/send", options);
      const result: any = await response.json();

      if (result.status === true) {
        res.json({ success: true, detail: result });
      } else {
        res.status(400).json({ success: false, error: result.reason || "Pesan ditolak oleh Fonnte" });
      }
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.toString() });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
