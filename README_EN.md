# Cursor Conversation History Analyzer
<img width="1048" height="842" alt="image" src="https://github.com/user-attachments/assets/9ce31eb7-701b-49ec-a711-7764bd5dcf8c" />

<div align="center">

### Make Your Cursor Conversations Truly Analyzed ✨

Analyze your programming conversation style with the Vibe algorithm and discover your personalized twelve-personality profile.  
**It's the missing power-up for Cursor users.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen)](https://nodejs.org/)
[![Vite](https://img.shields.io/badge/Vite-5.0-646CFF?logo=vite)](https://vitejs.dev/)

English | [简体中文](./README.md)

</div>

---

## 👋 Why Cursor Conversation History Analyzer?

We love Cursor, but sometimes we wish we could understand our programming conversation patterns better.

That's why we built **Cursor Conversation History Analyzer**. It's not just a tool; it's a companion that helps you discover your coding personality, analyze your conversation style, and understand how you interact with AI assistants. Whether you're a developer curious about your coding habits, a researcher studying programming patterns, or just someone who loves data insights, this tool is designed for you.

**All analysis happens locally in your browser** - your data never leaves your device, ensuring complete privacy and security.

---

## 📚 Table of Contents

* [Why Cursor Conversation History Analyzer?](#-why-cursor-conversation-history-analyzer)
* [Features](#-features)
* [Quick Start](#-quick-start)
* [User Guide](#-user-guide)
* [Deployment Guide](#-deployment-guide)
* [Technical Architecture](#️-technical-architecture)
* [Algorithm Explanation](#-algorithm-explanation)
* [FAQ](#-faq)
* [Contributing](#-contributing)
* [License](#-license)

## ✨ Features

### 🔍 Conversation History Analysis

**Understand your coding conversations.** Upload your Cursor conversation history and get deep insights into your programming style.

* **Privacy-first**: All analysis happens locally in your browser using WebAssembly
* **Zero cost**: No AI API calls, no token consumption - completely free
* **Fast processing**: Analyze thousands of messages in seconds
* **Multiple formats**: Support for JSON conversation exports

### 🎭 Vibe Algorithm Personality Profile

**Discover your coding personality.** Our unique Vibe algorithm analyzes your conversation patterns to generate a personalized twelve-personality profile.

* **Semantic fingerprinting**: Advanced pattern recognition based on semantic analysis
* **Web Worker powered**: High-performance analysis without blocking your browser
* **Twelve personalities**: From "Code Wizard" to "Detail Perfectionist" - find your type
* **Personalized insights**: Get custom descriptions based on your actual conversation style

### 📊 Five-Dimensional Analysis

**See yourself in five dimensions.** Our LPDEF model measures different aspects of your programming communication:

* **🧠 L (Logic)**: Brain Circuit Hardcore Level - How much code vs. text in your conversations
* **🧘 P (Patience)**: Cyber Bodhisattva Index - Your tolerance level based on negation patterns
* **🔍 D (Detail)**: Detail Obsession Level - How thorough and detailed your requests are
* **🚀 E (Explore)**: Technical Talent Force - Your breadth of technical knowledge
* **🤝 F (Feedback)**: Workplace Communication Style - Your politeness and feedback patterns

### 📈 Ranking Statistics

**See how you compare.** (Optional, requires backend)

* **Global comparison**: See your ranking among all users
* **Multi-dimensional metrics**: Compare across message count, character count, usage days, and more
* **Real-time updates**: Rankings update as more users join

### 💡 Answer Book

**Get inspired.** (Optional, requires backend)

* **Random prompts**: Discover new ways to interact with AI
* **Bilingual support**: Prompts in both Chinese and English
* **Cloud storage**: Powered by Cloudflare D1 database

### 📊 Data Visualization

**Visualize your insights.**

* **Radar charts**: Beautiful five-dimensional visualization using Chart.js
* **Export to image**: Save and share your personality profile as PNG
* **Modern UI**: Clean, intuitive interface designed for clarity

## 🎯 What Problems Does This Solve?

### 🔒 Privacy Protection
**Problem**: Most analysis tools require uploading your data to servers, creating privacy risks.  
**Solution**: Everything runs locally in your browser. Your conversations never leave your device.

### 💰 Cost Control
**Problem**: Using AI APIs for analysis can cost hundreds of dollars in token fees.  
**Solution**: Our rule-based Vibe algorithm requires zero API calls - completely free analysis.

### ⚡ Performance
**Problem**: Analyzing large conversation histories can freeze your browser.  
**Solution**: Web Workers handle all heavy computation asynchronously, keeping your UI smooth.

### 🧠 Deep Insights
**Problem**: Simple keyword counting doesn't reveal your true programming style.  
**Solution**: Multi-dimensional semantic analysis generates meaningful personality insights.

### 📦 Data Management
**Problem**: Large conversation histories are hard to search and analyze.  
**Solution**: WebAssembly SQLite enables fast, efficient queries and statistics.

## 🚀 Quick Start

### 📥 Installation

#### Prerequisites

**Development Environment:**
- Node.js >= 16.0.0
- npm >= 7.0.0 or yarn >= 1.22.0

**Browser Requirements:**
- Chrome/Edge >= 90
- Firefox >= 88
- Safari >= 14
- Opera >= 76

*Requires: WebAssembly, Web Workers, ES6+, File API, Fetch API*

#### Install Dependencies

```bash
# Using npm
npm install

# Or using yarn
yarn install
```

### 🛠️ Development

```bash
# Start development server
npm run dev
# or
yarn dev

# Windows users can also use
start.bat

# macOS/Linux users can also use
./start.sh
```

The development server will start at `http://localhost:3000` and automatically open in your browser.

### 📦 Build for Production

```bash
# Build production version
npm run build
# or
yarn build
```

Build output will be in the `dist/` directory, ready to deploy to any static hosting service.

### 👀 Preview Production Build

```bash
# Preview production build locally
npm run preview
# or
yarn preview
```

### Project Structure

```
cursor-lab/
├── src/                          # Source code
│   ├── index.js                 # Cloudflare Worker backend
│   ├── CursorParser.js          # Database parser
│   ├── VibeCodingerAnalyzer.js  # Vibe algorithm analyzer
│   ├── vibeAnalyzerWorker.js    # Web Worker script
│   ├── i18n.js                  # i18n config
│   └── *.json                   # Data files
├── dist/                        # Build output
├── index.html                   # Frontend entry
├── main.js                      # Main logic
├── style.css                    # Styles
├── vite.config.js               # Vite config
├── wrangler.toml                # Workers config
├── package.json                 # Dependencies
├── start.bat / start.sh         # Startup scripts
└── README.md                    # Documentation
```

## 📖 User Guide

### Getting Started

#### Step 1: Export Your Conversation History

1. Open Cursor editor
2. Navigate to Settings
3. Find "Export Conversation History" option
4. Export as JSON format

#### Step 2: Upload and Analyze

1. Open the application in your browser
2. Click "Upload Conversation History" button (MacOS user: After copying the path, first open Finder → Go → Go to Folder → paste the path → drag the workspaceStorage folder to the sidebar, then click the upload button.)
<img width="409" height="309" alt="截屏2026-01-21 23 31 20" src="https://github.com/user-attachments/assets/e91993be-04e5-4443-abeb-2d71c3af9b0f" />

3. Select your exported JSON file
4. Wait for analysis to complete (runs asynchronously, won't freeze your browser)

#### Step 3: Explore Your Results

* **📊 Radar Chart**: See your five-dimensional profile visualized
* **🎭 Personality Profile**: Read your personalized personality description
* **📈 Statistics**: View detailed metrics (messages, characters, usage days, etc.)
* **🏆 Rankings**: See how you compare (requires backend setup)

#### Step 4: Share Your Results

Click "Export Image" to save your personality profile as a PNG image for sharing on social media or with friends!

### Data Format

Your Cursor conversation history should be exported as JSON with the following structure:

```json
{
  "messages": [
    {
      "role": "USER",
      "content": "How to implement a quicksort algorithm?"
    },
    {
      "role": "ASSISTANT",
      "content": "Here is a Python implementation of quicksort:\n\n```python\ndef quicksort(arr):\n    ...\n```"
    }
  ]
}
```

**Required Fields:**
* `messages`: Array of message objects (required)
* `role`: Message role - `"USER"` or `"ASSISTANT"` (required)
* `content`: Message content text (required)

### Optional Features Setup

#### Ranking Statistics (Backend Required)

To enable ranking statistics and compare yourself with other users:

1. **Deploy Cloudflare Worker**
   ```bash
   npm install -g wrangler
   wrangler login
   wrangler deploy
   ```

2. **Configure Environment Variables**
   * Set `SUPABASE_URL` and `SUPABASE_KEY` in Cloudflare Dashboard
   * Create D1 database `prompts_library` for Answer Book

3. **Setup Supabase**
   * Create `cursor_stats` table for user statistics
   * Configure RLS policies (optional)

#### Answer Book (Backend Required)

The Answer Book feature provides random prompts and requires Cloudflare D1 database. Follow the same setup steps as Ranking Statistics.

## 🔧 Deployment

### Frontend Deployment

The frontend is a static site that can be deployed to any hosting service.

#### GitHub Pages

1. Build: `npm run build`
2. Configure `base` in `vite.config.js`: `base: '/your-repo-name/'`
3. Deploy `dist/` to `gh-pages` branch

#### Vercel / Netlify

1. Connect your GitHub repository
2. Build command: `npm run build`
3. Output directory: `dist`
4. Deploy automatically

#### Cloudflare Pages

1. Connect GitHub repository
2. Build command: `npm run build`
3. Output directory: `dist`
4. No environment variables needed (fully local)

### Backend Deployment (Optional)

For ranking statistics and Answer Book features:

```bash
npm install
# Configure wrangler.toml with D1 and Supabase settings
wrangler deploy
```

See `wrangler.toml` comments for detailed configuration.

## 🏗️ Technical Architecture

### Frontend Architecture

```
┌─────────────────────────────────────────┐
│        User Interface (index.html)      │
│  ┌───────────────────────────────────┐ │
│  │      Main Logic (main.js)          │ │
│  │  - File upload handling           │ │
│  │  - UI updates                      │ │
│  │  - Result display                  │ │
│  └──────────┬────────────────────────┘ │
│             │                          │
│  ┌──────────▼────────────────────────┐ │
│  │  Web Worker (vibeAnalyzerWorker) │ │
│  │  - Asynchronous analysis          │ │
│  │  - Non-blocking main thread       │ │
│  └──────────┬────────────────────────┘ │
│             │                          │
│  ┌──────────▼────────────────────────┐ │
│  │  Vibe Algorithm Analyzer          │ │
│  │  - Semantic fingerprint extraction│ │
│  │  - Five-dimensional calculation   │ │
│  │  - Personality profile generation │ │
│  └───────────────────────────────────┘ │
│                                        │
│  ┌───────────────────────────────────┐ │
│  │  SQLite (WebAssembly)             │ │
│  │  - Local database queries         │ │
│  │  - Data statistics analysis       │ │
│  └───────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

### Backend Architecture (Optional)

```
┌─────────────────────────────────────────┐
│      Cloudflare Workers                 │
│  ┌───────────────────────────────────┐ │
│  │  API Route Handler                 │ │
│  │  - /api/random_prompt (Answer Book)│ │
│  │  - /api/stats (Ranking Statistics)│ │
│  └──────────┬────────────────────────┘ │
│             │                          │
│  ┌──────────▼────────────────────────┐ │
│  │  Cloudflare D1                   │ │
│  │  - prompts_library (Answer Book) │ │
│  └───────────────────────────────────┘ │
│             │                          │
│  ┌──────────▼────────────────────────┐ │
│  │  Supabase                         │ │
│  │  - cursor_stats (User Statistics) │ │
│  └───────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

### Performance Optimization

1. **Web Worker Asynchronous Processing**
   - All compute-intensive tasks execute in Worker
   - Main thread remains responsive, UI doesn't freeze

2. **WebAssembly Database**
   - Use sql.js for efficient local database operations
   - Support complex SQL queries and statistical analysis

3. **Lazy Loading and Code Splitting**
   - Chart.js and html2canvas loaded on-demand via CDN
   - Reduce initial bundle size

4. **Memory Optimization**
   - Timely release of unused objects
   - Avoid memory leaks

## 🔬 Algorithm Explanation

### Vibe Algorithm v2.0

The Vibe algorithm is a multi-dimensional analysis algorithm based on semantic fingerprint recognition. It analyzes users' programming conversation styles to generate personalized personality profiles.

#### Algorithm Flow

1. **Data Preprocessing**
   - Extract user messages (role === 'USER')
   - Filter empty messages and invalid data
   - Calculate basic metrics (message count, character count, average length, etc.)

2. **Semantic Fingerprint Extraction**
   - **Code Block Recognition**: Identify code block ratio (Logic dimension)
   - **Negation Word Statistics**: Count negation word frequency (Patience dimension)
   - **Sentence Length Analysis**: Calculate average sentence length and modifier density (Detail dimension)
   - **Technical Term Extraction**: Identify and deduplicate technical terms (Explore dimension)
   - **Polite Expression Detection**: Count polite expression density (Feedback dimension)

3. **Dimension Score Calculation**
   - Use regular expressions to match semantic patterns
   - Apply semantic weight matrix
   - Calculate combo bonus (consecutive matches get bonus points)
   - TF-IDF downweighting (high-frequency words get reduced weight)
   - Density window confidence coefficient
   - Ranking tier normalization

4. **Personality Profile Generation**
   - Generate Vibe Index (5-digit index) based on five-dimensional scores
   - Match corresponding personality type and name
   - Generate personalized roast text
   - Generate LPDEF encoding

#### Technical Implementation

- **Web Worker**: Asynchronous calculation, doesn't block main thread
- **Regular Expressions**: Efficient pattern matching
- **Semantic Weight Matrix**: Weight distribution for different tech stacks and concepts
- **Normalization Algorithm**: Ensure scores are within reasonable range (10-95)

#### Dimension Weight Explanation

- **Logic (L)**: Code block ratio weight 1.0, code keyword weight 0.5
- **Patience (P)**: Negation word weight -1.0 (higher frequency = lower patience)
- **Detail (D)**: Sentence length weight 0.3, modifier weight 0.7
- **Explore (E)**: Technical term weight 1.0, different tech stacks have different weights
- **Feedback (F)**: Polite expression weight 1.0

### Ranking Algorithm

The ranking algorithm sorts based on multiple indicators:

- `qingCount`: Request count
- `buCount`: Negation word count
- `userMessages`: User message count
- `totalUserChars`: Total user character count
- `avgUserMessageLength`: Average message length
- `usageDays`: Usage days

Ranking calculation logic:
1. Sort by indicator value in descending order
2. Find user's position in current indicator
3. Handle same-value rankings (same values get highest rank)
4. Return rank and total user count

## ❓ FAQ

### How long does analysis take?

Analysis time depends on your conversation history size:
* **100 messages**: < 1 second
* **1,000 messages**: 1-3 seconds  
* **10,000 messages**: 5-10 seconds

Everything runs locally - no server uploads, no waiting for API responses.

### Which browsers are supported?

Works on all modern browsers:
* Chrome/Edge 90+
* Firefox 88+
* Safari 14+
* Opera 76+

Requires WebAssembly, Web Workers, and ES6+ support (all modern browsers have this).

### Is my data uploaded to the server?

**No!** All analysis happens locally in your browser. Your conversations never leave your device.

The only exception: if you enable ranking statistics (optional), anonymous aggregated stats are uploaded - but never your actual conversation content.

### How do I export my Cursor conversation history?

1. Open Cursor editor
2. Go to Settings
3. Find "Export Conversation History"
4. Export as JSON format

### Do I need to set up a backend?

**No!** The core analysis features work completely offline. Backend is only needed for:
* Ranking statistics (compare with other users)
* Answer Book (random prompt generator)

You can use all other features without any backend setup.

### How accurate are the personality profiles?

The Vibe algorithm uses semantic fingerprinting to analyze your conversation patterns. Results are based on statistical analysis of your actual conversations, but should be taken as fun insights rather than scientific personality assessments. For entertainment and self-reflection purposes! 😊

## 🤝 Contributing

We welcome contributions! Whether you want to report bugs, suggest features, improve documentation, or submit code:

### How to Contribute

1. **Fork the repository**
2. **Create a feature branch** (`git checkout -b feature/AmazingFeature`)
3. **Commit your changes** (`git commit -m 'Add some AmazingFeature'`)
4. **Push to the branch** (`git push origin feature/AmazingFeature`)
5. **Open a Pull Request**

### Development Guidelines

* Follow existing code style
* Add necessary comments and documentation
* Ensure code passes tests
* Use clear commit messages in English or Chinese

### Reporting Issues

When reporting issues in [GitHub Issues](https://github.com/your-username/cursor-lab/issues), please include:

* Problem description
* Steps to reproduce
* Expected behavior
* Actual behavior
* Browser and operating system information

Thank you for helping make this project better! ❤️

## 📄 License

MIT License © 2024

See [LICENSE](./LICENSE) file for details.

## 🙏 Acknowledgments

### Open Source Projects

This project wouldn't be possible without these amazing open source tools:

* [sql.js](https://github.com/sql-js/sql.js) - SQLite compiled to WebAssembly
* [Vite](https://vitejs.dev/) - Next generation frontend build tool
* [Chart.js](https://www.chartjs.org/) - Powerful charting library
* [html2canvas](https://html2canvas.hertzen.com/) - HTML to Canvas tool

### Tech Stack

**Frontend:**
* Vanilla JavaScript (ES6+)
* Vite 5.0
* SQLite (WebAssembly via sql.js)
* Chart.js 4.5+
* html2canvas
* CSS3

**Backend (Optional):**
* Cloudflare Workers
* Cloudflare D1 (Answer Book)
* Supabase (Ranking Statistics)
* Wrangler

**Core Algorithms:**
* Vibe Algorithm - Multi-dimensional semantic fingerprint analysis
* Web Workers - Asynchronous computation
* Regular Expressions - Pattern matching

### Inspiration

Inspired by:
* Cursor editor's conversation history feature
* Programming style analysis tools
* Personality tests and profile generation algorithms

## 📝 Changelog

### v1.0.0 (2024)

* ✨ Initial release
* ✨ Support for Cursor conversation history JSON file analysis
* ✨ Implemented Vibe Algorithm v2.0
* ✨ Five-dimensional analysis (LPDEF)
* ✨ Twelve-personality profile generation
* ✨ Local WebAssembly database analysis
* ✨ Data visualization (radar chart)
* ✨ Image export functionality
* ✨ Ranking statistics feature (requires backend)
* ✨ Answer Book feature (requires backend)

## 📧 Contact & Support

For questions, suggestions, or feedback:

* **GitHub Issues**: [Submit an Issue](https://github.com/your-username/cursor-lab/issues)
* **Discussions**: [GitHub Discussions](https://github.com/your-username/cursor-lab/discussions)

## ⚠️ Disclaimer

This project is for learning and research purposes only. Analysis results are for reference and entertainment only and do not constitute any professional advice. Users are responsible for any consequences arising from the use of this tool.

---

<div align="center">

**If this project helps you, please give it a ⭐ Star!**

Made with ❤️ by the community

</div>
