
import React from 'react';
import { KNOWLEDGE_FILES } from '../constants';

interface MSRCardProps {
  onStartSession: () => void;
  isLive: boolean;
}

export const MSRCard: React.FC<MSRCardProps> = ({ onStartSession, isLive }) => {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 max-w-3xl w-full mx-auto">
      {/* Header Section */}
      <div className="flex items-center gap-4 mb-6">
        <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 font-bold text-xl">
          C
        </div>
        <h1 className="text-xl font-medium text-gray-800">Teaching Copilot Settings</h1>
      </div>

      {/* Name Field */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-600 mb-2">Name</label>
        <div className="w-full bg-gray-50 border border-gray-100 rounded-lg p-3 text-gray-800">
          General Teaching Assistant
        </div>
      </div>

      {/* Description Field */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-600 mb-2">Description</label>
        <div className="w-full bg-gray-50 border border-gray-100 rounded-lg p-3 text-gray-400">
          Introduction to the assistant's capabilities
        </div>
      </div>

      {/* Instruction Field (The Blue Box) */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-2">
          <label className="text-sm font-medium text-gray-600 flex items-center gap-1">
            Instructions
            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </label>
        </div>
        
        <div className="w-full border-2 border-blue-400 rounded-lg p-4 bg-white relative">
          <textarea 
            className="w-full h-64 resize-none outline-none text-gray-700 text-sm leading-relaxed"
            readOnly
            defaultValue={`You are a helpful assistant for the teacher. Please use the attached knowledge base files to help answer questions.

Since your role is to assist the teacher, your response must:

(1) Summarize the key points of the student's question and what the teacher needs to address.

(2) Provide suggestions based on the logic found in the knowledge base files.

Please separate these two parts to allow the teacher to review the question independently before seeing the advice...`}
          />
          {/* Simulate the scrollbar from screenshot */}
          <div className="absolute top-4 right-2 w-1.5 h-32 bg-gray-200 rounded-full"></div>
          
          {/* Action Buttons (Undo/Redo/Magic) */}
          <div className="absolute bottom-4 left-4 flex gap-2">
             <button className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 text-gray-600">
               <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
             </button>
             <button className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 text-gray-600">
               <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 01-8 8v2M21 10l-6 6m6-6l-6-6" /></svg>
             </button>
             <button className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 text-gray-600">
               <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
             </button>
          </div>
        </div>
      </div>

      {/* Related Info (Knowledge Base Chips) */}
      <div className="mb-4">
        <div className="flex justify-between items-center mb-2">
           <label className="text-sm font-medium text-gray-600 flex items-center gap-1">
            Related Info
            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </label>
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          {KNOWLEDGE_FILES.map(file => (
            <div key={file.id} className="bg-gray-100 p-3 rounded-lg flex items-center gap-3">
              <div className="w-8 h-8 bg-red-700 rounded flex items-center justify-center text-white text-xs font-bold shrink-0">
                &lt;&gt;
              </div>
              <div className="overflow-hidden">
                <p className="text-sm font-medium text-gray-800 truncate">{file.name}</p>
                <p className="text-xs text-gray-500 truncate">MD (Google Drive)</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Integration Point: Start Live Button */}
      <div className="mt-8 pt-6 border-t border-gray-100 flex justify-end">
        <button 
          onClick={onStartSession}
          disabled={isLive}
          className={`px-6 py-2.5 rounded-lg font-medium transition-all ${
            isLive 
            ? 'bg-red-50 text-red-500 cursor-default ring-1 ring-red-200' 
            : 'bg-blue-600 text-white hover:bg-blue-700 shadow-md hover:shadow-lg'
          }`}
        >
          {isLive ? '🔴 Live Monitoring Active' : 'Start Live Consultation'}
        </button>
      </div>
    </div>
  );
};
