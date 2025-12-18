
import { GoogleGenAI, Type } from "@google/genai";
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
        if (!navigator.mediaDevices.getDisplayMedia) {
          throw new Error("This browser/device does not support system audio capture (getDisplayMedia). Please use Microphone mode.");
        }

        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false
          }
        });

        const audioTracks = displayStream.getAudioTracks();
        if (audioTracks.length === 0) {
            displayStream.getTracks().forEach(t => t.stop());
            throw new Error("No system audio detected. Please ensure 'Share audio' is checked in the dialog.");
        }

        finalStream = new MediaStream(audioTracks);
        this.stream = displayStream; 
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
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.stop();
    }
    if (this.stream) {
        this.stream.getTracks().forEach(track => {
            track.stop();
        });
    }
    this.mediaRecorder = null;
    this.stream = null;
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

    try {
      const fullBlob = await this.getFullAudioBlob();
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
               { text: "Provide a complete verbatim transcript of this audio. Label speakers clearly as [Teacher] and [Student] if possible. Use timestamp tags like (00:00) at the start of paragraphs. Do NOT add any advice or summary, ONLY the transcript text." }
             ]
          }
        ],
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
      yield `\n\n[Transcript Error] ${error.message}`;
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
            situation_analysis: { type: Type.STRING, description: "Analysis of student's confusion or conversation context" },
            suggested_action: { type: Type.STRING, description: "Action points for the teacher" },
            recommended_script: { type: Type.STRING, description: "Precise script for the teacher to use" }
          },
          required: ["situation_analysis", "suggested_action", "recommended_script"],
        }
      };

      if (this.isCacheActive && this.cachedContentName) {
         config.cachedContent = this.cachedContentName;
      } else {
         config.systemInstruction = `${systemInstruction}\n\n[RAG Context]\n${contextContent}`;
      }

      const response = await this.client.models.generateContent({
        model: this.currentModel,
        contents: [
          {
             parts: [
               { inlineData: { mimeType: cleanMimeType, data: base64Audio } },
               { text: "Analyze the student-teacher conversation and provide feedback in JSON format." }
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
      yield `\n\n[Error] ${error.message}`;
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
