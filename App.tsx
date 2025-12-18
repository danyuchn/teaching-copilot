
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
    if (window.confirm("WARNING: 這將清除所有歷史記錄、知識庫檔案與設定。是否繼續？")) {
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
    if (window.confirm("將 AI 人格還原至預設範本？")) {
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
        alert(e.message || "啟動錄音失敗");
        setStatus(AppStatus.ERROR);
      }
    } else {
      geminiService.stopRecording();
      setStatus(AppStatus.IDLE);
      if (geminiService.hasFullSessionData()) setHasRecordedData(true);
    }
  };

  const triggerAnalysis = async () => {
    if (status !== AppStatus.RECORDING) return;
    setStatus(AppStatus.ANALYZING);
    try {
      const fullContext = knowledgeItems.map(k => `[${k.name}]\n${k.content}`).join("\n\n");
      const timestamp = new Date().toLocaleTimeString();
      setLiveTranscript(prev => prev + `\n\n--- Analysis Session (${timestamp}) ---\n`);
      const stream = geminiService.analyzeAudioBufferStream(fullContext, systemInstruction);
      for await (const chunk of stream) setLiveTranscript(prev => prev + chunk);
      setStatus(AppStatus.RECORDING);
    } catch (e) {
      setLiveTranscript(prev => prev + "\n[Error] 分析過程發生錯誤");
      setStatus(AppStatus.RECORDING);
    }
  };

  const parseTranscriptBlocks = (text: string) => {
    const sessions = text.split(/--- Analysis Session \(\d{1,2}:\d{2}:\d{2}\s?[AP]M\) ---/);
    return sessions.map((session, idx) => {
      if (!session.trim()) return null;
      
      const blocks = [];
      const sections = session.split(/\[(.*?)\]:/);
      
      for(let i = 1; i < sections.length; i += 2) {
        const title = sections[i];
        const content = sections[i+1]?.trim();
        if (title && content) {
          blocks.push({ title, content });
        }
      }

      if (blocks.length === 0) {
        return <div key={idx} className="text-slate-500 italic py-2">{session}</div>;
      }

      return (
        <div key={idx} className="mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
           <div className="flex items-center gap-2 mb-4 opacity-50">
              <div className="h-px flex-1 bg-slate-200"></div>
              <span className="text-[10px] font-bold tracking-widest uppercase text-slate-400">Analysis Segment</span>
              <div className="h-px flex-1 bg-slate-200"></div>
           </div>
           <div className="space-y-4">
              {blocks.map((b, bIdx) => (
                <div key={bIdx} className={`rounded-xl p-4 border shadow-sm transition-all hover:shadow-md ${
                  b.title.includes('Situation') ? 'bg-sky-50/50 border-sky-100' :
                  b.title.includes('Action') ? 'bg-violet-50/50 border-violet-100' :
                  b.title.includes('Script') ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200'
                }`}>
                  <div className="flex items-center gap-2 mb-2">
                    {b.title.includes('Situation') && <svg className="w-4 h-4 text-sky-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>}
                    {b.title.includes('Action') && <svg className="w-4 h-4 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}
                    {b.title.includes('Script') && <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>}
                    <h3 className={`text-xs font-bold uppercase tracking-wider ${
                      b.title.includes('Situation') ? 'text-sky-700' :
                      b.title.includes('Action') ? 'text-violet-700' :
                      b.title.includes('Script') ? 'text-emerald-700' : 'text-slate-700'
                    }`}>{b.title}</h3>
                  </div>
                  <p className={`text-sm leading-relaxed ${b.title.includes('Script') ? 'text-slate-900 font-bold' : 'text-slate-700'}`}>
                    {b.content}
                  </p>
                </div>
              ))}
           </div>
        </div>
      );
    }).filter(Boolean);
  };

  const getDurationLabel = (sec: number) => sec < 60 ? `${sec}s` : `${sec / 60}m`;

  const renderSidebarContent = (isMobile = false) => (
    <div className={`flex flex-col gap-4 h-full ${isMobile ? 'p-4' : 'p-0'}`}>
        {/* Mobile-only Usage Stats Display */}
        {isMobile && (
          <div className="grid grid-cols-2 gap-2 mb-2">
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                <span className="text-[10px] text-slate-400 block uppercase font-bold mb-1 tracking-tighter">Total Usage</span>
                <span className="text-sm font-mono font-bold text-slate-700">{usage.totalAudioSeconds.toFixed(0)}s</span>
            </div>
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                <span className="text-[10px] text-slate-400 block uppercase font-bold mb-1 tracking-tighter">Est. Cost</span>
                <span className="text-sm font-mono font-bold text-indigo-600">${usage.estimatedCost.toFixed(4)}</span>
            </div>
          </div>
        )}

        {/* Core Config Controls */}
        <div className="flex flex-col gap-2">
            <div className="bg-white p-1 rounded-xl border border-slate-200 flex shadow-sm shrink-0">
                <button 
                    onClick={() => setAudioMode('mic')}
                    disabled={status !== AppStatus.IDLE}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-all ${audioMode === 'mic' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50 disabled:opacity-50'}`}
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                    Microphone
                </button>
                <button 
                    onClick={() => setAudioMode('system')}
                    disabled={status !== AppStatus.IDLE}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-all ${audioMode === 'system' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50 disabled:opacity-50'}`}
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                    System Audio
                </button>
            </div>

            {/* Mobile-only Dropdowns inside Sidebar */}
            {isMobile && (
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-slate-400 ml-1">MODEL</label>
                    <select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)} className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs font-bold text-slate-700">
                        <option value="gemini-3-flash-preview">Flash 3.0</option>
                        <option value="gemini-2.5-flash">Flash 2.5</option>
                        <option value="gemini-2.5-flash-lite">Flash Lite</option>
                    </select>
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-slate-400 ml-1">BUFFER</label>
                    <select value={bufferDuration} onChange={(e) => setBufferDuration(Number(e.target.value))} className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs font-bold text-slate-700">
                        <option value={60}>1 Minute</option>
                        <option value={120}>2 Minutes</option>
                        <option value={180}>3 Minutes</option>
                        <option value={300}>5 Minutes</option>
                    </select>
                </div>
              </div>
            )}
        </div>

        <button onClick={triggerAnalysis} disabled={status !== AppStatus.RECORDING} className={`w-full h-32 rounded-2xl font-bold text-lg shadow-lg transition-all flex flex-col items-center justify-center gap-2 border relative overflow-hidden shrink-0 ${status === AppStatus.RECORDING ? 'bg-gradient-to-br from-indigo-500 to-violet-600 text-white' : 'bg-white text-slate-300'}`}>
            {status === AppStatus.ANALYZING ? (
                <>
                    <svg className="animate-spin h-8 w-8 text-white/80" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    <span className="text-sm font-medium animate-pulse">Analyzing...</span>
                </>
            ) : (
                <>
                    <div className="flex items-center gap-2">
                        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                        <span>Analyze Last {getDurationLabel(bufferDuration)}</span>
                    </div>
                    <span className="text-[10px] font-normal opacity-80 uppercase tracking-tighter">
                      {status === AppStatus.RECORDING ? `Using ${audioMode}` : 'Waiting for Live Start'}
                    </span>
                </>
            )}
        </button>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden flex flex-col shrink-0">
             <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 cursor-pointer" onClick={() => setIsSettingsOpen(!isSettingsOpen)}>
                <h2 className="text-sm font-semibold text-slate-700">AI Persona Settings</h2>
                <svg className={`w-4 h-4 text-slate-400 transform transition-transform ${isSettingsOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M19 9l-7 7-7-7" /></svg>
             </div>
             {isSettingsOpen && (
               <div className="p-3 bg-slate-50/30 flex flex-col animate-in fade-in slide-in-from-top-2">
                 <textarea value={systemInstruction} onChange={(e) => setSystemInstruction(e.target.value)} className="w-full h-48 text-xs p-3 rounded-lg border border-slate-200 outline-none resize-none font-mono text-slate-700 bg-white" />
                 <div className="flex justify-between items-center mt-2 px-1">
                    <span className="text-[10px] text-slate-400">Autosaved to local</span>
                    <button onClick={handleResetInstruction} className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider hover:text-indigo-700">Reset Template</button>
                 </div>
               </div>
             )}
        </div>
        
        <div className={`transition-all duration-300 ${isKnowledgeOpen ? 'flex-1 min-h-[300px]' : 'flex-none'}`}>
            <KnowledgePanel items={knowledgeItems} onAddFiles={handleFiles} onRemoveItem={handleRemoveKnowledge} disabled={false} isExpanded={isKnowledgeOpen} onToggle={() => setIsKnowledgeOpen(!isKnowledgeOpen)} />
        </div>

        <button onClick={handleClearAllData} className="w-full flex items-center justify-center gap-2 py-3 text-xs font-bold text-rose-600 bg-rose-50 border border-rose-100 rounded-xl hover:bg-rose-100 transition-colors shadow-sm mt-auto" title="Clear all history and settings for privacy">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            隱私清除 (Privacy Wipe)
        </button>
    </div>
  );

  return (
    <div className="h-screen bg-slate-50 flex flex-col font-sans text-slate-900 overflow-hidden relative">
      {/* Mobile Drawer Overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-[60] lg:hidden">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onClick={() => setIsMobileMenuOpen(false)}></div>
            <div className="absolute inset-y-0 left-0 w-[85%] max-w-sm bg-slate-50 shadow-2xl animate-in slide-in-from-left duration-300 flex flex-col overflow-hidden">
                <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-white">
                    <span className="font-bold text-slate-800">System Settings</span>
                    <button onClick={() => setIsMobileMenuOpen(false)} className="p-2 text-slate-400 hover:text-slate-600">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto">
                    {renderSidebarContent(true)}
                </div>
            </div>
        </div>
      )}

      {/* Toast Feedback */}
      {showResetSuccess && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[100] bg-emerald-600 text-white px-6 py-2 rounded-full shadow-xl animate-bounce flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M5 13l4 4L19 7" /></svg>
            <span className="font-bold text-sm">已成功清除所有機敏資料</span>
        </div>
      )}

      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => setIsMobileMenuOpen(true)} className="lg:hidden p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-lg">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M4 6h16M4 12h16m-7 6h7" /></svg>
            </button>
            <div className="hidden sm:flex bg-gradient-to-br from-indigo-600 to-violet-600 text-white p-2 rounded-lg shadow-sm">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-bold text-slate-800 leading-tight">Teaching Copilot</h1>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${isCacheReady ? 'bg-emerald-500' : 'bg-amber-400'}`}></span>
                <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">{isCacheReady ? 'Cache Ready' : 'Live Mode'}</span>
              </div>
            </div>
          </div>
          
          <div className="hidden lg:flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg p-1">
             <div className="flex items-center px-3 border-r border-slate-200">
                <select 
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="bg-transparent text-xs font-bold text-slate-600 py-1.5 outline-none cursor-pointer"
                >
                    <option value="gemini-3-flash-preview">Gemini 3.0 Flash</option>
                    <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                    <option value="gemini-2.5-flash-lite">Gemini 2.5 Lite</option>
                </select>
             </div>
             <div className="flex items-center px-3 border-r border-slate-200">
                <select 
                    value={bufferDuration}
                    onChange={(e) => setBufferDuration(Number(e.target.value))}
                    className="bg-transparent text-xs font-bold text-slate-600 py-1.5 outline-none cursor-pointer"
                >
                    <option value={60}>Buffer: 1m</option>
                    <option value={120}>Buffer: 2m</option>
                    <option value={180}>Buffer: 3m</option>
                    <option value={300}>Buffer: 5m</option>
                </select>
             </div>
             <div className="px-3 flex gap-4 text-[10px] font-mono">
                <div className="flex flex-col"><span className="text-slate-400">Total SEC:</span><strong className="text-slate-700">{usage.totalAudioSeconds.toFixed(0)}</strong></div>
                <div className="flex flex-col"><span className="text-slate-400">Est. COST:</span><strong className="text-indigo-600">${usage.estimatedCost.toFixed(4)}</strong></div>
             </div>
          </div>

          <div className="flex items-center gap-2">
             <button onClick={toggleRecording} className={`px-4 py-2 rounded-lg font-bold text-sm border shadow-sm transition-all ${status !== AppStatus.IDLE ? 'bg-rose-50 text-rose-600 border-rose-200 animate-pulse' : 'bg-slate-900 text-white border-transparent'}`}>
              {status !== AppStatus.IDLE ? 'Stop Listening' : 'Start Live'}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 flex flex-col lg:grid lg:grid-cols-12 gap-6 overflow-hidden">
        {/* Desktop Sidebar */}
        <aside className="hidden lg:col-span-4 lg:flex flex-col gap-4 overflow-y-auto scrollbar-hide shrink-0">
          {renderSidebarContent(false)}
        </aside>

        {/* Main Sugggestion Area */}
        <section className="lg:col-span-8 flex flex-col flex-1 min-h-0 bg-white rounded-2xl shadow-sm border border-slate-200/80 relative overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/30 backdrop-blur-sm sticky top-0 z-10">
            <h2 className="text-sm font-bold text-slate-700 flex items-center gap-2 uppercase tracking-wide">
                <svg className="w-4 h-4 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                AI Suggestions
            </h2>
            <div className="flex gap-4">
                {liveTranscript && <button onClick={() => setLiveTranscript("")} className="text-xs font-bold text-slate-400 hover:text-rose-500 transition-colors uppercase tracking-tight">Clear History</button>}
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-white scroll-smooth relative">
            {liveTranscript ? (
              <div className="max-w-3xl mx-auto">
                {parseTranscriptBlocks(liveTranscript)}
                <div ref={transcriptEndRef} className="h-20" />
              </div>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-300 pointer-events-none p-8 text-center animate-in fade-in duration-1000">
                 <div className="bg-slate-50 p-6 rounded-full mb-6 border border-slate-100 shadow-inner">
                    <svg className="w-16 h-16 text-slate-200" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3-3z" /></svg>
                 </div>
                 <h3 className="text-slate-400 text-lg font-bold mb-2">Monitoring Active</h3>
                 <p className="text-sm text-slate-400/60 max-w-sm leading-relaxed">
                    AI 正在背景持續監聽您的教學過程。{status === AppStatus.RECORDING ? '您可以隨時點擊左側的「Analyze」按鈕來獲得針對性的教學建議與話術。' : '請點擊右上角的「Start Live」開始連線。'}
                 </p>
              </div>
            )}
          </div>

          {/* Floating Mobile Analysis Action */}
          {(status === AppStatus.RECORDING || status === AppStatus.ANALYZING) && (
            <div className="lg:hidden absolute bottom-6 right-6 z-40">
                <button 
                  onClick={triggerAnalysis}
                  disabled={status === AppStatus.ANALYZING}
                  className="bg-indigo-600 text-white h-16 w-16 rounded-full shadow-2xl flex items-center justify-center border-4 border-white transition-transform active:scale-90"
                >
                    {status === AppStatus.ANALYZING ? (
                        <svg className="animate-spin h-6 w-6" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    ) : (
                        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                    )}
                </button>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
