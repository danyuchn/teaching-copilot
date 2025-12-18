
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { geminiService, AudioSourceMode } from './services/geminiService';
import { AppStatus, KnowledgeItem, UsageStats } from './types';
import { KnowledgePanel } from './components/KnowledgePanel';
import { DEFAULT_SYSTEM_INSTRUCTION, DEFAULT_KNOWLEDGE_CONTENT } from './constants';
import { TutorialOverlay, TutorialStep } from './components/TutorialOverlay';

// Device detection helper
const isMobile = () => /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

// Enhanced markdown renderer
const renderMarkdown = (text: string) => {
  if (!text) return null;
  
  // 1. Pre-process: Fix bold text tags
  let processed = text.replace(/\*\*?\[(.*?)\]\*\*?:/g, '<span class="block text-xs font-bold uppercase tracking-wider mb-1 text-slate-500">$1</span>');
  
  // 2. Standard Bold
  processed = processed.replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-slate-900">$1</strong>');
  
  // 3. Simple Lists
  processed = processed.replace(/^\s*[\*\-]\s+(.*)$/gm, '<li class="ml-4 list-disc mb-1">$1</li>');

  const lines = processed.split('\n');
  const nodes: React.ReactNode[] = [];
  let listBuffer: string[] = [];

  lines.forEach((line, idx) => {
    if (line.includes('<li')) {
      listBuffer.push(line);
    } else {
      if (listBuffer.length > 0) {
        nodes.push(
          <ul key={`list-${idx}`} className="mb-4 text-slate-700">
            {listBuffer.map((item, i) => <span key={i} dangerouslySetInnerHTML={{ __html: item }} />)}
          </ul>
        );
        listBuffer = [];
      }
      if (line.trim()) {
        nodes.push(<p key={idx} className="mb-3 leading-relaxed" dangerouslySetInnerHTML={{ __html: line }} />);
      }
    }
  });

  if (listBuffer.length > 0) {
    nodes.push(
      <ul key="list-final" className="mb-4 text-slate-700">
        {listBuffer.map((item, i) => <span key={i} dangerouslySetInnerHTML={{ __html: item }} />)}
      </ul>
    );
  }

  return nodes;
};

export default function App() {
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [isCacheReady, setIsCacheReady] = useState<boolean>(false);
  const [liveTranscript, setLiveTranscript] = useState<string>("");
  const [hasRecordedData, setHasRecordedData] = useState<boolean>(false);
  const [showResetSuccess, setShowResetSuccess] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  
  const [systemInstruction, setSystemInstruction] = useState<string>(DEFAULT_SYSTEM_INSTRUCTION);
  const [knowledgeItems, setKnowledgeItems] = useState<KnowledgeItem[]>([]);
  const [audioMode, setAudioMode] = useState<AudioSourceMode>('mic');
  
  const [usage, setUsage] = useState<UsageStats>({
    analyzedCount: 0,
    totalAudioSeconds: 0,
    estimatedCost: 0
  });
  
  const [selectedModel, setSelectedModel] = useState<string>('gemini-2.5-flash-lite');
  const [bufferDuration, setBufferDuration] = useState<number>(60);
  
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isKnowledgeOpen, setIsKnowledgeOpen] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isDeviceMobile] = useState(isMobile());

  const transcriptEndRef = useRef<HTMLDivElement>(null);

  const tutorialSteps: TutorialStep[] = [
    {
      targetId: 'step-start-live',
      title: 'Start Live Monitoring',
      content: 'Click here to begin. AI will silently listen to the conversation in the background without interrupting your teaching flow.',
      position: 'bottom'
    },
    {
      targetId: 'step-analyze',
      title: 'Golden Analysis Button',
      content: 'When you hear a student question or feel a session plateau, click here. AI will immediately analyze the last 60 seconds and provide advice.',
      position: 'right'
    },
    {
      targetId: 'step-rag',
      title: 'Knowledge Base (RAG)',
      content: 'Upload your SOPs or lecture notes here. This allows the AI to provide precise suggestions based on your unique teaching logic.',
      position: 'right'
    },
    {
      targetId: 'step-persona',
      title: 'AI Persona & Behavior',
      content: "Define the AI's tone and feedback style here. All settings are automatically saved to your local browser.",
      position: 'right'
    },
    {
      targetId: 'step-suggestions',
      title: 'AI Suggestions Panel',
      content: 'All analysis results, including Situation Analysis, Suggested Actions, and Recommended Scripts, will appear in real-time here.',
      position: 'left'
    }
  ];

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

    const hasSeenTutorial = localStorage.getItem('tc_has_seen_tutorial');
    if (!hasSeenTutorial) {
        setShowTutorial(true);
    }

    geminiService.onUsageUpdate = (stats) => setUsage(stats);
    geminiService.onCacheStatusChange = (isActive) => setIsCacheReady(isActive);

    return () => geminiService.stopRecording();
  }, []);

  const handleTutorialComplete = () => {
    localStorage.setItem('tc_has_seen_tutorial', 'true');
    setShowTutorial(false);
  };

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
    console.log(`[RAG Test] User selected ${files.length} files for knowledge base injection.`);
    const newItems: KnowledgeItem[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const text = await file.text();
      console.log(`[RAG Test] Processing file: ${file.name} (${text.length} chars)`);
      newItems.push({ id: Math.random().toString(36).substr(2, 9), name: file.name, content: text });
    }
    setKnowledgeItems(prev => [...prev, ...newItems]);
  };

  const handleRemoveKnowledge = (id: string) => {
    setKnowledgeItems(prev => prev.filter(item => item.id !== id));
  };

  const handleClearAllData = () => {
    if (window.confirm("WARNING: This will clear all history, knowledge base files, and settings. Continue?")) {
        console.log("[Privacy Test] Reset initiated by user via 'Privacy Wipe'.");
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
    if (window.confirm("Reset AI persona to default template?")) {
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
        alert(e.message || "Failed to start recording");
        setStatus(AppStatus.ERROR);
      }
    } else {
      geminiService.stopRecording();
      setStatus(AppStatus.IDLE);
      setTimeout(() => {
        if (geminiService.hasFullSessionData()) {
          setHasRecordedData(true);
        }
      }, 500);
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
      setLiveTranscript(prev => prev + "\n[Error] An error occurred during analysis");
      setStatus(AppStatus.RECORDING);
    }
  };

  const handleDownloadAudio = async () => {
    try {
      const blob = await geminiService.getFullAudioBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `teaching-session-${new Date().toISOString().slice(0, 19)}.webm`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      alert("Failed to download audio");
    }
  };

  const handleGenerateFullTranscript = async () => {
    setStatus(AppStatus.ANALYZING);
    try {
        const timestamp = new Date().toLocaleTimeString();
        setLiveTranscript(prev => prev + `\n\n--- Full Session Transcript (${timestamp}) ---\n[Transcript Mode]: Generating full verbatim text...\n`);
        const stream = geminiService.generateFullTranscriptStream();
        for await (const chunk of stream) setLiveTranscript(prev => prev + chunk);
        setStatus(AppStatus.IDLE);
    } catch (e) {
        setLiveTranscript(prev => prev + "\n[Error] An error occurred during transcription");
        setStatus(AppStatus.IDLE);
    }
  };

  const parseTranscriptBlocks = (text: string) => {
    const rawSessions = text.split(/--- (?:Analysis Session|Full Session Transcript) \(.*?\) ---/);
    const sessions = rawSessions.filter(s => s.trim().length > 0);

    return sessions.map((session, sIdx) => {
      const trimmed = session.trim();
      
      if (trimmed.includes('[Transcript Mode]')) {
          return (
            <div key={`trans-${sIdx}`} className="mb-12 animate-in fade-in slide-in-from-bottom-6 duration-700">
               <div className="flex items-center gap-4 mb-6 opacity-40">
                  <div className="h-px flex-1 bg-emerald-200"></div>
                  <span className="text-[10px] font-black tracking-[0.2em] uppercase text-emerald-500">Full Verbatim Transcript</span>
                  <div className="h-px flex-1 bg-emerald-200"></div>
               </div>
               <div className="bg-slate-900 text-slate-300 p-6 rounded-2xl shadow-xl font-mono text-sm leading-relaxed border border-slate-800">
                  {renderMarkdown(trimmed.replace('[Transcript Mode]:', ''))}
               </div>
            </div>
          );
      }

      try {
        const jsonData = JSON.parse(trimmed);
        const blocks = [
          { title: 'Situation Analysis', content: jsonData.situation_analysis },
          { title: 'Suggested Action', content: jsonData.suggested_action },
          { title: 'Recommended Script', content: jsonData.recommended_script }
        ];

        return (
          <div key={`analysis-${sIdx}`} className="mb-12 animate-in fade-in slide-in-from-bottom-6 duration-700">
             <div className="flex items-center gap-4 mb-6 opacity-40">
                <div className="h-px flex-1 bg-indigo-200"></div>
                <span className="text-[10px] font-black tracking-[0.2em] uppercase text-indigo-400">Analysis Session</span>
                <div className="h-px flex-1 bg-indigo-200"></div>
             </div>
             
             <div className="space-y-5">
                {blocks.map((b, bIdx) => (
                  <div key={bIdx} className={`rounded-2xl p-5 border shadow-sm transition-all hover:shadow-md ${
                    b.title.toLowerCase().includes('situation') ? 'bg-sky-50/60 border-sky-100' :
                    b.title.toLowerCase().includes('action') ? 'bg-violet-50/60 border-violet-100' :
                    b.title.toLowerCase().includes('script') ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200'
                  }`}>
                    <div className="flex items-center gap-2.5 mb-3">
                      <div className={`p-1.5 rounded-lg ${
                         b.title.toLowerCase().includes('situation') ? 'bg-sky-100 text-sky-600' :
                         b.title.toLowerCase().includes('action') ? 'bg-violet-100 text-violet-600' :
                         b.title.toLowerCase().includes('script') ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {b.title.toLowerCase().includes('situation') && <span>🧠</span>}
                        {b.title.toLowerCase().includes('action') && <span>⚡</span>}
                        {b.title.toLowerCase().includes('script') && <span>💬</span>}
                      </div>
                      <h3 className={`text-xs font-black uppercase tracking-widest ${
                        b.title.toLowerCase().includes('situation') ? 'text-sky-700' :
                        b.title.toLowerCase().includes('action') ? 'text-violet-700' :
                        b.title.toLowerCase().includes('script') ? 'text-emerald-700' : 'text-slate-600'
                      }`}>{b.title}</h3>
                    </div>
                    <div className={`text-[15px] leading-relaxed ${b.title.toLowerCase().includes('script') ? 'text-slate-900 font-bold italic border-l-4 border-emerald-300 pl-4' : 'text-slate-700'}`}>
                      {renderMarkdown(b.content)}
                    </div>
                  </div>
                ))}
             </div>
          </div>
        );
      } catch (e) {
        return (
          <div key={`fallback-${sIdx}`} className="mb-6 p-4 bg-slate-50 border border-slate-200 rounded-xl text-slate-600 italic">
            {renderMarkdown(trimmed)}
          </div>
        );
      }
    }).filter(Boolean);
  };

  const getDurationLabel = (sec: number) => sec < 60 ? `${sec}s` : `${sec / 60}m`;

  const renderSidebarContent = (isMobileView = false) => (
    <div className={`flex flex-col gap-4 h-full ${isMobileView ? 'p-4 pb-20' : 'p-0'}`}>
        {isMobileView && (
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

        <div className="flex flex-col gap-2">
            <div className="bg-white p-1 rounded-xl border border-slate-200 flex flex-wrap shadow-sm shrink-0">
                <button 
                    onClick={() => setAudioMode('mic')}
                    disabled={status !== AppStatus.IDLE}
                    className={`flex-1 min-w-[80px] flex items-center justify-center gap-1.5 py-2 rounded-lg text-[10px] font-bold transition-all ${audioMode === 'mic' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50 disabled:opacity-50'}`}
                >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                    Mic
                </button>
                <button 
                    onClick={() => {
                        if (isDeviceMobile) alert("Desktop only.");
                        else setAudioMode('system');
                    }}
                    disabled={status !== AppStatus.IDLE || isDeviceMobile}
                    className={`flex-1 min-w-[80px] flex items-center justify-center gap-1.5 py-2 rounded-lg text-[10px] font-bold transition-all ${audioMode === 'system' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'} ${isDeviceMobile ? 'opacity-40 cursor-not-allowed' : ''}`}
                >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                    System
                </button>
                <button 
                    onClick={() => {
                        if (isDeviceMobile) alert("Desktop only.");
                        else setAudioMode('mixed');
                    }}
                    disabled={status !== AppStatus.IDLE || isDeviceMobile}
                    className={`flex-1 min-w-[80px] flex items-center justify-center gap-1.5 py-2 rounded-lg text-[10px] font-bold transition-all ${audioMode === 'mixed' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'} ${isDeviceMobile ? 'opacity-40 cursor-not-allowed' : ''}`}
                >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    Mixed
                </button>
            </div>

            {isMobileView && (
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

        <button id="step-analyze" onClick={triggerAnalysis} disabled={status !== AppStatus.RECORDING} className={`w-full h-32 rounded-2xl font-bold text-lg shadow-lg transition-all flex flex-col items-center justify-center gap-2 border relative overflow-hidden shrink-0 ${status === AppStatus.RECORDING ? 'bg-gradient-to-br from-indigo-500 to-violet-600 text-white active:scale-[0.98]' : 'bg-white text-slate-300'}`}>
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

        <div id="step-persona" className="bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden flex flex-col shrink-0">
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
        
        <div id="step-rag" className={`transition-all duration-300 ${isKnowledgeOpen ? 'flex-1 min-h-[300px]' : 'flex-none'}`}>
            <KnowledgePanel items={knowledgeItems} onAddFiles={handleFiles} onRemoveItem={handleRemoveKnowledge} disabled={false} isExpanded={isKnowledgeOpen} onToggle={() => setIsKnowledgeOpen(!isKnowledgeOpen)} />
        </div>

        <div className="mt-auto pt-4 space-y-4">
            <button onClick={handleClearAllData} className="w-full flex items-center justify-center gap-2 py-3 text-xs font-bold text-rose-600 bg-rose-50 border border-rose-100 rounded-xl hover:bg-rose-100 transition-colors shadow-sm mb-2" title="Clear all history and settings for privacy">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                Privacy Wipe
            </button>

            <div className="bg-slate-100/50 p-4 rounded-xl border border-slate-200/50 flex items-start gap-3">
                <svg className="w-5 h-5 text-slate-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                <p className="text-[10px] text-slate-500 italic leading-relaxed">
                  <strong>Privacy Notice:</strong> This application records and processes audio. 
                  Please ensure all parties in the consultation have provided informed consent 
                  before starting a live session.
                </p>
            </div>
        </div>
    </div>
  );

  return (
    <div className="h-screen bg-slate-50 flex flex-col font-sans text-slate-900 overflow-hidden relative">
      {showTutorial && <TutorialOverlay steps={tutorialSteps} onComplete={handleTutorialComplete} />}
      
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

      {showResetSuccess && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[100] bg-emerald-600 text-white px-6 py-2 rounded-full shadow-xl animate-bounce flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M5 13l4 4L19 7" /></svg>
            <span className="font-bold text-sm">All sensitive data cleared successfully</span>
        </div>
      )}

      <header className="bg-white/90 backdrop-blur-md border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => setIsMobileMenuOpen(true)} className="lg:hidden p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-lg">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M4 6h16M4 12h16m-7 6h7" /></svg>
            </button>
            <div className="hidden sm:flex bg-gradient-to-br from-indigo-600 to-violet-600 text-white p-2 rounded-lg shadow-sm">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6 a3 3 0 01-3 3z" /></svg>
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
                <select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)} className="bg-transparent text-xs font-bold text-slate-600 py-1.5 outline-none cursor-pointer">
                    <option value="gemini-3-flash-preview">Gemini 3.0 Flash</option>
                    <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                    <option value="gemini-2.5-flash-lite">Gemini 2.5 Lite</option>
                </select>
             </div>
             <div className="flex items-center px-3 border-r border-slate-200">
                <select value={bufferDuration} onChange={(e) => setBufferDuration(Number(e.target.value))} className="bg-transparent text-xs font-bold text-slate-600 py-1.5 outline-none cursor-pointer">
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
             <button id="step-start-live" onClick={toggleRecording} className={`px-4 py-2 rounded-lg font-bold text-sm border shadow-sm transition-all ${status !== AppStatus.IDLE ? 'bg-rose-50 text-rose-600 border-rose-200 animate-pulse' : 'bg-slate-900 text-white border-transparent active:scale-95'}`}>
              {status !== AppStatus.IDLE ? 'Stop Listening' : 'Start Live'}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 flex flex-col lg:grid lg:grid-cols-12 gap-6 overflow-hidden">
        <aside className="hidden lg:col-span-4 lg:flex flex-col gap-4 overflow-y-auto scrollbar-hide shrink-0">
          {renderSidebarContent(false)}
        </aside>

        <section id="step-suggestions" className="lg:col-span-8 flex flex-col flex-1 min-h-0 bg-white rounded-2xl shadow-sm border border-slate-200/80 relative overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 backdrop-blur-sm sticky top-0 z-10">
            <h2 className="text-sm font-bold text-slate-700 flex items-center gap-2 uppercase tracking-wide">
                <svg className="w-4 h-4 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                AI Suggestions
            </h2>
            <div className="flex gap-4">
                {liveTranscript && <button onClick={() => setLiveTranscript("")} className="text-xs font-bold text-slate-400 hover:text-rose-500 transition-colors uppercase tracking-tight">Clear History</button>}
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-white scroll-smooth relative">
            <div className="max-w-3xl mx-auto min-h-full flex flex-col">
                {liveTranscript ? (
                  <div className="flex-1">
                    {parseTranscriptBlocks(liveTranscript)}
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-slate-300 pointer-events-none p-8 text-center animate-in fade-in duration-1000">
                     <div className="bg-slate-50 p-6 rounded-full mb-6 border border-slate-100 shadow-inner">
                        <svg className="w-16 h-16 text-slate-200" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6 a3 3 0 01-3-3z" /></svg>
                     </div>
                     <h3 className="text-slate-400 text-lg font-bold mb-2">Monitoring Ready</h3>
                     <p className="text-sm text-slate-400/60 max-w-sm leading-relaxed">AI is waiting for you to start the live connection.</p>
                  </div>
                )}

                {hasRecordedData && status === AppStatus.IDLE && (
                    <div className="mt-8 mb-12 p-6 bg-gradient-to-br from-indigo-50 to-violet-50 rounded-2xl border border-indigo-100 shadow-sm animate-in zoom-in-95 duration-500 pointer-events-auto">
                        <div className="flex items-start justify-between mb-4">
                            <div>
                                <h3 className="text-indigo-900 font-bold text-lg mb-1">Session Summary Ready</h3>
                                <p className="text-indigo-600/70 text-sm">Recording ended. You can download the full audio or generate a full transcript for later review.</p>
                            </div>
                            <div className="p-2 bg-indigo-100 rounded-full text-indigo-600">
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-3">
                            <button onClick={handleDownloadAudio} className="flex-1 flex items-center justify-center gap-2 bg-white text-indigo-600 font-bold py-3 px-4 rounded-xl border border-indigo-200 hover:bg-indigo-50 transition-colors shadow-sm">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                Download Full Audio
                            </button>
                            <button onClick={handleGenerateFullTranscript} className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 text-white font-bold py-3 px-4 rounded-xl hover:bg-indigo-700 transition-colors shadow-md">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                Generate Full Transcript
                            </button>
                        </div>
                    </div>
                )}
                
                <div ref={transcriptEndRef} className="h-10" />
            </div>
          </div>

          {(status === AppStatus.RECORDING || status === AppStatus.ANALYZING) && (
            <div className="lg:hidden absolute bottom-6 right-6 z-40">
                <button 
                  onClick={triggerAnalysis}
                  disabled={status === AppStatus.ANALYZING}
                  className="bg-indigo-600 text-white h-16 w-16 rounded-full shadow-2xl flex items-center justify-center border-4 border-white transition-all active:scale-90"
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
