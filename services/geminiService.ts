
import { GoogleGenAI } from "@google/genai";
import { UsageStats } from "../types";

// Pricing Constants based on Gemini 2.5 Pricing (Paid Tier)
// 1 second of audio ~= 25 tokens. 
const TOKENS_PER_SECOND_AUDIO = 25;

// Rates per 1 Million Tokens (Input Audio)
// Source: Google Cloud Pricing (Flash: $1.00, Flash-Lite: $0.30)
const PRICING_RATES_PER_1M: Record<string, number> = {
  'gemini-2.5-flash': 1.00,
  'gemini-2.5-flash-lite': 0.30,
};

const DEFAULT_RATE = 1.00; // Fallback to Flash rate

// Minimum characters to attempt caching. 
const MIN_CACHING_CHARS = 32000;

export class GeminiOnDemandService {
  private client: GoogleGenAI;
  private mediaRecorder: MediaRecorder | null = null;
  
  private audioChunks: Blob[] = []; // Rolling buffer (for live analysis)
  private fullSessionChunks: Blob[] = []; // Full session buffer (for export/transcript)
  
  private headerChunk: Blob | null = null; // Store the first chunk (header)
  private stream: MediaStream | null = null;
  private maxBufferSeconds: number = 60; // Default to 60 seconds
  private recordedMimeType: string = 'audio/webm';

  // Model State
  private currentModel: string = 'gemini-2.5-flash';

  // Caching State
  private cachedContentName: string | null = null;
  private isCacheActive: boolean = false;

  // Usage Tracking
  private usageStats: UsageStats = {
    analyzedCount: 0,
    totalAudioSeconds: 0,
    estimatedCost: 0
  };

  public onUsageUpdate: (stats: UsageStats) => void = () => {};
  public onCacheStatusChange: (isActive: boolean) => void = () => {};

  constructor() {
    this.client = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  /**
   * Helper to get current cost per second based on model
   */
  private getCostPerSecond(): number {
    const rate = PRICING_RATES_PER_1M[this.currentModel] || DEFAULT_RATE;
    return (TOKENS_PER_SECOND_AUDIO / 1000000) * rate;
  }

  /**
   * Sets the model to use for analysis and caching.
   * Resets cache state as caches are model-specific.
   */
  setModel(modelName: string) {
    if (this.currentModel !== modelName) {
      console.log(`%c[GeminiService] Switching model to: ${modelName}`, 'color: #3b82f6; font-weight: bold;');
      this.currentModel = modelName;
      
      // Invalidate current cache because caches are bound to a specific model.
      this.cachedContentName = null;
      this.isCacheActive = false;
      this.onCacheStatusChange(false);
    }
  }

  /**
   * Sets the rolling buffer duration in seconds.
   */
  setBufferDuration(seconds: number) {
    console.log(`%c[GeminiService] Updating buffer duration to ${seconds} seconds`, 'color: #3b82f6; font-weight: bold;');
    this.maxBufferSeconds = seconds;
    
    // Immediately trim the buffer if it exceeds the new limit
    if (this.audioChunks.length > this.maxBufferSeconds) {
        const removeCount = this.audioChunks.length - this.maxBufferSeconds;
        this.audioChunks.splice(0, removeCount);
        console.log(`[GeminiService] Trimmed buffer by ${removeCount} chunks to fit new size.`);
    }
  }

  /**
   * Creates or Updates the Gemini Context Cache.
   * Now accepts systemInstruction dynamically.
   */
  async updateContextCache(contextContent: string, systemInstruction: string) {
    // 1. Length Check: Skip caching if content is too short.
    if (!contextContent || contextContent.length < MIN_CACHING_CHARS) {
        console.log(`%c[GeminiService] Content length (${contextContent.length} chars) is below the minimum for Context Caching.`, 'color: #f59e0b');
        
        this.cachedContentName = null;
        this.isCacheActive = false;
        this.onCacheStatusChange(false);
        return;
    }

    try {
      console.log(`%c[GeminiService] Updating Context Cache for model ${this.currentModel}...`, 'color: #d946ef; font-weight: bold;');
      
      const fullSystemContent = `
${systemInstruction}

[Context / Knowledge Base (Cached)]
${contextContent}
`;

      // Create the cache using the SDK
      const cacheResponse = await this.client.caches.create({
        model: this.currentModel,
        config: {
          systemInstruction: {
            parts: [{ text: fullSystemContent }]
          },
          ttl: '3600s', // 1 hour
        },
      });

      this.cachedContentName = cacheResponse.name;
      this.isCacheActive = true;
      this.onCacheStatusChange(true);

      console.log(`%c[GeminiService] Cache Created Successfully: ${this.cachedContentName}`, 'color: #d946ef');
    } catch (error: any) {
      console.error("[GeminiService] Failed to create context cache:", error);
      this.cachedContentName = null;
      this.isCacheActive = false;
      this.onCacheStatusChange(false);
    }
  }

  async startRecording() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Determine supported mime type
      this.recordedMimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
      
      this.mediaRecorder = new MediaRecorder(this.stream, { mimeType: this.recordedMimeType });

      this.audioChunks = []; 
      this.fullSessionChunks = []; // Reset full session buffer
      this.headerChunk = null;

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          if (!this.headerChunk && this.audioChunks.length === 0) {
            this.headerChunk = event.data;
          }
          
          // 1. Add to rolling buffer
          this.audioChunks.push(event.data);
          if (this.audioChunks.length > this.maxBufferSeconds) {
            this.audioChunks.shift(); 
          }

          // 2. Add to full session buffer (Never deleted)
          this.fullSessionChunks.push(event.data);
        }
      };

      this.mediaRecorder.start(1000); 
      console.log("%c[GeminiService] Recording started.", 'color: #10b981');
    } catch (error) {
      console.error("[GeminiService] Failed to start recording", error);
      throw error;
    }
  }

  stopRecording() {
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      this.mediaRecorder.stop();
    }
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
    }
    this.mediaRecorder = null;
    this.stream = null;
  }

  hasFullSessionData(): boolean {
      return this.fullSessionChunks.length > 0;
  }

  async getFullAudioBlob(): Promise<Blob> {
    // If we have a separate header chunk captured at start, we can prepend it,
    // but usually fullSessionChunks[0] is the header since we push everything there.
    // We just create the blob from all chunks.
    return new Blob(this.fullSessionChunks, { type: this.recordedMimeType });
  }

  async *analyzeAudioBufferStream(contextContent: string, systemInstruction: string) {
    if (this.audioChunks.length === 0) {
      yield "No audio recorded yet. Please start recording first.";
      return;
    }

    // Combine audio chunks into a single Blob
    // Important: Include the header chunk if it exists to ensure valid container format
    const chunksToProcess = this.headerChunk 
        ? [this.headerChunk, ...this.audioChunks] 
        : [...this.audioChunks];
        
    const audioBlob = new Blob(chunksToProcess, { type: this.recordedMimeType });
    const base64Audio = await this.blobToBase64(audioBlob);

    // Calculate usage
    const durationSec = this.audioChunks.length; // Approximate
    const currentCost = this.getCostPerSecond();

    this.usageStats.analyzedCount++;
    this.usageStats.totalAudioSeconds += durationSec;
    this.usageStats.estimatedCost += durationSec * currentCost;
    this.onUsageUpdate(this.usageStats);

    try {
      let requestConfig: any = {};
      let requestContents: any[] = [
        {
           role: 'user',
           parts: [
             { inlineData: { mimeType: this.recordedMimeType, data: base64Audio } },
             { text: "Please analyze the audio based on the system instructions." }
           ]
        }
      ];

      // Prepare Request Parameters
      const requestParams: any = {
        model: this.currentModel,
        contents: requestContents,
      };

      // Handle Caching logic
      if (this.isCacheActive && this.cachedContentName) {
         requestParams.cachedContent = this.cachedContentName;
      } else {
         const fullSystemInstruction = `${systemInstruction}\n\n[Context / Knowledge Base]\n${contextContent}`;
         requestConfig.systemInstruction = fullSystemInstruction;
         requestParams.config = requestConfig;
      }

      const responseStream = await this.client.models.generateContentStream(requestParams);

      for await (const chunk of responseStream) {
        yield chunk.text;
      }

    } catch (error: any) {
      console.error("[GeminiService] Analysis Error:", error);
      yield `\n[Error] ${error.message}`;
    }
  }

  /**
   * Analyzes the entire session audio to generate a transcript and summary.
   * This uses a specialized system instruction for transcription.
   */
  async *analyzeFullSessionStream(contextContent: string) {
    if (this.fullSessionChunks.length === 0) {
        yield "No audio recorded.";
        return;
    }

    const audioBlob = await this.getFullAudioBlob();
    const base64Audio = await this.blobToBase64(audioBlob);
    
    // Usage calc (approximate, full session)
    const durationSec = this.fullSessionChunks.length;
    const currentCost = this.getCostPerSecond();

    this.usageStats.analyzedCount++;
    this.usageStats.totalAudioSeconds += durationSec;
    this.usageStats.estimatedCost += durationSec * currentCost;
    this.onUsageUpdate(this.usageStats);

    const TRANSCRIPT_INSTRUCTION = `
You are a professional transcriber and teaching analyst.
Your task is to process the **Entire Session Audio** provided.

[Output Format]
1. **Verbatim Transcript**: 
   - Transcribe the conversation word-for-word.
   - Label speakers as [Teacher] and [Student] if clearly distinguishable, otherwise [Speaker 1], [Speaker 2].
   - Add timestamps [00:00] periodically if possible.

2. **Session Summary**:
   - Summarize the key topics discussed.
   - Highlight the main student difficulties identified.
   - Provide 1-2 key takeaways for the teacher.

[Context / Knowledge Base]
${contextContent}
`;

    const requestParams: any = {
        model: this.currentModel,
        contents: [
            {
                role: 'user',
                parts: [
                    { inlineData: { mimeType: this.recordedMimeType, data: base64Audio } },
                    { text: "Please generate the full transcript and summary." }
                ]
            }
        ],
        config: {
            systemInstruction: TRANSCRIPT_INSTRUCTION
        }
    };

    try {
        const responseStream = await this.client.models.generateContentStream(requestParams);
        for await (const chunk of responseStream) {
            yield chunk.text;
        }
    } catch (error: any) {
        console.error("[GeminiService] Full Analysis Error", error);
        yield `\n[Error] ${error.message}`;
    }
}

  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
}

export const geminiService = new GeminiOnDemandService();
