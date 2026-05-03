import 'dotenv/config';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import multer from 'multer';
import path from 'path';

// Using the explicit API key provided by the user to fix the INVALID_ARGUMENT error
const USER_API_KEY = "AIzaSyAhnCxGeIx5jXYFqjvrLIvmErMaU9KiHDE";
const apiKey = USER_API_KEY;

const ai = new GoogleGenAI({ apiKey });
const upload = multer({ storage: multer.memoryStorage() });

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route: Extract OCR from Image
  app.post('/api/extract', upload.single('image'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No image uploaded' });
      }

      const imagePart = {
        inlineData: {
          mimeType: req.file.mimetype,
          data: req.file.buffer.toString('base64'),
        },
      };

      const textPart = {
        text: `Extract the full text from this image exactly as written.
CRITICAL RULES:
1. Provide ONLY the raw extracted text.
2. DO NOT include any introductory or concluding sentences like "Based on the provided image..." or "Here is the text...".
3. DO NOT include markdown formatting blocks (like \`\`\`).
4. If the data is in a table or list format, use tabs (\\t) to separate the columns so they can be parsed correctly into Excel.`,
      };

      const response = await (async () => {
        let lastError;
        for (let i = 0; i < 3; i++) {
          try {
            return await ai.models.generateContent({
              model: 'gemini-3.1-flash-lite-preview',
              contents: { parts: [imagePart, textPart] },
            });
          } catch (error: any) {
            lastError = error;
            // Check both code and status for 503
            const errorCode = error?.code || error?.status;
            if (errorCode === 503 || error?.message?.includes('503')) {
              await new Promise(resolve => setTimeout(resolve, 2000 * (i + 1))); // Increased delay
              continue;
            }
            throw error;
          }
        }
        throw lastError;
      })();

      res.json({ text: response.text });
    } catch (error) {
      console.error('Error extracting text:', error);
      res.status(500).json({ error: 'Failed to extract text' });
    }
  });

  // API Route: Modify Text based on Audio
  app.post('/api/modify', upload.single('audio'), async (req, res) => {
    try {
      const { currentText } = req.body;

      if (!req.file) {
        return res.status(400).json({ error: 'No audio uploaded' });
      }

      if (!currentText) {
        return res.status(400).json({ error: 'No current text provided' });
      }

      const audioPart = {
        inlineData: {
          mimeType: req.file.mimetype,
          data: req.file.buffer.toString('base64'),
        },
      };

      const textPart = {
        text: `You are an AI text editor.
Here is the FULL text currently in the document:
---START OF TEXT---
${currentText}
---END OF TEXT---

Listen precisely to the audio instructions. The user will ask you to modify, correct, or change something in the text.
Your task is to apply these modifications to the text and return the ENTIRE updated text.

CRITICAL RULES:
1. You MUST return the FULL text, not just the part that was changed.
2. If the user says "change X to Y", you must output the entire document with X replaced by Y.
3. Do not add any conversational filler, explanations, or markdown formatting around the output. Return ONLY the final raw text.`,
      };

      const response = await (async () => {
        let lastError;
        for (let i = 0; i < 3; i++) {
          try {
            return await ai.models.generateContent({
              model: 'gemini-3.1-flash-lite-preview',
              contents: { parts: [audioPart, textPart] },
            });
          } catch (error: any) {
            lastError = error;
            // Check both code and status for 503
            const errorCode = error?.code || error?.status;
            if (errorCode === 503 || error?.message?.includes('503')) {
              await new Promise(resolve => setTimeout(resolve, 2000 * (i + 1))); // Increased delay
              continue;
            }
            throw error;
          }
        }
        throw lastError;
      })();

      res.json({ text: response.text });
    } catch (error) {
      console.error('Error modifying text:', error);
      res.status(500).json({ error: 'Failed to modify text' });
    }
  });

  // 404 handler for API routes
  app.use('/api/*', (req, res) => {
    res.status(404).json({ error: 'API route not found' });
  });

  // Error handler for API routes
  app.use('/api', (err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('API Error:', err);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
