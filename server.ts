import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { harmonizeOutput } from "./src/services/geminiService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // API Endpoint for Harmonization
  app.post("/api/harmonize", async (req, res) => {
    try {
      const { sourceText, styleDirectives, characterProfile, chatHistory, systemInstructionOverride } = req.body;
      
      if (!sourceText) {
        return res.status(400).json({ error: "Source text is required" });
      }

      const refinedText = await harmonizeOutput({
        sourceText,
        styleDirectives,
        characterProfile,
        chatHistory,
        systemInstructionOverride
      });

      res.json({ refinedText });
    } catch (error) {
      console.error("Harmonize API Error:", error);
      res.status(500).json({ error: "Internal server error during harmonization" });
    }
  });

  // Serve SillyTavern Extension files explicitly if needed, 
  // but they will also be handled by Vite/Static middleware.
  
  // Serving SillyTavern extension files from root
  app.get("/manifest.json", (req, res) => {
    console.log("[DIAGNOSTIC] manifest.json requested");
    res.sendFile(path.resolve(__dirname, "manifest.json"));
  });
  app.get("/index.js", (req, res) => {
    console.log("[DIAGNOSTIC] index.js requested");
    res.set('Content-Type', 'application/javascript');
    res.sendFile(path.resolve(__dirname, "index.js"));
  });

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
    console.log(`[AZARIA] Style Engine ONLINE at http://localhost:${PORT}`);
  });
}

startServer();
