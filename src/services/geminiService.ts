import { GoogleGenAI } from "@google/genai";

export interface HarmonizeParams {
  sourceText: string;
  styleDirectives: string;
  chatHistory?: string;
  characterProfile?: string;
  systemInstructionOverride?: string;
  apiKey?: string; // Optional user key override
  modelName?: string;
  temperature?: number;
}

export async function harmonizeOutput(params: HarmonizeParams): Promise<string> {
  const { 
    sourceText, 
    styleDirectives, 
    chatHistory, 
    characterProfile, 
    systemInstructionOverride,
    apiKey,
    modelName = "gemini-2.0-flash",
    temperature = 0.7
  } = params;

  const ai = new GoogleGenAI({ apiKey: apiKey || process.env.GEMINI_API_KEY || "" });

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: [
        {
          role: "user",
          parts: [{ text: `
            RECENT CONTEXT:
            ${chatHistory || "None"}

            TEXT TO REWRITE:
            "${sourceText}"
          ` }]
        }
      ],
      config: {
        systemInstruction: systemInstructionOverride || `
          You are an expert Output Parser and Stylistic Harmonizer for Roleplay.
          Your task is to rewrite the provided text to match specific stylistic directives.
          
          RULES:
          1. Preserve original INTENT and MEANING perfectly.
          2. Do NOT add new plot points or meta-commentary.
          3. Follow Style Directives strictly.
          4. Avoid repetitive sentence structures.
          
          STYLE DIRECTIVES:
          ${styleDirectives}
          
          ${characterProfile ? `CHARACTER PROFILE:\n${characterProfile}` : ""}
          
          Provide ONLY the rewritten text.
        `,
        temperature: temperature
      }
    });

    return response.text || sourceText;
  } catch (error) {
    console.error("[AZARIA] Refinement Logic Failed:", error);
    return sourceText;
  }
}
