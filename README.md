
# Teaching Copilot

Teaching Copilot is a real-time voice monitoring assistant designed to help instructors during consultations. It uses the multimodal capabilities of Google Gemini (via JSON response mode) and a rolling buffer recording mechanism to provide immediate pedagogical advice without interrupting the teaching flow.

## Core Features

### 1. Silent Voice Monitoring (Rolling Buffer)
- Continuously monitors audio in the background while only keeping a short window (e.g., last 60-300 seconds).
- Only sends the specific context to AI when "Analyze" is clicked, optimizing cost and privacy.

### 2. High-Stability JSON Analysis
- Leverages the Gemini API's **JSON Response Schema** to ensure analysis always follows a strict structure.
- Provides three specific outputs:
    - **Situation Analysis**: Context of the student's confusion.
    - **Suggested Action**: Strategy for the teacher.
    - **Recommended Script**: Natural language for the teacher to speak.

### 3. Customizable AI Persona
- Easily adjust the system instructions to change the assistant's behavior (e.g., supportive coach vs. strict grader).
- Settings are persisted locally in your browser.

### 4. Knowledge Base (RAG)
- Upload `.txt` or `.md` files as a private knowledge base.
- AI uses these files to ground its advice in your specific teaching methodology.
- Supports **Gemini Context Caching** for large knowledge bases to reduce latency.

### 5. Post-Session Review
- Download full session audio files for archival.
- Generate complete verbatim transcripts using high-fidelity Gemini models.

## Technology Stack

- **Frontend**: React 18, Tailwind CSS, Vite
- **AI SDK**: `@google/genai` (Gemini Pro & Flash models)
- **Data Privacy**: Purely client-side logic. Sensitive settings and knowledge files stay in your local storage.

## Setup Instructions

See [SETUP_GUIDE.md](SETUP_GUIDE.md) for detailed installation steps. 

### Quick Start
1. Create a `.env` file with your `API_KEY`.
2. Run `npm install`.
3. Run `npm run dev`.
4. Click "Start Live" to begin monitoring.
