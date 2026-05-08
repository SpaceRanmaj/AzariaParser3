import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface HarmonizeParams {
  sourceText: string;
  styleDirectives: string;
  chatHistory?: string;
  characterProfile?: string;
  systemInstructionOverride?: string;
}

export async function harmonizeOutput(params: HarmonizeParams): Promise<string> {
  const { sourceText, styleDirectives, chatHistory, characterProfile, systemInstructionOverride } = params;

  const defaultSystemInstruction = `
    You are an expert Output Parser and Stylistic Harmonizer for Roleplay.
    Your task is to rewrite the provided text to match specific stylistic directives.
    
    CRITICAL RULES:
    1. Preserve the original INTENT and MEANING perfectly.
    2. Do NOT add new plot points or actions unless they are purely stylistic flavor.
    3. Remove cliches, generic "AI-isms", forbidden words and phrases.
    4. Follow the Style Directives strictly.
    5. If Chat History is provided, ensure consistency and avoid repeating exact phrases or sentence structures used recently.
    
    STYLE DIRECTIVES:
    ${styleDirectives}
    
    ${characterProfile ? `CHARACTER PROFILE:\n${characterProfile}` : ""}
    
    Provide ONLY the rewritten text. No preamble, no commentary.
  `;

  const systemInstruction = systemInstructionOverride || defaultSystemInstruction;

  const prompt = `
    ${chatHistory ? `RECENT CHAT CONTEXT:\n${chatHistory}\n\n` : ""}
    TEXT TO HARMONIZE:
    "${sourceText}"
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        systemInstruction,
        temperature: 0.7,
      },
    });

    return response.text || sourceText;
  } catch (error) {
    console.error("Harmonizer Error:", error);
    return sourceText; // Fallback to original
  }
}
