import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.warn("GEMINI_API_KEY is not defined. AI features will not work.");
}

const ai = new GoogleGenAI({ apiKey: apiKey || "" });

export async function sendMessageStream(messages: { role: 'user' | 'model', content: string }[]) {
  if (!apiKey) {
    throw new Error("Gemini API Key is missing. Please configure it in the Secrets panel.");
  }

  const model = "gemini-3-flash-preview";
  
  // Transform our message format to Gemini's format
  const contents = messages.map(msg => ({
    role: msg.role,
    parts: [{ text: msg.content }]
  }));

  const streamResponse = await ai.models.generateContentStream({
    model,
    contents,
    config: {
        systemInstruction: "You are a helpful, friendly, and concise AI assistant. You provide clear answers and use markdown for formatting when appropriate."
    }
  });

  return streamResponse;
}
