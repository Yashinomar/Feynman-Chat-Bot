# TeachBack AI

TeachBack AI (formerly Feynman AI) is a Next.js web application designed to help you master concepts by teaching them. It acts as a curious student, letting you explain topics in your own words. It then assesses your understanding, asks questions, and calculates a Mastery Score.

## Tech Stack
- Frontend & API: **Next.js** (React)
- Styling: **CSS Modules**
- AI Model Integration: **GPT4All** (Local AI API)

---

## Prerequisites (What you need to run this)

Unlike Python projects that use a `requirements.txt`, Node.js projects use a `package.json` file to manage dependencies. 

To run this on an entirely new computer, you will need:

1. **Node.js**: You need to have Node.js installed (version 18+ is recommended). You can download it from [nodejs.org](https://nodejs.org/). This will also install `npm` (Node Package Manager).
2. **GPT4All App (Local AI)**: Since this application is set up to run **fully offline** using a local AI model, you need to have GPT4All installed and running on your machine.
   - Download GPT4All from [gpt4all.io](https://gpt4all.io/).
   - Open GPT4All, go to Settings -> Server, and **Enable API Server**.
   - Make sure you have downloaded a model in GPT4All (e.g., `Meta-Llama-3-8B-Instruct`).

## Setup Instructions

1. **Clone the repository and navigate into the project:**
   ```bash
   git clone https://github.com/Yashinomar/Feynman-Chat-Bot.git
   cd Feynman-Chat-Bot
   ```

2. **Install the dependencies:**
   Instead of `pip install -r requirements.txt`, you run:
   ```bash
   npm install
   ```
   This will read the `package.json` file and download all necessary packages into a `node_modules` folder.

3. **Set up Environment Variables:**
   Create a `.env.local` file in the root directory (if it isn't there already), and specify the exact model name you downloaded in GPT4All:
   ```env
   LOCAL_MODEL_NAME="Meta-Llama-3-8B-Instruct.Q4_0.gguf"
   # Or whichever exact model file name you are using in GPT4All
   ```

4. **Run the Application:**
   Start the local development server:
   ```bash
   npm run dev
   ```

5. **Open the App:**
   Open your browser and navigate to [http://localhost:3000](http://localhost:3000) to start using TeachBack AI!
