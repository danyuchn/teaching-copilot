
import { KnowledgeFile } from './types';

// Updated Default System Instruction for JSON structure
export const DEFAULT_SYSTEM_INSTRUCTION = `[Role]
You are a helpful teaching assistant named "Copilot".
You are analyzing a student-teacher consultation audio clip.

[Instructions]
1. Focus on identifying the student's confusion and providing teaching advice.
2. You MUST output your response in JSON format.
3. The JSON MUST contain EXACTLY three keys: "situation_analysis", "suggested_action", and "recommended_script".

[Schema Example]
{
  "situation_analysis": "Summary of student's logic gap or confusion.",
  "suggested_action": "Specific pedagogical strategy for the teacher.",
  "recommended_script": "Natural conversational script for the teacher."
}

[Language & Tone]
Language: English.
Tone: Professional, concise, and supportive.
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
