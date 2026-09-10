# Archivist.io - Automated Scraping Engine & Archiver

Archivist.io is a full-stack automated scraping engine designed to bypass strict authenticated portals (like university LMS systems e.g., eFundi, Sakai) and archive their contents. 

It crawls directories, extracts files, automatically downloads them using your authenticated session, and uploads them to Firebase Cloud Storage. This generates secure, long-lived public links so that anyone can download the archived materials without needing to log in to the original restricted portal.

## Features

- **Authenticated Scraping**: Supply your browser's Request Headers (Cookies, User-Agent) to scrape behind login walls.
- **Auto-Downloading Engine**: Automatically fetches binary files (PDFs, docs) during the scrape process using a header-scrubbing engine to bypass strict CORS and domain restrictions.
- **Cloud Storage Archival**: Uploads scraped files directly to Firebase Cloud Storage, replacing restricted LMS URLs with long-lived Cloud Signed URLs.
- **Duplicate Prevention**: Checks the database to prevent duplicate scraping of identical URLs or Custom Names.
- **Clean UI**: Minimalist, responsive dashboard built with React and Tailwind CSS.

## Tech Stack

- **Frontend**: React 18, Vite, Tailwind CSS, Lucide Icons
- **Backend**: Node.js, Express, Axios, Cheerio
- **Database & Storage**: Firebase Firestore, Firebase Cloud Storage (Admin SDK)
- **Deployment**: Configured for deployment on Render

## Environment Variables

To run this project, you will need to add the following environment variables to your `.env` file or your hosting provider (e.g., Render):

`FIREBASE_SERVICE_ACCOUNT`
Your Firebase Service Account JSON credentials. (Can be standard JSON format or Base64 encoded).

`FIREBASE_STORAGE_BUCKET`
The exact name of your Firebase Storage bucket (e.g., `your-project-id.appspot.com` or `your-project-id.firebasestorage.app`).

## Usage Guide: Getting Authentication Headers

To scrape strict portals, you must provide your active session credentials:

1. Log in to the target portal in your web browser.
2. Press `F12` to open Developer Tools and go to the **Network** tab.
3. Refresh the page.
4. Click the very first request at the top of the list (usually the main HTML document).
5. Scroll down to **Request Headers**.
6. Copy your `Cookie` and `User-Agent`.
7. Paste them into the Archivist dashboard Auth field in the following JSON format:

```json
{
  "Cookie": "your_cookie_string_here",
  "User-Agent": "your_user_agent_string_here"
}
```

## Local Development Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```

## Production Build

To build the application for production:

```bash
npm run build
```
This will compile the React frontend and bundle the Express backend into `dist/server.cjs`. You can then start the server using:

```bash
npm start
```
