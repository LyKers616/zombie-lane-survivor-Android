
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export async function getMissionIntel(level: number) {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Generate a short mission briefing for Level ${level} of a zombie apocalypse survival game. 
      The setting is a high-speed highway. Include a cool name for the level and a scary boss description.
      Output as JSON.`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            intel: { type: Type.STRING },
            bossName: { type: Type.STRING },
            bossDescription: { type: Type.STRING }
          },
          required: ['title', 'intel', 'bossName', 'bossDescription']
        }
      }
    });
    return JSON.parse(response.text);
  } catch (error) {
    console.error("Gemini Error:", error);
    return {
      title: `Sector ${level}: Dead Road`,
      intel: "The highway is swarming with undead. Keep your finger on the trigger and stay moving.",
      bossName: "The Behemoth",
      bossDescription: "A massive, mutated horror that blocks the path ahead."
    };
  }
}
