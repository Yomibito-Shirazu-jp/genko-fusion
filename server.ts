import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // JSON parser with a generous limit to support base64 document uploads (PDF/Images)
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // --- API Routes ---

  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // PDF OCR endpoint
  app.post("/api/ocr", async (req, res) => {
    try {
      const { pdfBase64, language = "Japanese" } = req.body;
      if (!pdfBase64) {
        return res.status(400).json({ error: "pdfBase64 is required" });
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "GEMINI_API_KEY is not configured on the server." });
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });

      console.log("Processing PDF OCR with Gemini 3.5 Flash...");
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [
          {
            inlineData: {
              data: pdfBase64,
              mimeType: "application/pdf",
            },
          },
          {
            text: `You are an expert high-fidelity OCR engine. Extract all readable text from the attached PDF document, maintaining its physical structure, exact content, headers, tables, formatting, paragraphs, bullet points, and the native language (mainly ${language}) meticulously. 
Do not translate the text. Do not summarize it. Do not add any greeting, intro, commentary, or explanation. Only output the extracted document text. If there are tables, reconstruct them in Markdown format if possible.`,
          },
        ],
      });

      res.json({ text: response.text });
    } catch (error: any) {
      console.error("OCR Error:", error);
      res.status(500).json({ error: error?.message || "Failed to perform OCR" });
    }
  });

  // Intelligent Merge endpoint
  app.post("/api/merge", async (req, res) => {
    try {
      const { documents, instruction, glossary } = req.body;
      if (!documents || !Array.isArray(documents) || documents.length === 0) {
        return res.status(400).json({ error: "documents array is required" });
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "GEMINI_API_KEY is not configured on the server." });
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });

      console.log("Merging documents with Gemini 3.5 Flash...");
      const defaultPrompt = "You are an expert editor. I will provide you with one or more document texts. Some of these might be the main body text, and some might be correction instructions or tasks. Analyze the provided texts, identify the main document and the corrections/instructions, and apply those instructions to the main text to produce a final, beautifully formatted, coherent single document. Ensure no content of value is lost. Do not add any intro or outro, just return the merged document in Markdown format.";
      const userPrompt = instruction ? `Merge these documents based on the following instruction: ${instruction}` : defaultPrompt;

      let glossaryInstructions = "";
      if (glossary && Array.isArray(glossary) && glossary.length > 0) {
        glossaryInstructions = `
Here is a terminology glossary / spelling dictionary of custom rules that you MUST strictly adhere to in the merged output. If you encounter any of the terms below (on the left), you MUST output them exactly as the corrected term (on the right):
${glossary.map((g: any) => `- "${g.pattern}" -> "${g.replacement}"`).join("\n")}
`;
      }

      let documentsText = "";
      documents.forEach((doc: string, idx: number) => {
        documentsText += `\n--- Document ${idx + 1} ---\n${doc}\n`;
      });

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: `You are an expert document editor and writer.
We have the following document texts:
${documentsText}

Please execute a merge of these.
Task instruction:
${userPrompt}
${glossaryInstructions}

Rules:
- Respect the content, reconciling differences cleanly.
- Build a beautifully formatted output. Keep proper headings, bullet lists, or tables where appropriate.
- Do not produce any intro, conversational filler, or side explanations. Just return the merged document body directly.`,
      });

      res.json({ mergedText: response.text });
    } catch (error: any) {
      console.error("Merge Error:", error);
      res.status(500).json({ error: error?.message || "Failed to merge documents" });
    }
  });

  // --- Vite & Client Hotreload Setup ---

  if (process.env.NODE_ENV !== "production") {
    console.log("Starting in DEVELOPMENT mode with Vite Middleware...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Starting in PRODUCTION mode with Static Assets...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
});
