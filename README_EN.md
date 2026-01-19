# Cursor Conversation History Analyzer

A WebAssembly-based Cursor conversation history analysis tool that uses the Vibe algorithm to perform deep analysis of users' programming conversation styles and generate personalized twelve-personality profiles.

## ✨ Features

### Core Features

1. **Conversation History Analysis**
   - Support uploading Cursor conversation history JSON files
   - Local database analysis using WebAssembly (sql.js)
   - Complete local processing to protect user privacy

2. **Vibe Algorithm Personality Profile**
   - Based on semantic fingerprint recognition rules
   - High-performance matching through Web Workers
   - Deep analysis without Token consumption
   - Generate twelve-personality profiles

3. **Five-Dimensional Analysis**
   - **L (Logic)**: 🧠 Brain Circuit Hardcore Level - Measured by code block ratio
   - **P (Patience)**: 🧘 Cyber Bodhisattva Index - Measured by negation word frequency
   - **D (Detail)**: 🔍 Detail Obsession Level - Measured by average sentence length and modifiers
   - **E (Explore)**: 🚀 Technical Talent Force - Measured by deduplicated technical term statistics
   - **F (Feedback)**: 🤝 Workplace Tea Detection Ranking - Measured by polite expression density

4. **Ranking Statistics**
   - Global horizontal ranking comparison
   - Multi-dimensional ranking indicators (message count, character count, average length, usage days, etc.)
   - Real-time ranking updates

5. **Answer Book**
   - Random prompt generator
   - Support for bilingual (Chinese/English)
   - Based on D1 database storage

6. **Data Visualization**
   - Generate radar charts using Chart.js
   - Support exporting analysis results as images
   - Beautiful UI interface

## 🎯 Pain Points Solved

### 1. Privacy Protection
- **Problem**: Traditional analysis tools require uploading data to servers, posing privacy leak risks
- **Solution**: Complete local processing, all data analyzed in the browser, no server uploads

### 2. Cost Control
- **Problem**: Using AI APIs for text analysis incurs high Token consumption costs
- **Solution**: Rule-based Vibe algorithm, no AI API calls required, zero-cost analysis

### 3. Performance Optimization
- **Problem**: Analyzing large conversation histories blocks the main thread
- **Solution**: Asynchronous analysis using Web Workers to ensure UI smoothness

### 4. Deep Analysis
- **Problem**: Simple keyword statistics cannot reflect real programming styles
- **Solution**: Multi-dimensional analysis based on semantic fingerprints, generating personalized personality profiles

### 5. Data Management
- **Problem**: Large conversation histories are difficult to manage and query
- **Solution**: Efficient querying and statistics using SQLite database (WebAssembly version)

## 🧪 Testing Methods

### Requirements

- Node.js >= 16.0.0
- npm or yarn

### Install Dependencies

```bash
npm install
```

### Development Mode

```bash
npm run dev
```

Visit `http://localhost:3000` to view the application

### Build Production Version

```bash
npm run build
```

Build output will be in the `dist/` directory

### Preview Production Version

```bash
npm run preview
```

### Testing Steps

1. **Prepare Test Data**
   - Export conversation history JSON file from Cursor
   - Ensure JSON format is correct, containing `messages` array

2. **Upload and Analyze**
   - Open the application homepage
   - Click "Upload Conversation History" button
   - Select JSON file
   - Wait for analysis to complete

3. **View Results**
   - View five-dimensional radar chart
   - View personality profile description
   - View statistical data
   - View ranking information

4. **Export Results**
   - Click "Export Image" button
   - Save analysis result as PNG image

### Test Data Format

```json
{
  "messages": [
    {
      "role": "USER",
      "content": "How to implement a quicksort algorithm?"
    },
    {
      "role": "ASSISTANT",
      "content": "Here is a Python implementation of quicksort..."
    }
  ]
}
```

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

## 📄 MIT License

This project is licensed under the MIT License.

```
MIT License

Copyright (c) 2024

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## 🙏 Acknowledgments

### Open Source Projects

- [sql.js](https://github.com/sql-js/sql.js) - SQLite compiled to WebAssembly
- [Vite](https://vitejs.dev/) - Next generation frontend build tool
- [Chart.js](https://www.chartjs.org/) - Powerful charting library
- [html2canvas](https://html2canvas.hertzen.com/) - HTML to Canvas tool

### Tech Stack

- **Frontend Framework**: Vanilla JavaScript (ES6+)
- **Build Tool**: Vite
- **Database**: SQLite (WebAssembly)
- **Chart Library**: Chart.js
- **Styling**: CSS3

### Inspiration

This project is inspired by:
- Cursor editor's conversation history feature
- Various programming style analysis tools
- Personality tests and profile generation algorithms

## 📧 Contact

For questions, suggestions, or feedback, please contact us through:

- **GitHub Issues**: [Submit an Issue](https://github.com/your-username/cursor-lab/issues)
- **Email**: your-email@example.com

---

**Note**: This project is for learning and research purposes only. Analysis results are for reference only and do not constitute any professional advice.
