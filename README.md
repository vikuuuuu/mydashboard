# File Dashboard (Firebase Auth)

A responsive Next.js dashboard where users must login first, then access file tools from the Dashboard Home card.

## Features

- Firebase email/password login
- Protected dashboard route (`/`) for logged-in users only
- File Management tools:
  - Image to PDF
  - PDF to Image (first page)
  - Video to Image (frame capture)
  - Image resize
  - PDF resize (first page)
  - Image format convert (JPG/JPEG/PNG)
- Responsive layout for desktop, laptop, tablet, and phone

## Setup

1. Install dependencies:

```bash
npm install
```

2. Add environment variable in `.env.local`:

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_web_api_key
```

3. Run dev server:

```bash
npm run dev
```

Open http://localhost:3000.
