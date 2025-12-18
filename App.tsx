
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { geminiService, AudioSourceMode } from './services/geminiService';
import { AppStatus, KnowledgeItem, UsageStats } from './types';
import { KnowledgePanel } from './components/KnowledgePanel';
import { DEFAULT_SYSTEM_INSTRUCTION, DEFAULT_KNOWLEDGE_CONTENT } from './constants';

export default function App() {
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [isCacheReady, setIsCacheReady] = useState<boolean>(false);
  const [liveTranscript, setLiveTranscript] = useState<string>("");
  const [hasRecordedData, setHasRecordedData] = useState<boolean>(false);
  const [showResetSuccess, setShowResetSuccess] = useState(false);
  
  const [systemInstruction, setSystemInstruction] = useState<string>(DEFAULT_SYSTEM_INSTRUCTION);
  const [knowledgeItems, setKnowledgeItems] = useState<KnowledgeItem[]>([]);
  const [audioMode, setAudioMode] = useState<AudioSourceMode>('mic');
  
  const [usage, setUsage] = useState<UsageStats>({
    analyzedCount: 0,
    totalAudioSeconds: 0,
    estimatedCost: 0
  });
  
  const [selectedModel, setSelectedModel] = useState<string>('gemini-3-flash-preview');
  const [bufferDuration, setBufferDuration] = useState<number>(60);
  
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isKnowledgeOpen, setIsKnowledgeOpen] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const transcriptEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const savedInstruction = localStorage.getItem('tc_system_instruction');
    if (savedInstruction) setSystemInstruction(savedInstruction);

    const savedKnowledge = localStorage.getItem('tc_knowledge_items');
    if (savedKnowledge) {
        try {
            setKnowledgeItems(JSON.parse(savedKnowledge));
        } catch (e) {
            console.error("Failed to parse knowledge items", e);
        }
    } else {
        setKnowledgeItems([
            { id: 'default', name: 'demo-sop.txt', content: DEFAULT_KNOWLEDGE_CONTENT }
        ]);
    }

    geminiService.onUsageUpdate = (stats) => setUsage(stats);
    geminiService.onCacheStatusChange = (isActive) => setIsCacheReady(isActive);

    return () => geminiService.stopRecording();
  }, []);

  useEffect(() => {
    localStorage.setItem('tc_system_instruction', systemInstruction);
  }, [systemInstruction]);

  useEffect(() => {
    localStorage.setItem('tc_knowledge_items', JSON.stringify(knowledgeItems));
  }, [knowledgeItems]);

  const updateCache = useCallback(async () => {
      const fullContext = knowledgeItems.map(k => `[${k.name}]\n${k.content}`).join("\n\n");
      await geminiService.updateContextCache(fullContext, systemInstruction);
  }, [knowledgeItems, systemInstruction]);

  useEffect(() => {
    geminiService.setModel(selectedModel);
    updateCache();
  }, [selectedModel, knowledgeItems, systemInstruction, updateCache]);

  useEffect(() => {
    geminiService.setBufferDuration(bufferDuration);
  }, [bufferDuration]);

  useEffect(() => {
    if (transcriptEndRef.current) {
        transcriptEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [liveTranscript]);

  const handleFiles = async (files: FileList) => {
    const newItems: KnowledgeItem[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const text = await file.text();
      newItems.push({ id: Math.random().toString(36).substr(2, 9), name: file.name, content: text });
    }
    setKnowledgeItems(prev => [...prev, ...newItems]);
  };

  const handleRemoveKnowledge = (id: string) => {
    setKnowledgeItems(prev => prev.filter(item => item.id !== id));
  };

  const handleClearAllData = () => {
    if (window.confirm("WARNING: This will wipe all session history, knowledge base files, and settings for privacy. Continue?")) {
        localStorage.clear();
        geminiService.clearAllSessionData();
        setLiveTranscript("");
        setKnowledgeItems([{ id: 'default', name: 'demo-sop.txt', content: DEFAULT_KNOWLEDGE_CONTENT }]);
        setSystemInstruction(DEFAULT_SYSTEM_INSTRUCTION);
        setHasRecordedData(false);
        setUsage({ analyzedCount: 0, totalAudioSeconds: 0, estimatedCost: 0 });
        setStatus(AppStatus.IDLE);
        setIsMobileMenuOpen(false);
        setShowResetSuccess(true);
        setTimeout(() => setShowResetSuccess(false), 3000);
    }
  };

  const handleResetInstruction = () => {
    if (window.confirm("Restore System Role to default template?")) {
      setSystemInstruction(DEFAULT_SYSTEM_INSTRUCTION);
    }
  };

  const toggleRecording = async () => {
    if (status === AppStatus.IDLE || status === AppStatus.ERROR) {
      try {
        await geminiService.startRecording(audioMode);
        setStatus(AppStatus.RECORDING);
        setHasRecordedData(false);
      } catch (e: any) {
        alert(e.message || "Failed to start recording.");
        setStatus(AppStatus.ERROR);
      }
    } else {
      geminiService.stopRecording();
      setStatus(AppStatus.IDLE);
      if (geminiService.hasFullSessionData()) setHasRecordedData(true);
    }
  };

  const downloadAudio = async () => {
    const blob = await geminiService.getFullAudioBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `session-${new Date().toISOString()}.webm`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const generateFullTranscript = async () => {
      if (status !== AppStatus.IDLE) return;
      setStatus(AppStatus.ANALYZING);
      try {
        const fullContext = knowledgeItems.map(k => `[${k.name}]\n${k.content}`).join("\n\n");
        setLiveTranscript(prev => prev + `\n\n=== 📝 Full Session Transcript ===\n`);
        const stream = geminiService.analyzeFullSessionStream(fullContext);
        for await (const chunk of stream) setLiveTranscript(prev => prev + chunk);
      } catch(e) {
          setLiveTranscript(prev => prev + "\n[Error] Analysis failed.");
      } finally {
          setStatus(AppStatus.IDLE);
      }
  };

  const triggerAnalysis = async () => {
    if (status !== AppStatus.RECORDING) return;
    setStatus(AppStatus.ANALYZING);
    try {
      const fullContext = knowledgeItems.map(k => `[${k.name}]\n${k.content}`).join("\n\n");
      const timestamp = new Date().toLocaleTimeString();
      setLiveTranscript(prev => prev + `\n\n--- Analysis (${timestamp}) ---\n`);
      const stream = geminiService.analyzeAudioBufferStream(fullContext, systemInstruction);
      for await (const chunk of stream) setLiveTranscript(prev => prev + chunk);
      setStatus(AppStatus.RECORDING);
    } catch (e) {
      setLiveTranscript(prev => prev + "\n[Error] Analysis failed.");
      setStatus(AppStatus.RECORDING);
    }
  };

  const getDurationLabel = (sec: number) => sec < 60 ? `${sec}s` : `${sec / 60}m`;

  const renderControls = (isMobile: boolean) => (
    <div className={`${isMobile ? 'flex flex-col gap-4' : 'hidden md:flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg p-1'}`}>
        <div className={isMobile ? 'flex flex-col gap-1' : ''}>
             <select 
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className={`bg-transparent text-xs font-medium text-slate-700 rounded hover:bg-white focus:bg-white outline-none border-none cursor-pointer transition-all ${isMobile ? 'p-2 border border-slate-200 bg-white' : 'py-1.5 px-3'}`}
             >
                <option value="gemini-3-flash-preview">Gemini 3 Flash</option>
                <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                <option value="gemini-2.5-flash-lite">Gemini 2.5 Flash Lite</option>
             </select>
        </div>
        {!isMobile && <div className="w-px h-4 bg-slate-200"></div>}
        <div className={`flex items-center ${isMobile ? 'p-2 bg-white border border-slate-200 rounded' : 'px-2'}`}>
            <select 
                value={bufferDuration}
                onChange={(e) => setBufferDuration(Number(e.target.value))}
                className="bg-transparent text-xs font-medium text-slate-700 py-1.5 px-1 rounded hover:bg-white outline-none border-none cursor-pointer w-full"
            >
                <option value={60}>Buffer: 1m</option>
                <option value={120}>Buffer: 2m</option>
                <option value={180}>Buffer: 3m</option>
                <option value={300}>Buffer: 5m</option>
            </select>
        </div>
        {!isMobile && <div className="w-px h-4 bg-slate-200"></div>}
        <div className={`${isMobile ? 'grid grid-cols-3 gap-2 bg-slate-100 p-3 rounded-lg' : 'px-3 flex gap-4'} text-[10px] font-mono`}>
             <div className="flex flex-col md:block"><span className="text-slate-500">REQ:</span><strong className="text-slate-700 ml-1">{usage.analyzedCount}</strong></div>
             <div className="flex flex-col md:block"><span className="text-slate-500">SEC:</span><strong className="text-slate-700 ml-1">{usage.totalAudioSeconds.toFixed(0)}</strong></div>
             <div className="flex flex-col md:block"><span className="text-slate-500">EST.$:</span><strong className="text-slate-700 ml-1">{usage.estimatedCost.toFixed(4)}</strong></div>
        </div>
    </div>
  );

  return (
    <div className="h-screen bg-slate-50 flex flex-col font-sans text-slate-900 overflow-hidden">
      {/* Toast Feedback */}
      {showResetSuccess && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[100] bg-emerald-600 text-white px-6 py-2 rounded-full shadow-xl animate-bounce flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
            <span className="font-bold text-sm">Privacy Wiped: All Data Cleared</span>
        </div>
      )}

      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-indigo-600 to-violet-600 text-white p-2 rounded-lg shadow-sm">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800 leading-tight">Teaching Copilot</h1>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${isCacheReady ? 'bg-emerald-500' : 'bg-amber-400'}`}></span>
                <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">{isCacheReady ? 'Cache Active' : 'Std Mode'}</span>
              </div>
            </div>
          </div>
          {renderControls(false)}
          <div className="flex items-center gap-2">
             <button onClick={handleClearAllData} className="hidden sm:flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-rose-600 bg-rose-50 border border-rose-100 rounded-lg hover:bg-rose-100 transition-colors shadow-sm" title="Clear all history and settings for privacy">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                Privacy Wipe
             </button>
             <button onClick={toggleRecording} className={`px-4 py-2 rounded-lg font-bold text-sm border shadow-sm ${status !== AppStatus.IDLE ? 'bg-white text-rose-600 border-rose-200' : 'bg-slate-900 text-white border-transparent'}`}>
              {status !== AppStatus.IDLE ? 'Stop Recording' : 'Start Live'}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 flex flex-col lg:grid lg:grid-cols-12 gap-4 lg:gap-6 overflow-hidden">
        <aside className="lg:col-span-4 flex flex-col gap-4 overflow-y-auto scrollbar-hide shrink-0">
          
          <div className="bg-white p-1 rounded-xl border border-slate-200 flex shadow-sm shrink-0">
             <button 
                onClick={() => setAudioMode('mic')}
                disabled={status !== AppStatus.IDLE}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-all ${audioMode === 'mic' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50 disabled:opacity-50'}`}
             >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                Microphone
             </button>
             <button 
                onClick={() => setAudioMode('system')}
                disabled={status !== AppStatus.IDLE}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-all ${audioMode === 'system' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50 disabled:opacity-50'}`}
                title="Capture audio from Zoom, YouTube, or Online Meeting"
             >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                System Audio
             </button>
          </div>

          <button onClick={triggerAnalysis} disabled={status !== AppStatus.RECORDING} className={`w-full h-32 rounded-2xl font-bold text-lg shadow-lg transition-all flex flex-col items-center justify-center gap-2 border relative overflow-hidden shrink-0 ${status === AppStatus.RECORDING ? 'bg-gradient-to-br from-indigo-500 to-violet-600 text-white' : 'bg-white text-slate-300'}`}>
            {status === AppStatus.ANALYZING ? (
                <>
                    <svg className="animate-spin h-8 w-8 text-violet-600" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    <span className="text-sm font-medium animate-pulse">Analyzing...</span>
                </>
            ) : (
                <>
                    <div className="flex items-center gap-2">
                        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                        <span>Analyze Last {getDurationLabel(bufferDuration)}</span>
                    </div>
                    <span className="text-[10px] font-normal opacity-80 uppercase tracking-tighter">
                      {status === AppStatus.RECORDING ? `Capturing via ${audioMode === 'mic' ? 'Mic' : 'System'}` : 'Start Live to Enable'}
                    </span>
                </>
            )}
          </button>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden flex flex-col shrink-0">
             <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 cursor-pointer" onClick={() => setIsSettingsOpen(!isSettingsOpen)}>
                <h2 className="text-sm font-semibold text-slate-700">System Role (AI Persona)</h2>
                <svg className={`w-4 h-4 text-slate-400 transform transition-transform ${isSettingsOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M19 9l-7 7-7-7" /></svg>
             </div>
             {isSettingsOpen && (
               <div className="p-3 bg-slate-50/30 flex flex-col">
                 <textarea value={systemInstruction} onChange={(e) => setSystemInstruction(e.target.value)} className="w-full h-48 text-xs p-3 rounded-lg border border-slate-200 outline-none resize-none font-mono text-slate-700 bg-white" />
                 <div className="flex justify-between items-center mt-2 px-1">
                    <span className="text-[10px] text-slate-400">Settings Saved Locally</span>
                    <button onClick={handleResetInstruction} className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider">Reset to Default</button>
                 </div>
               </div>
             )}
          </div>
          <div className={`transition-all duration-300 ${isKnowledgeOpen ? 'flex-1 min-h-[300px]' : 'flex-none'}`}>
            <KnowledgePanel items={knowledgeItems} onAddFiles={handleFiles} onRemoveItem={handleRemoveKnowledge} disabled={false} isExpanded={isKnowledgeOpen} onToggle={() => setIsKnowledgeOpen(!isKnowledgeOpen)} />
          </div>
        </aside>

        <section className="lg:col-span-8 flex flex-col flex-1 min-h-0 bg-white rounded-2xl shadow-sm border border-slate-200/80 relative">
          <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 backdrop-blur-sm sticky top-0 z-10">
            <h2 className="text-base font-semibold text-slate-700 flex items-center gap-2">
                Copilot Suggestions
                {status === AppStatus.RECORDING && (
                    <span className="flex h-2 w-2 relative">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                )}
            </h2>
            <div className="flex gap-4">
                {hasRecordedData && status === AppStatus.IDLE && (
                    <button onClick={downloadAudio} className="text-xs font-bold text-slate-500 hover:text-indigo-600 transition-colors">Download Audio</button>
                )}
                {liveTranscript && <button onClick={() => setLiveTranscript("")} className="text-xs text-slate-400 hover:text-slate-600">Clear History</button>}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-white scroll-smooth relative">
            {liveTranscript ? (
              <div className="prose prose-slate prose-sm max-w-none">
                <div className="whitespace-pre-wrap text-slate-700 leading-relaxed font-normal">{liveTranscript}</div>
                <div ref={transcriptEndRef} className="h-10" />
              </div>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-300 pointer-events-none p-8 text-center">
                 <div className="bg-slate-50 p-4 rounded-full mb-4">
                    <svg className="w-12 h-12 text-slate-200" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                 </div>
                 <h3 className="text-slate-400 font-medium">Monitoring Active</h3>
                 <p className="text-sm text-slate-400/80 max-w-xs">AI is silently listening to your {audioMode === 'mic' ? 'microphone' : 'system audio'}. Click analyze whenever you need help.</p>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
