
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { geminiService } from './services/geminiService';
import { AppStatus, KnowledgeItem, UsageStats } from './types';
import { KnowledgePanel } from './components/KnowledgePanel';
import { DEFAULT_SYSTEM_INSTRUCTION, DEFAULT_KNOWLEDGE_CONTENT } from './constants';

export default function App() {
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [isCacheReady, setIsCacheReady] = useState<boolean>(false);
  const [liveTranscript, setLiveTranscript] = useState<string>("");
  const [hasRecordedData, setHasRecordedData] = useState<boolean>(false);
  
  // -- Persistent State --
  // System Instruction (Role)
  const [systemInstruction, setSystemInstruction] = useState<string>(DEFAULT_SYSTEM_INSTRUCTION);
  // Knowledge Base
  const [knowledgeItems, setKnowledgeItems] = useState<KnowledgeItem[]>([]);
  
  // Usage Stats
  const [usage, setUsage] = useState<UsageStats>({
    analyzedCount: 0,
    totalAudioSeconds: 0,
    estimatedCost: 0
  });
  
  // Model & Buffer State
  const [selectedModel, setSelectedModel] = useState<string>('gemini-2.5-flash');
  const [bufferDuration, setBufferDuration] = useState<number>(60);
  
  // UI toggles
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Ref to scroll to bottom of transcript
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  // --- Persistence Logic ---
  useEffect(() => {
    // Load from LocalStorage on mount
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
        // Default init
        setKnowledgeItems([
            { id: 'default', name: 'demo-sop.txt', content: DEFAULT_KNOWLEDGE_CONTENT }
        ]);
    }

    geminiService.onUsageUpdate = (stats) => {
      setUsage(stats);
    };
    
    geminiService.onCacheStatusChange = (isActive) => {
        setIsCacheReady(isActive);
    };

    return () => {
      geminiService.stopRecording();
    };
  }, []);

  // Save to LocalStorage whenever they change
  useEffect(() => {
    localStorage.setItem('tc_system_instruction', systemInstruction);
  }, [systemInstruction]);

  useEffect(() => {
    localStorage.setItem('tc_knowledge_items', JSON.stringify(knowledgeItems));
  }, [knowledgeItems]);

  // --- Service Logic ---
  const updateCache = useCallback(async () => {
      const fullContext = knowledgeItems.map(k => `[${k.name}]\n${k.content}`).join("\n\n");
      // Pass both context and system role to the service
      await geminiService.updateContextCache(fullContext, systemInstruction);
  }, [knowledgeItems, systemInstruction]);

  // Update Cache when Model, Knowledge, or Role changes
  useEffect(() => {
    geminiService.setModel(selectedModel);
    updateCache();
  }, [selectedModel, knowledgeItems, systemInstruction, updateCache]);

  // Update Buffer Duration
  useEffect(() => {
    geminiService.setBufferDuration(bufferDuration);
  }, [bufferDuration]);

  // Scroll to bottom when transcript updates
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
      newItems.push({
        id: Math.random().toString(36).substr(2, 9),
        name: file.name,
        content: text
      });
    }
    setKnowledgeItems(prev => [...prev, ...newItems]);
  };

  const handleRemoveKnowledge = (id: string) => {
    setKnowledgeItems(prev => prev.filter(item => item.id !== id));
  };

  const toggleRecording = async () => {
    if (status === AppStatus.IDLE || status === AppStatus.ERROR) {
      try {
        await geminiService.startRecording();
        setStatus(AppStatus.RECORDING);
        setHasRecordedData(false); // Reset session data flag
      } catch (e) {
        console.error(e);
        setStatus(AppStatus.ERROR);
      }
    } else {
      geminiService.stopRecording();
      setStatus(AppStatus.IDLE);
      if (geminiService.hasFullSessionData()) {
         setHasRecordedData(true);
      }
    }
  };

  const downloadAudio = async () => {
    const blob = await geminiService.getFullAudioBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `session-${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const generateFullTranscript = async () => {
      if (status !== AppStatus.IDLE) return;
      
      setStatus(AppStatus.ANALYZING);
      try {
        const fullContext = knowledgeItems.map(k => `[${k.name}]\n${k.content}`).join("\n\n");
        const timestamp = new Date().toLocaleTimeString();
        setLiveTranscript(prev => prev + `\n\n=== 📝 Full Session Transcript & Summary (${timestamp}) ===\n`);
        
        const stream = geminiService.analyzeFullSessionStream(fullContext);
        for await (const chunk of stream) {
            setLiveTranscript(prev => prev + chunk);
        }
      } catch(e) {
          console.error(e);
          setLiveTranscript(prev => prev + "\n[Error] Failed to generate transcript.");
      } finally {
          setStatus(AppStatus.IDLE);
      }
  };

  const triggerAnalysis = async () => {
    if (status !== AppStatus.RECORDING) return;

    setStatus(AppStatus.ANALYZING);
    try {
      const fullContext = knowledgeItems.map(k => `[${k.name}]\n${k.content}`).join("\n\n");
      
      const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const header = `\n\n--- Analysis (${timestamp}) | Model: ${selectedModel} ---\n`;
      
      setLiveTranscript(prev => prev + header);

      // Pass systemInstruction to the analysis method
      const stream = geminiService.analyzeAudioBufferStream(fullContext, systemInstruction);
      
      for await (const chunk of stream) {
        setLiveTranscript(prev => prev + chunk);
      }
      
      setStatus(AppStatus.RECORDING);
    } catch (e) {
      console.error(e);
      setLiveTranscript(prev => prev + "\n[Error] Analysis failed. Please try again.");
      setStatus(AppStatus.RECORDING);
    }
  };

  const getDurationLabel = (sec: number) => {
    if (sec < 60) return `${sec}s`;
    return `${sec / 60}m`;
  };

  return (
    <div className="h-screen bg-slate-50 flex flex-col font-sans text-slate-900 overflow-hidden">
      {/* --- Header --- */}
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          
          {/* Logo & Title */}
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-indigo-600 to-violet-600 text-white p-2 rounded-lg shadow-sm">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800 leading-tight hidden sm:block">Teaching Copilot</h1>
              <h1 className="text-lg font-bold text-slate-800 leading-tight sm:hidden">Copilot</h1>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${isCacheReady ? 'bg-emerald-500' : 'bg-amber-400'}`}></span>
                <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">
                  {isCacheReady ? 'RAG Active' : 'Std Mode'}
                </span>
              </div>
            </div>
          </div>

          {/* Desktop Controls */}
          <div className="hidden md:flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg p-1">
             <select 
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="bg-transparent text-xs font-medium text-slate-700 py-1.5 px-3 rounded hover:bg-white focus:bg-white focus:ring-1 focus:ring-indigo-500 outline-none border-none cursor-pointer transition-all"
             >
                <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                <option value="gemini-2.5-flash-lite">Gemini 2.5 Flash Lite</option>
             </select>
             
             <div className="w-px h-4 bg-slate-200"></div>
             
             <div className="flex items-center gap-1 px-2">
                <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <select 
                    value={bufferDuration}
                    onChange={(e) => setBufferDuration(Number(e.target.value))}
                    className="bg-transparent text-xs font-medium text-slate-700 py-1.5 px-1 rounded hover:bg-white focus:bg-white focus:ring-1 focus:ring-indigo-500 outline-none border-none cursor-pointer transition-all"
                >
                    <option value={60}>Last 1 min</option>
                    <option value={120}>Last 2 mins</option>
                    <option value={180}>Last 3 mins</option>
                    <option value={300}>Last 5 mins</option>
                </select>
             </div>

             <div className="w-px h-4 bg-slate-200"></div>
             
             <div className="px-3 flex gap-4 text-[10px] font-mono text-slate-500">
                <span>REQ: <strong className="text-slate-700">{usage.analyzedCount}</strong></span>
                <span>SEC: <strong className="text-slate-700">{usage.totalAudioSeconds.toFixed(0)}</strong></span>
                <span>Est.$: <strong className="text-slate-700">{usage.estimatedCost.toFixed(4)}</strong></span>
             </div>
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-2">
             {status === AppStatus.IDLE && hasRecordedData && (
                <>
                  <button 
                    onClick={downloadAudio}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:text-indigo-600 transition-colors"
                    title="Download full session audio"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    <span className="hidden sm:inline">Audio</span>
                  </button>
                  <button 
                    onClick={generateFullTranscript}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:text-indigo-600 transition-colors"
                    title="Generate transcript for the full session"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    <span className="hidden sm:inline">Transcript</span>
                  </button>
                  <div className="w-px h-6 bg-slate-300 mx-1"></div>
                </>
             )}

             <button
              onClick={toggleRecording}
              className={`relative group px-4 py-2 rounded-lg font-semibold text-sm transition-all duration-200 flex items-center gap-2 border shadow-sm ${
                status !== AppStatus.IDLE
                  ? 'bg-white text-rose-600 border-rose-200 hover:bg-rose-50 hover:border-rose-300'
                  : 'bg-slate-900 text-white border-transparent hover:bg-slate-800 hover:shadow-md'
              }`}
            >
              {status !== AppStatus.IDLE && (
                 <span className="relative flex h-2 w-2">
                   <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                   <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                 </span>
              )}
              {status !== AppStatus.IDLE ? 'Stop Live' : (hasRecordedData ? 'Start New Session' : 'Start Live')}
            </button>
          </div>
        </div>
      </header>

      {/* --- Main Content --- */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 overflow-hidden">
        
        {/* Left Sidebar */}
        <aside className="lg:col-span-4 flex flex-col gap-4 overflow-y-auto max-h-[calc(100vh-8rem)] pb-20 lg:pb-0 scrollbar-hide">
          
          {/* 1. Hero Trigger Button */}
          <button
            onClick={triggerAnalysis}
            disabled={status !== AppStatus.RECORDING}
            className={`w-full py-6 sm:py-8 rounded-2xl font-bold text-lg sm:text-xl shadow-lg transition-all transform duration-200 flex flex-col items-center justify-center gap-2 border relative overflow-hidden group ${
                status === AppStatus.RECORDING
                ? 'bg-gradient-to-br from-indigo-500 to-violet-600 text-white border-transparent hover:shadow-indigo-200/50 hover:scale-[1.01] active:scale-[0.98]'
                : status === AppStatus.ANALYZING
                ? 'bg-white text-violet-600 border-violet-100 cursor-wait'
                : 'bg-white text-slate-300 border-slate-200 cursor-not-allowed'
            }`}
          >
             {status === AppStatus.RECORDING && (
               <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
             )}
             
            {status === AppStatus.ANALYZING ? (
                <>
                    <svg className="animate-spin h-8 w-8 text-violet-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span className="text-sm font-medium animate-pulse">Analyzing...</span>
                </>
            ) : (
                <>
                    <div className="flex items-center gap-2 z-10">
                        <svg className={`w-6 h-6 sm:w-8 sm:h-8 ${status === AppStatus.RECORDING ? 'text-white' : 'text-slate-300'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                        <span>Analyze Last {getDurationLabel(bufferDuration)}</span>
                    </div>
                    {status === AppStatus.RECORDING ? (
                        <span className="text-xs font-normal text-indigo-100 bg-indigo-700/30 px-2 py-0.5 rounded-full z-10">Ready to Trigger</span>
                    ) : (
                        <span className="text-xs font-normal opacity-80">Start Live to Enable</span>
                    )}
                </>
            )}
          </button>

          {/* 2. System Role Configuration */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden flex flex-col shrink-0">
             <div 
               className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 cursor-pointer hover:bg-slate-100/50 transition-colors"
               onClick={() => setIsSettingsOpen(!isSettingsOpen)}
             >
                <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <svg className="w-4 h-4 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  System Role (AI Persona)
                </h2>
                <svg className={`w-4 h-4 text-slate-400 transform transition-transform ${isSettingsOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
             </div>
             
             {isSettingsOpen && (
               <div className="p-3 bg-slate-50/30">
                 <textarea
                   value={systemInstruction}
                   onChange={(e) => setSystemInstruction(e.target.value)}
                   className="w-full h-48 text-xs sm:text-sm p-3 rounded-lg border border-slate-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none resize-none font-mono leading-relaxed text-slate-700 bg-white"
                   placeholder="Define how the AI should behave..."
                 />
                 <div className="mt-2 flex justify-end">
                    <span className="text-[10px] text-slate-400">Autosaved to browser storage</span>
                 </div>
               </div>
             )}
          </div>

          {/* 3. Knowledge Panel */}
          <div className="flex-1 min-h-[300px]">
            <KnowledgePanel 
                items={knowledgeItems} 
                onAddFiles={handleFiles}
                onRemoveItem={handleRemoveKnowledge}
                disabled={false}
            />
          </div>
        </aside>

        {/* Right Content (Transcript) */}
        <section className="lg:col-span-8 flex flex-col h-full overflow-hidden bg-white rounded-2xl shadow-sm border border-slate-200/80 relative">
          
          {/* Header */}
          <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 backdrop-blur-sm sticky top-0 z-10">
            <h2 className="text-base font-semibold text-slate-700 flex items-center gap-2">
              <svg className="w-5 h-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
              Copilot Suggestions
            </h2>
            {liveTranscript && (
                <button 
                  onClick={() => setLiveTranscript("")}
                  className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
                >
                  Clear History
                </button>
            )}
          </div>
          
          {/* Scrollable Area */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-white scroll-smooth relative">
            {liveTranscript ? (
              <div className="prose prose-slate prose-sm sm:prose-base max-w-none">
                <div className="whitespace-pre-wrap text-slate-700 leading-relaxed font-normal">
                  {liveTranscript}
                </div>
                <div ref={transcriptEndRef} className="h-10" />
              </div>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-300 pointer-events-none p-8 text-center">
                 <div className="bg-slate-50 p-4 rounded-full mb-4">
                    <svg className="w-12 h-12 text-slate-200" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                 </div>
                 <h3 className="text-slate-400 font-medium mb-1">No suggestions yet</h3>
                 <p className="text-sm text-slate-400/80 max-w-xs">Start recording and click the analyze button when you need assistance.</p>
              </div>
            )}
          </div>
        </section>
      </main>

      {/* API Key Warning Overlay */}
      {!process.env.API_KEY && (
         <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
           <div className="bg-white p-8 rounded-2xl max-w-sm w-full text-center shadow-2xl border border-white/20">
             <div className="text-rose-500 mb-4 flex justify-center bg-rose-50 w-16 h-16 rounded-full items-center mx-auto">
               <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
             </div>
             <h3 className="text-xl font-bold mb-2 text-slate-800">Missing API Key</h3>
             <p className="text-slate-600 text-sm leading-relaxed">
               Please configure your <code>API_KEY</code> environment variable in the source code or build process to continue.
             </p>
           </div>
         </div>
      )}
    </div>
  );
}
