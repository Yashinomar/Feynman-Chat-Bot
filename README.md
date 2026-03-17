# TeachBack AI

TeachBack AI is a Next.js web application designed to help you master concepts by teaching them. It acts as a curious student, letting you explain topics in your own words. It then assesses your understanding, asks questions, and calculates a Mastery Score.

## Tech Stack
- Frontend & API: **Next.js** (React)
- Styling: **CSS Modules**
- AI Model Integration: **Google Gemini API** (gemini-2.5-flash)

---

## Prerequisites (What you need to run this)


To run this on an entirely new computer, you will need:

1. **Node.js**: You need to have Node.js installed (version 18+ is recommended). You can download it from [nodejs.org](https://nodejs.org/). This will also install `npm` (Node Package Manager).
2. **Google Gemini API Key**: The application runs its AI pipelines entirely through the Google Gemini API. You will need a developer API key.
   - You can get a free API key from [Google AI Studio](https://aistudio.google.com/).

## Setup Instructions

1. **Clone the repository and navigate into the project:**
   ```bash
   git clone https://github.com/Yashinomar/Feynman-Chat-Bot.git
   cd Feynman-Chat-Bot
   ```

2. **Install the dependencies:**
   Install npm on your computer:
   ```bash
   npm install
   ```
   This will read the `package.json` file and download all necessary packages into a `node_modules` folder.

3. **Set up Environment Variables:**
   Create a `.env.local` file in the root directory and specify your Gemini API Key:
   ```env
   GEMINI_API_KEY="AIzaSy...your-actual-key-here..."
   ```

4. **Run the Application:**
   Start the local development server:
   ```bash
   npm run dev
   ```

5. **Open the App:**
   Open your browser and navigate to [http://localhost:3000](http://localhost:3000) to start using TeachBack AI!
