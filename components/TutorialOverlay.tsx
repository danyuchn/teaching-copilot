
import React, { useState, useEffect } from 'react';

export interface TutorialStep {
  targetId: string;
  title: string;
  content: string;
  position: 'top' | 'bottom' | 'left' | 'right';
}

interface TutorialOverlayProps {
  steps: TutorialStep[];
  onComplete: () => void;
}

export const TutorialOverlay: React.FC<TutorialOverlayProps> = ({ steps, onComplete }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [highlightRect, setHighlightRect] = useState<DOMRect | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      const step = steps[currentStep];
      const element = document.getElementById(step.targetId);
      if (element) {
        setHighlightRect(element.getBoundingClientRect());
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setIsVisible(true);
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [currentStep, steps]);

  useEffect(() => {
    const handleResize = () => {
      const step = steps[currentStep];
      const element = document.getElementById(step.targetId);
      if (element) setHighlightRect(element.getBoundingClientRect());
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [currentStep, steps]);

  if (!highlightRect) return null;

  const next = () => {
    if (currentStep < steps.length - 1) {
      setIsVisible(false);
      setCurrentStep(prev => prev + 1);
    } else {
      onComplete();
    }
  };

  const skip = () => onComplete();

  const step = steps[currentStep];

  return (
    <div className="fixed inset-0 z-[200] overflow-hidden pointer-events-none">
      {/* Dark Backdrop with Hole */}
      <div 
        className="absolute inset-0 bg-slate-900/60 pointer-events-auto transition-opacity duration-500"
        style={{
          clipPath: `polygon(
            0% 0%, 0% 100%, 
            ${highlightRect.left - 8}px 100%, 
            ${highlightRect.left - 8}px ${highlightRect.top - 8}px, 
            ${highlightRect.right + 8}px ${highlightRect.top - 8}px, 
            ${highlightRect.right + 8}px ${highlightRect.bottom + 8}px, 
            ${highlightRect.left - 8}px ${highlightRect.bottom + 8}px, 
            ${highlightRect.left - 8}px 100%, 
            100% 100%, 100% 0%
          )`
        }}
      />

      {/* Popover */}
      <div 
        className={`absolute pointer-events-auto transition-all duration-500 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
        style={{
          top: step.position === 'bottom' ? highlightRect.bottom + 24 : 
               step.position === 'top' ? highlightRect.top - 24 : 
               highlightRect.top,
          left: step.position === 'right' ? highlightRect.right + 24 : 
                step.position === 'left' ? highlightRect.left - 24 : 
                highlightRect.left,
          transform: step.position === 'top' ? 'translateY(-100%)' : 
                     step.position === 'left' ? 'translateX(-100%)' : 'none',
          maxWidth: '320px',
          width: 'calc(100vw - 48px)'
        }}
      >
        <div className="bg-white rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] p-6 border border-indigo-100">
          <div className="flex justify-between items-center mb-4">
             <div className="flex gap-1">
                {steps.map((_, i) => (
                  <div key={i} className={`h-1 rounded-full transition-all ${i === currentStep ? 'w-4 bg-indigo-500' : 'w-1 bg-slate-200'}`} />
                ))}
             </div>
             <button onClick={skip} className="text-slate-400 hover:text-slate-600 text-[10px] font-bold uppercase tracking-widest">Skip</button>
          </div>
          <h3 className="text-slate-900 font-black text-xl mb-2">{step.title}</h3>
          <p className="text-slate-600 text-sm leading-relaxed mb-8">{step.content}</p>
          
          <div className="flex justify-end">
            <button 
              onClick={next}
              className="w-full bg-slate-900 text-white py-3 rounded-2xl text-sm font-bold shadow-lg hover:bg-indigo-600 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
            >
              {currentStep === steps.length - 1 ? 'Start Teaching' : 'Next Step'}
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
