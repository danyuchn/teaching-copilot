
import React, { useRef } from 'react';
import { KnowledgeItem } from '../types';

interface KnowledgePanelProps {
  items: KnowledgeItem[];
  onAddFiles: (files: FileList) => void;
  onRemoveItem: (id: string) => void;
  disabled: boolean;
  isExpanded: boolean;
  onToggle: () => void;
}

export const KnowledgePanel: React.FC<KnowledgePanelProps> = ({ 
  items, 
  onAddFiles, 
  onRemoveItem, 
  disabled, 
  isExpanded, 
  onToggle 
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onAddFiles(e.target.files);
    }
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className={`bg-white rounded-2xl shadow-sm border border-slate-200/80 flex flex-col overflow-hidden transition-all duration-300 ${isExpanded ? 'h-full' : 'h-auto'}`}>
      <div 
        className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 backdrop-blur-sm cursor-pointer hover:bg-slate-100/50 transition-colors"
      >
        <div className="flex items-center gap-2 flex-1" onClick={onToggle}>
          <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <svg className="w-4 h-4 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            Context (RAG)
          </h2>
          <svg className={`w-4 h-4 text-slate-400 transform transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            fileInputRef.current?.click();
          }}
          disabled={disabled}
          className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-all ml-2 ${
            disabled 
            ? 'bg-slate-100 text-slate-400 cursor-not-allowed' 
            : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100 hover:shadow-sm'
          }`}
        >
          + Upload
        </button>
        <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden" 
          accept=".txt,.md" 
          multiple 
          onChange={handleFileChange}
        />
      </div>

      {isExpanded && (
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-100 rounded-xl p-6 text-center">
              <svg className="w-8 h-8 mb-2 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              <p className="text-xs font-medium">No documents yet</p>
              <p className="text-[10px] mt-1 text-slate-400/80">Upload SOPs to improve AI accuracy</p>
            </div>
          ) : (
            items.map((item) => (
              <div key={item.id} className="group relative flex flex-col bg-white border border-slate-200 rounded-xl p-3 hover:border-indigo-300 hover:shadow-md transition-all duration-200">
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <div className="w-6 h-6 rounded bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500 shrink-0">
                      TXT
                    </div>
                    <span className="font-medium text-xs text-slate-700 truncate">{item.name}</span>
                  </div>
                  <button 
                    onClick={() => onRemoveItem(item.id)}
                    disabled={disabled}
                    className="text-slate-300 hover:text-rose-500 transition-colors p-1"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
                <p className="text-[10px] text-slate-500 line-clamp-2 bg-slate-50 p-2 rounded border border-slate-100/50 font-mono leading-relaxed">
                  {item.content}
                </p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
