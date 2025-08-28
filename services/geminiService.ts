/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { GoogleGenAI, GenerateContentResponse, Type } from "@google/genai";
import { ConsistencyResult } from "../types";

// Helper to convert a data URL to a Gemini API Part
const dataUrlToPart = (dataUrl: string): { inlineData: { mimeType: string; data: string; } } => {
    const arr = dataUrl.split(',');
    if (arr.length < 2) throw new Error("Invalid data URL");
    const mimeMatch = arr[0].match(/:(.*?);/);
    if (!mimeMatch || !mimeMatch[1]) throw new Error("Could not parse MIME type from data URL");
    
    const mimeType = mimeMatch[1];
    const data = arr[1];
    return { inlineData: { mimeType, data } };
};

/**
 * Analyzes a single frame from a video to generate a creative text prompt.
 * @param frameDataUrl The data URL of the video frame.
 * @returns A promise that resolves to a structured object with analysis details.
 */
export const analyzeVideoFrame = async (frameDataUrl: string): Promise<{ title: string; description: string; tags: string[]; cinematicPrompt: string; }> => {
    console.log(`Starting frame analysis.`);
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
    
    const imagePart = dataUrlToPart(frameDataUrl);
    const prompt = `You are a creative assistant for a video editor. Analyze the provided image, which is a frame from a video. Generate a structured JSON object describing the frame. The JSON object should contain:
- "title": A short, catchy title for the scene.
- "description": A detailed paragraph describing the scene, subjects, and actions.
- "tags": An array of 3-5 relevant keywords (e.g., "sci-fi", "astronaut", "space", "cinematic").
- "cinematicPrompt": A creative, cinematic, and evocative text prompt that could be used to generate a new video with a similar style and theme. This prompt should be a single, compelling sentence or two. Example: "An astronaut floating in the vast, silent expanse of space, with the Earth glowing in the distance, cinematic lighting."`;
    
    const textPart = { text: prompt };

    console.log('Sending frame and prompt to the model for analysis...');
    const response: GenerateContentResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [imagePart, textPart] },
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    title: { type: Type.STRING },
                    description: { type: Type.STRING },
                    tags: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING }
                    },
                    cinematicPrompt: { type: Type.STRING }
                },
                required: ["title", "description", "tags", "cinematicPrompt"]
            }
        }
    });
    console.log('Received response from model for analysis.', response);
    
    if (response.promptFeedback?.blockReason) {
        const { blockReason, blockReasonMessage } = response.promptFeedback;
        const errorMessage = `Analysis request was blocked. Reason: ${blockReason}. ${blockReasonMessage || ''}`;
        throw new Error(errorMessage);
    }

    const text = response.text?.trim();

    if (!text) {
        throw new Error("Analysis failed: The model did not return a valid JSON object.");
    }

    try {
        return JSON.parse(text);
    } catch (e) {
        console.error("Failed to parse JSON from model response:", text);
        throw new Error("Analysis failed: The model returned an invalid JSON format.");
    }
};

/**
 * Tests how consistent a text prompt is with a given video frame.
 * @param frameDataUrl The data URL of the video frame.
 * @param prompt The text prompt to test.
 * @returns A promise that resolves to an object with a consistency score and explanation.
 */
export const testPromptConsistency = async (frameDataUrl: string, prompt: string): Promise<ConsistencyResult> => {
    console.log(`Starting prompt consistency test.`);
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });

    const imagePart = dataUrlToPart(frameDataUrl);
    const systemPrompt = `You are an expert film critic and AI assistant. Your task is to evaluate how well a given text prompt describes the provided image.
- Analyze the image carefully, noting the subject, setting, mood, and key visual elements.
- Analyze the text prompt.
- Compare the prompt to the image and provide a consistency score from 0 to 100, where 100 is a perfect match and 0 is completely unrelated.
- Provide a brief, one-sentence explanation for your score.
- Respond ONLY with a valid JSON object.`;
    
    const userPrompt = `Image is provided. Text prompt to evaluate: "${prompt}"`;
    const textPart = { text: userPrompt };

    console.log('Sending frame and prompt to the model for consistency check...');
    const response: GenerateContentResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [imagePart, textPart] },
        config: {
            systemInstruction: systemPrompt,
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    score: { type: Type.NUMBER, description: "A consistency score from 0 to 100." },
                    explanation: { type: Type.STRING, description: "A brief, one-sentence explanation for the score." }
                },
                required: ["score", "explanation"]
            }
        }
    });
    console.log('Received response from model for consistency check.', response);
    
    if (response.promptFeedback?.blockReason) {
        const { blockReason, blockReasonMessage } = response.promptFeedback;
        const errorMessage = `Consistency check request was blocked. Reason: ${blockReason}. ${blockReasonMessage || ''}`;
        throw new Error(errorMessage);
    }

    const text = response.text?.trim();

    if (!text) {
        throw new Error("Consistency check failed: The model did not return a valid JSON object.");
    }

    try {
        const result: ConsistencyResult = JSON.parse(text);
        // Clamp the score to be within 0-100, just in case.
        result.score = Math.max(0, Math.min(100, Math.round(result.score)));
        return result;
    } catch (e) {
        console.error("Failed to parse JSON from consistency check response:", text);
        throw new Error("Consistency check failed: The model returned an invalid JSON format.");
    }
};


/**
 * Starts the asynchronous process of generating a video from a text prompt.
 * @param prompt The text prompt to generate the video from.
 * @returns A promise that resolves to the initial video generation operation.
 */
export const startVideoGeneration = async (prompt: string): Promise<any> => {
    console.log(`Starting video generation for prompt: "${prompt}"`);
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
    
    const operation = await ai.models.generateVideos({
        model: 'veo-2.0-generate-001',
        prompt: prompt,
        config: {
            numberOfVideos: 1
        }
    });

    console.log('Video generation operation started:', operation);
    return operation;
};

/**
 * Checks the status of an ongoing video generation operation.
 * @param operation The operation object returned from `startVideoGeneration`.
 * @returns A promise that resolves to the updated operation object.
 */
export const checkVideoGenerationStatus = async (operation: any): Promise<any> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
    console.log('Checking video operation status...');
    const updatedOperation = await ai.operations.getVideosOperation({ operation: operation });
    console.log('Updated video operation status:', updatedOperation);
    return updatedOperation;
};