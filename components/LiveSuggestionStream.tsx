
import React, { useEffect, useRef } from 'react';
import { AppStatus } from '../types';

interface LiveSuggestionStreamProps {
  status: AppStatus;
  transcript: string; // The accumulated advice from AI
}

export const LiveSuggestionStream: React.FC<LiveSuggestionStreamProps> = ({ status, transcript }) => {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  if (status === AppStatus.IDLE) return null;

  return (
    <div className="fixed bottom-4 right-4 w-96 max-h-[80vh] flex flex-col gap-2 pointer-events-none">
      {/* Status Indicator */}
      <div className="bg-gray-900/90 backdrop-blur text-white px-4 py-2 rounded-lg shadow-lg self-end flex items-center gap-2 pointer-events-auto">
        {status === AppStatus.ANALYZING && <span className="animate-pulse">Analyzing audio...</span>}
        {status === AppStatus.RECORDING && (
          <>
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
            </span>
            <span className="font-medium text-sm">Listening (Copilot)</span>
          </>
        )}
        {status === AppStatus.ERROR && <span className="text-red-400">Connection Error</span>}
      </div>

      {/* Stream Area */}
      {transcript && (
        <div className="bg-white/95 backdrop-blur border border-purple-100 shadow-2xl rounded-xl p-4 overflow-y-auto max-h-[60vh] pointer-events-auto">
          <div className="flex items-center gap-2 mb-2 pb-2 border-b border-gray-100">
             <div className="bg-purple-600 p-1 rounded">
               <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
             </div>
             <span className="text-xs font-bold text-purple-700 uppercase tracking-wider">AI Teaching Suggestions</span>
          </div>
          
          <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap font-medium">
            {transcript || "Waiting for student input..."}
          </div>
          <div ref={endRef} />
        </div>
      )}
    </div>
  );
};
