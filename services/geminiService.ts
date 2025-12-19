
import { GoogleGenAI, Type } from "@google/genai";
import { UsageStats } from "../types";

const TOKENS_PER_SECOND_AUDIO = 25; 
const CHARS_PER_TOKEN_ESTIMATION = 3; 

// Base64 encoding adds ~33% overhead. 15MB blob ~ 20MB payload.
const MAX_AUDIO_BLOB_SIZE = 15 * 1024 * 1024; 

const PRICING_RATES_PER_1M: Record<string, { inputAudio: number, output: number }> = {
  'gemini-3-flash-preview': { inputAudio: 1.00, output: 3.00 },
  'gemini-2.5-flash': { inputAudio: 1.00, output: 2.50 },
  'gemini-2.5-flash-lite': { inputAudio: 0.30, output: 0.40 },
};

const DEFAULT_RATES = { inputAudio: 1.00, output: 2.50 }; 
const MIN_CACHING_CHARS = 32000;

export type AudioSourceMode = 'mic' | 'system' | 'mixed';

export class GeminiOnDemandService {
  private client: GoogleGenAI;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = []; 
  private fullSessionChunks: Blob[] = []; 
  private headerChunk: Blob | null = null; 
  private streams: MediaStream[] = [];
  private audioContext: AudioContext | null = null;
  private maxBufferSeconds: number = 60; 
  private recordedMimeType: string = 'audio/webm';
  private currentModel: string = 'gemini-2.5-flash-lite';
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

  private isRateLimitError(error: any): boolean {
    const msg = error?.message?.toLowerCase() || "";
    return msg.includes("429") || msg.includes("rate limit") || msg.includes("quota exceeded");
  }

  private isEntityTooLargeError(error: any): boolean {
    const msg = error?.message?.toLowerCase() || "";
    return msg.includes("413") || msg.includes("too large") || msg.includes("entity too large");
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
      const technicalProtocol = `
[TECHNICAL PROTOCOL]
You MUST respond in JSON format with three fields:
1. situation_analysis: Summarize student confusion.
2. suggested_action: Specific teaching strategy.
3. recommended_script: Verbatim natural language for the teacher.
`;
      const fullSystemContent = `${systemInstruction}\n${technicalProtocol}\n\n[Context / Knowledge Base]\n${contextContent}`;
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
      if (this.isRateLimitError(error)) {
        console.warn("[RAG Test] Cache creation hit rate limit.");
      }
      this.cachedContentName = null;
      this.isCacheActive = false;
      this.onCacheStatusChange(false);
    }
  }

  private getSupportedMimeType(): string {
    const types = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4", "audio/aac"];
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return "audio/webm";
  }

  async startRecording(mode: AudioSourceMode = 'mic') {
    this.sourceMode = mode;
    this.streams = [];
    try {
      let finalStream: MediaStream;
      if (mode === 'mixed') {
        const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.streams.push(micStream);
        const systemDisplayStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
        });
        this.streams.push(systemDisplayStream);
        systemDisplayStream.getVideoTracks().forEach(t => t.stop());
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        this.audioContext = audioCtx;
        const destination = audioCtx.createMediaStreamDestination();
        const micSource = audioCtx.createMediaStreamSource(micStream);
        micSource.connect(destination);
        if (systemDisplayStream.getAudioTracks().length > 0) {
          const systemSource = audioCtx.createMediaStreamSource(systemDisplayStream);
          systemSource.connect(destination);
        } else {
          systemDisplayStream.getTracks().forEach(t => t.stop());
          throw new Error("No system audio detected. Please ensure 'Share Audio' is checked.");
        }
        finalStream = destination.stream;
      } else if (mode === 'system') {
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
        });
        this.streams.push(displayStream);
        const audioTracks = displayStream.getAudioTracks();
        if (audioTracks.length === 0) {
            displayStream.getTracks().forEach(t => t.stop());
            throw new Error("No system audio detected. Please ensure 'Share Audio' is checked.");
        }
        finalStream = new MediaStream(audioTracks);
        displayStream.getVideoTracks().forEach(t => t.stop());
      } else {
        const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.streams.push(micStream);
        finalStream = micStream;
      }

      this.recordedMimeType = this.getSupportedMimeType();
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
      this.mediaRecorder.start(1000);
    } catch (error: any) {
      this.stopRecording();
      throw error;
    }
  }

  stopRecording() {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') this.mediaRecorder.stop();
    this.streams.forEach(stream => stream.getTracks().forEach(track => track.stop()));
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.streams = [];
    this.mediaRecorder = null;
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

  async *generateFullTranscriptStream() {
    if (this.fullSessionChunks.length === 0) {
      yield "No recording session found to transcribe.";
      return;
    }

    const fullBlob = await this.getFullAudioBlob();
    
    // Check if file is too large before sending
    if (fullBlob.size > MAX_AUDIO_BLOB_SIZE) {
      yield `\n\n[Transcript Error] The recording is too long (${(fullBlob.size / 1024 / 1024).toFixed(1)}MB) for direct browser transcription. \n\nPlease use the "Download Full Audio" button instead and use a dedicated transcription service.`;
      return;
    }

    try {
      const base64Audio = await this.blobToBase64(fullBlob);
      const audioDuration = this.fullSessionChunks.length;
      this.addInputAudioCost(audioDuration);
      this.onUsageUpdate(this.usageStats);

      const cleanMimeType = this.recordedMimeType.split(';')[0];
      const responseStream = await this.client.models.generateContentStream({
        model: this.currentModel,
        contents: [
          {
             parts: [
               { inlineData: { mimeType: cleanMimeType, data: base64Audio } },
               { text: "Provide a complete verbatim transcript of this audio in its ORIGINAL LANGUAGE. DO NOT TRANSLATE. Label speakers clearly as [Teacher] and [Student] if possible. Use timestamp tags like (00:00)." }
             ]
          }
        ],
        config: { temperature: 0 }
      });

      for await (const chunk of responseStream) {
        const text = chunk.text;
        if (text) {
          this.addOutputTextCost(text);
          this.onUsageUpdate(this.usageStats);
          yield text;
        }
      }
    } catch (error: any) {
      if (this.isRateLimitError(error)) {
        yield "\n\n[Transcript Error] API Rate limit reached. Please wait a moment and try again.";
      } else if (this.isEntityTooLargeError(error)) {
        yield "\n\n[Transcript Error] Request Entity Too Large. This recording is too long to be processed at once. Please download the audio file instead.";
      } else {
        yield `\n\n[Transcript Error] ${error.message}`;
      }
    }
  }

  async *analyzeAudioBufferStream(contextContent: string, systemInstruction: string) {
    if (this.audioChunks.length === 0) {
      yield "No audio recorded yet.";
      return;
    }

    try {
      const chunksToProcess = this.headerChunk ? [this.headerChunk, ...this.audioChunks] : [...this.audioChunks];
      const audioBlob = new Blob(chunksToProcess, { type: this.recordedMimeType });
      const base64Audio = await this.blobToBase64(audioBlob);

      this.usageStats.analyzedCount++;
      this.addInputAudioCost(this.audioChunks.length);
      this.onUsageUpdate(this.usageStats);

      const cleanMimeType = this.recordedMimeType.split(';')[0];
      const config: any = {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            situation_analysis: { type: Type.STRING },
            suggested_action: { type: Type.STRING },
            recommended_script: { type: Type.STRING }
          },
          required: ["situation_analysis", "suggested_action", "recommended_script"],
        }
      };

      const technicalProtocol = `
[TECHNICAL PROTOCOL]
Respond in JSON.
1. situation_analysis: Short summary of logic gap.
2. suggested_action: Pedagogical next step.
3. recommended_script: Verbatim script for teacher.
`;

      if (this.isCacheActive && this.cachedContentName) {
         config.cachedContent = this.cachedContentName;
      } else {
         config.systemInstruction = `${systemInstruction}\n${technicalProtocol}\n\n[RAG Context]\n${contextContent}`;
      }

      const response = await this.client.models.generateContent({
        model: this.currentModel,
        contents: [
          {
             parts: [
               { inlineData: { mimeType: cleanMimeType, data: base64Audio } },
               { text: "Analyze the conversation and provide feedback in JSON." }
             ]
          }
        ],
        config: config
      });

      const text = response.text;
      if (text) {
        this.addOutputTextCost(text);
        this.onUsageUpdate(this.usageStats);
        yield text;
      }
    } catch (error: any) {
      if (this.isRateLimitError(error)) {
        yield "\n\n[Error] API Rate limit reached. Please wait.";
      } else if (this.isEntityTooLargeError(error)) {
        yield "\n\n[Error] The audio clip is too large. Try reducing the Buffer Duration in settings.";
      } else {
        yield `\n\n[Error] ${error.message}`;
      }
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
