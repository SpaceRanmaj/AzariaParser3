import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
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
      const { 
        sourceText, 
        styleDirectives, 
        characterProfile, 
        chatHistory, 
        systemInstructionOverride,
        apiKey,
        modelName,
        temperature
      } = req.body;
      
      if (!sourceText) {
        return res.status(400).json({ error: "Source text is required" });
      }

      const refinedText = await harmonizeOutput({
        sourceText,
        styleDirectives,
        characterProfile,
        chatHistory,
        systemInstructionOverride,
        apiKey,
        modelName,
        temperature
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
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.sendFile(path.resolve(__dirname, "manifest.json"));
  });
  app.get("/index.js", async (req, res) => {
    try {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Content-Type", "application/javascript");
      
      const filePath = path.resolve(__dirname, "index.js");
      let content = await fs.promises.readFile(filePath, "utf8");
      
      // Inject the current server's host as the default backend
      const protocol = req.headers["x-forwarded-proto"] || "https";
      const host = req.get("host");
      const currentUrl = `${protocol}://${host}`;
      
      content = content.replace(/backendUrl:\s*["']REPLACE_ME["']/g, `backendUrl: "${currentUrl}"`);
      
      res.send(content);
    } catch (e) {
      console.error("Error serving index.js:", e);
      res.status(500).send("Internal Server Error");
    }
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
