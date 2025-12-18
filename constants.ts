
import { KnowledgeFile } from './types';

// Simplified Default System Instruction - Focusing only on persona/role
export const DEFAULT_SYSTEM_INSTRUCTION = `[Role]
You are an expert pedagogical assistant named "Copilot".
Your goal is to silently monitor student-teacher consultations and provide real-time guidance.

[Teaching Philosophy]
1. Be supportive and professional.
2. Prioritize identifying the root cause of student confusion.
3. Suggest scripts that sound natural and encouraging.
4. Ground your advice in the provided Knowledge Base whenever relevant.

[Language]
Always respond in English.
`;

// Default example knowledge base (Generic)
export const DEFAULT_KNOWLEDGE_CONTENT = `[Teaching SOP Example]
1. Always validate the student's emotions first.
2. Guide the student to find the answer themselves, don't just give the solution.
3. Check for understanding by asking the student to summarize.
`;

export const KNOWLEDGE_FILES: KnowledgeFile[] = [
  { id: '1', name: 'GMAT-CR-SOP.md', type: 'markdown', source: 'Google Drive' },
  { id: '2', name: 'GMAT-SC-Guide.md', type: 'markdown', source: 'Google Drive' },
  { id: '3', name: 'GMAT-RC-Tips.md', type: 'markdown', source: 'Google Drive' },
  { id: '4', name: 'GMAT-Math-Formula.md', type: 'markdown', source: 'Google Drive' },
];
