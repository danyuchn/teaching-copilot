export interface KnowledgeItem {
  id: string;
  name: string;
  content: string;
}

export interface KnowledgeFile {
  id: string;
  name: string;
  type: string;
  source: string;
}

export enum AppStatus {
  IDLE = 'idle',
  RECORDING = 'recording', // Background rolling buffer is active
  ANALYZING = 'analyzing', // Sending data to API and waiting for response
  ERROR = 'error',
}

export interface UsageStats {
  analyzedCount: number; // Number of times "Analyze" was clicked
  totalAudioSeconds: number; // Total seconds sent to API
  estimatedCost: number;
}