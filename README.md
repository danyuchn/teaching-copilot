# Teaching Copilot (Open Source)

> **👋 New User? / 新手入門？**
>
> If you are running this on your local computer for the first time, please read **[SETUP_GUIDE.md](SETUP_GUIDE.md)** first.
>
> 如果你是第一次在電腦上執行此程式，請先閱讀 **[新手安裝指南 (SETUP_GUIDE.md)](SETUP_GUIDE.md)**。

This is a generic real-time voice teaching assistant tool. It utilizes the multimodal capabilities of Google Gemini 2.5, along with a "Rolling Buffer" mechanism, to provide real-time teaching advice and logical analysis without interrupting the teaching process.

This tool is suitable for any subject (e.g., piano, mathematics, language teaching, fitness coaching). As long as you configure the corresponding "System Role" and "Knowledge Base," AI can become your dedicated teaching assistant.

## Core Features

### 1. Silent Voice Monitoring (Rolling Buffer Recording)
- The system continuously records audio in the background but only retains the most recent specific duration (e.g., last 60 seconds, 120 seconds).
- **Advantage**: No need to upload the entire long recording. Only the "current" context is sent to AI for analysis when the teacher needs assistance.

### 2. Highly Customizable AI Persona
- You can edit the `System Role` directly in the frontend interface.
- **Examples**:
    - Piano Teacher: "Please analyze the touch and rhythm issues in the student's Bach performance just now."
    - Math Tutor: "Please identify the logic gaps in the student's solution to the quadratic equation."
- Settings are automatically saved to the browser's `localStorage` and restored upon next visit.

### 3. Localized Knowledge Base (RAG)
- Supports uploading `.txt` or `.md` teaching SOPs.
- File contents are stored locally in the browser, ensuring privacy without the need for a backend database.
- **Context Caching**: When the knowledge base content is long enough, it automatically uses the Gemini Context Caching API to reduce latency and costs.

---

## Project Structure

```
.
├── index.html              # Application Entry Point
├── index.tsx               # React Mount Point
├── App.tsx                 # Main Application Interface (includes Role editing & Knowledge management)
├── services/
│   └── geminiService.ts    # Core Service: Recording control, Rolling Buffer, Gemini API integration
└── components/
    ├── KnowledgePanel.tsx  # Knowledge Base Management Panel
```

## Technical Architecture

- **Frontend**: React 18, Tailwind CSS, Vite
- **AI SDK**: `@google/genai` (Google Gemini API)
- **Persistence**: Browser LocalStorage & IndexedDB (No backend required)

---

## Usage Instructions

### 1. Set API Key (Required)
Since this project is a pure frontend architecture, you need your own Google Gemini API Key.
Please configure the `process.env.API_KEY` in your development environment or in the `.env` file of your build tool (like Vite/Parcel/Webpack).

### 2. Start Recording (Start Live)
- Click the "Start Live" button in the top right corner.
- The browser will request microphone permissions.

### 3. Configure Persona (System Role)
- Click "System Role (AI Persona)" on the left sidebar.
- Enter the role and analysis logic you want the AI to perform.

### 4. Trigger Analysis (Analyze)
- When you need advice during the teaching process, click the large "Analyze Last X mins" button on the left.
- Suggestions will appear immediately in the right panel.

---

## Privacy Policy

- **Audio Data**: Audio fragments from the buffer are sent to the Google server for one-time analysis **only** when the "Analyze" button is clicked.
- **Knowledge Base Data**: Your teaching SOPs and persona settings are stored only in your computer's browser and are not uploaded to any third-party database.
