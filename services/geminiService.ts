
import { GoogleGenAI } from "@google/genai";
import { UsageStats } from "../types";

const TOKENS_PER_SECOND_AUDIO = 25; 
const CHARS_PER_TOKEN_ESTIMATION = 3; 

const PRICING_RATES_PER_1M: Record<string, { inputAudio: number, output: number }> = {
  'gemini-3-flash-preview': { inputAudio: 1.00, output: 3.00 },
  'gemini-2.5-flash': { inputAudio: 1.00, output: 2.50 },
  'gemini-2.5-flash-lite': { inputAudio: 0.30, output: 0.40 },
};

const DEFAULT_RATES = { inputAudio: 1.00, output: 2.50 }; 
const MIN_CACHING_CHARS = 32000;

export type AudioSourceMode = 'mic' | 'system';

export class GeminiOnDemandService {
  private client: GoogleGenAI;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = []; 
  private fullSessionChunks: Blob[] = []; 
  private headerChunk: Blob | null = null; 
  private stream: MediaStream | null = null;
  private maxBufferSeconds: number = 60; 
  private recordedMimeType: string = 'audio/webm';
  private currentModel: string = 'gemini-3-flash-preview';
  private cachedContentName: string | null = null;
  private isCacheActive: boolean = false;
  private sourceMode: AudioSourceMode = 'mic';

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

  private getRates() {
    return PRICING_RATES_PER_1M[this.currentModel] || DEFAULT_RATES;
  }

  private addInputAudioCost(seconds: number) {
    const rates = this.getRates();
    const inputTokens = seconds * TOKENS_PER_SECOND_AUDIO;
    const cost = (inputTokens / 1000000) * rates.inputAudio;
    this.usageStats.estimatedCost += cost;
    this.usageStats.totalAudioSeconds += seconds;
  }

  private addOutputTextCost(text: string) {
    const rates = this.getRates();
    const estimatedTokens = text.length / CHARS_PER_TOKEN_ESTIMATION;
    const cost = (estimatedTokens / 1000000) * rates.output;
    this.usageStats.estimatedCost += cost;
  }

  setModel(modelName: string) {
    if (this.currentModel !== modelName) {
      this.currentModel = modelName;
      this.cachedContentName = null;
      this.isCacheActive = false;
      this.onCacheStatusChange(false);
    }
  }

  setBufferDuration(seconds: number) {
    this.maxBufferSeconds = seconds;
    if (this.audioChunks.length > this.maxBufferSeconds) {
        this.audioChunks.splice(0, this.audioChunks.length - this.maxBufferSeconds);
    }
  }

  async updateContextCache(contextContent: string, systemInstruction: string) {
    if (!contextContent || contextContent.length < MIN_CACHING_CHARS) {
        this.cachedContentName = null;
        this.isCacheActive = false;
        this.onCacheStatusChange(false);
        return;
    }
    try {
      const fullSystemContent = `${systemInstruction}\n\n[Context / Knowledge Base]\n${contextContent}`;
      const cacheResponse = await this.client.caches.create({
        model: this.currentModel,
        config: {
          systemInstruction: { parts: [{ text: fullSystemContent }] },
          ttl: '3600s',
        },
      });
      this.cachedContentName = cacheResponse.name;
      this.isCacheActive = true;
      this.onCacheStatusChange(true);
    } catch (error) {
      this.cachedContentName = null;
      this.isCacheActive = false;
      this.onCacheStatusChange(false);
    }
  }

  private getSupportedMimeType(): string {
    const types = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/mp4",
      "audio/aac"
    ];
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    return "audio/webm"; // fallback
  }

  async startRecording(mode: AudioSourceMode = 'mic') {
    this.sourceMode = mode;
    try {
      let finalStream: MediaStream;

      if (mode === 'system') {
        // getDisplayMedia captures video+audio. 
        // We MUST specify audio: true and the user must check "Share Audio" in the browser prompt.
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: true, // video is required for getDisplayMedia to work properly in many browsers
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false
          }
        });

        const audioTracks = displayStream.getAudioTracks();
        if (audioTracks.length === 0) {
            displayStream.getTracks().forEach(t => t.stop());
            throw new Error("No system audio detected. Did you check 'Share Audio' in the pop-up?");
        }

        // CRITICAL FIX: MediaRecorder crashes if we give it a stream with video tracks 
        // while specifying an audio-only mimeType. Create a new stream with ONLY audio.
        finalStream = new MediaStream(audioTracks);
        this.stream = displayStream; // Keep track of original to stop all tracks later

        // Stop the video track immediately to save CPU/Battery, we only need the audio
        displayStream.getVideoTracks().forEach(t => t.stop());

      } else {
        finalStream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            } 
        });
        this.stream = finalStream;
      }

      this.recordedMimeType = this.getSupportedMimeType();
      console.log(`%c[GeminiService] ${mode.toUpperCase()} Recording starting. MimeType: ${this.recordedMimeType}`, 'color: #10b981;');
      
      // Initialize recorder with the audio-only stream
      this.mediaRecorder = new MediaRecorder(finalStream, { mimeType: this.recordedMimeType });
      this.audioChunks = []; 
      this.fullSessionChunks = []; 
      this.headerChunk = null;

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          if (!this.headerChunk) this.headerChunk = event.data;
          this.audioChunks.push(event.data);
          if (this.audioChunks.length > this.maxBufferSeconds) this.audioChunks.shift();
          this.fullSessionChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = () => {
          console.log("%c[GeminiService] MediaRecorder actually stopped.", 'color: #6366f1;');
      };

      this.mediaRecorder.start(1000); 
      console.log(`%c[GeminiService] MediaRecorder started successfully.`, 'color: #10b981; font-weight: bold;');

    } catch (error: any) {
      console.error("[GeminiService] startRecording failed:", error);
      this.stopRecording();
      throw error;
    }
  }

  stopRecording() {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.stop();
    }
    if (this.stream) {
        this.stream.getTracks().forEach(track => {
            track.stop();
            console.log(`[GeminiService] Track ${track.kind} stopped.`);
        });
    }
    this.mediaRecorder = null;
    this.stream = null;
    console.log(`%c[GeminiService] Session fully stopped.`, 'color: #f59e0b;');
  }

  clearAllSessionData() {
    this.stopRecording();
    this.audioChunks = [];
    this.fullSessionChunks = [];
    this.headerChunk = null;
    this.usageStats = { analyzedCount: 0, totalAudioSeconds: 0, estimatedCost: 0 };
    this.onUsageUpdate(this.usageStats);
  }

  hasFullSessionData(): boolean { return this.fullSessionChunks.length > 0; }

  async getFullAudioBlob(): Promise<Blob> {
    return new Blob(this.fullSessionChunks, { type: this.recordedMimeType });
  }

  async *analyzeAudioBufferStream(contextContent: string, systemInstruction: string) {
    if (this.audioChunks.length === 0) {
      yield "No audio recorded yet. Please wait a few seconds after starting.";
      return;
    }

    try {
      const chunksToProcess = this.headerChunk ? [this.headerChunk, ...this.audioChunks] : [...this.audioChunks];
      const audioBlob = new Blob(chunksToProcess, { type: this.recordedMimeType });
      
      console.log(`%c[Step 1] Creating Blob... Size: ${(audioBlob.size / 1024).toFixed(2)} KB`, 'color: #8b5cf6;');
      const base64Audio = await this.blobToBase64(audioBlob);

      this.usageStats.analyzedCount++;
      this.addInputAudioCost(this.audioChunks.length);
      this.onUsageUpdate(this.usageStats);

      const cleanMimeType = this.recordedMimeType.split(';')[0];
      const requestParams: any = {
        model: this.currentModel,
        contents: [
          {
             parts: [
               { inlineData: { mimeType: cleanMimeType, data: base64Audio } },
               { text: "Instructions: Analyze the conversation in this audio clip. Focus on identifying the student's confusion and providing teaching advice based on the context." }
             ]
          }
        ],
      };

      if (this.isCacheActive && this.cachedContentName) {
         requestParams.cachedContent = this.cachedContentName;
      } else {
         requestParams.config = {
             systemInstruction: `${systemInstruction}\n\n[RAG Context]\n${contextContent}`
         };
      }

      const responseStream = await this.client.models.generateContentStream(requestParams);
      console.log(`%c[Step 4] Stream Connection Established. Mode: ${this.sourceMode}`, 'color: #10b981;');

      let hasReceivedData = false;
      for await (const chunk of responseStream) {
        const text = chunk.text;
        if (text) {
          hasReceivedData = true;
          this.addOutputTextCost(text);
          this.onUsageUpdate(this.usageStats);
          yield text;
        }
      }

      if (!hasReceivedData) {
          yield "\n[Notice] No analysis generated. Please ensure there is clear speech in the recorded segment.";
      }

    } catch (error: any) {
      console.error("[GeminiService] API Error:", error);
      yield `\n\n[Error] ${error.message}`;
    }
  }

  async *analyzeFullSessionStream(contextContent: string) {
    if (this.fullSessionChunks.length === 0) {
        yield "No audio recorded.";
        return;
    }
    try {
        const audioBlob = await this.getFullAudioBlob();
        const base64Audio = await this.blobToBase64(audioBlob);
        const cleanMimeType = this.recordedMimeType.split(';')[0];

        this.usageStats.analyzedCount++;
        this.addInputAudioCost(this.fullSessionChunks.length);
        this.onUsageUpdate(this.usageStats);

        const requestParams: any = {
            model: this.currentModel,
            contents: [
                {
                    parts: [
                        { inlineData: { mimeType: cleanMimeType, data: base64Audio } },
                        { text: "Provide a complete transcript and summary." }
                    ]
                }
            ],
            config: {
                systemInstruction: `Transcribe and summarize.\n\n[Context]\n${contextContent}`
            }
        };

        const responseStream = await this.client.models.generateContentStream(requestParams);
        for await (const chunk of responseStream) {
            const text = chunk.text;
            if (text) {
              this.addOutputTextCost(text);
              this.onUsageUpdate(this.usageStats);
              yield text;
            }
        }
    } catch (error: any) {
        yield `\n[Error] ${error.message}`;
    }
  }

  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        if (!result) return reject("Conversion failed");
        resolve(result.split(',')[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
}

export const geminiService = new GeminiOnDemandService();
