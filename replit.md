# Bagou - Communication Coach App

## Overview

Bagou is a daily communication reflex coach that trains assertiveness and verbal fluency through active recall flashcards and AI-powered roleplay scenarios. The application uses a spaced repetition system (SRS) to optimize learning, requiring users to write or speak their responses before seeing model answers.

**Core Features:**
- Fully French app (UI, prompts, coaching style — direct/provocateur)
- Mini-dialogue session flow: 3-turn chat per card situation (configurable 2–5 by admin)
- AI plays dual role per turn: Interlocutor (realistic) + Coach Bagou (whisper advice)
- Final turn generates: model answer, 3 variants (safe/medium/bold), evaluation, feedback
- Manual SRS rating after each dialogue: Difficile / Moyen / Maîtrisé
- SRS scheduling (Anki-style SM-2 algorithm) for optimal card review timing
- Admin panel: card editing, AI model selection, dialogue turn count, subscription management
- User profile customization (tone, risk level, communication preferences)

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript, built using Vite
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: Zustand with persistence middleware for global app state
- **Data Fetching**: TanStack React Query for server state and caching
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with custom theme supporting light/dark modes
- **Animations**: Framer Motion for page transitions and micro-interactions

**Key Design Decisions:**
- Component aliases configured via `@/` path mapping for clean imports
- Theme provider supports system preference detection with manual override
- Internationalization built into store for seamless language switching

### Backend Architecture
- **Framework**: Express 5 running on Node.js with TypeScript
- **Build System**: esbuild for server bundling, Vite for client
- **API Pattern**: RESTful JSON APIs under `/api/` prefix
- **Development**: Hot module replacement via Vite middleware integration

**Key Design Decisions:**
- Single entry point (`server/index.ts`) with modular route registration
- Static file serving handled separately for production builds
- Request logging with duration tracking for API endpoints

### Data Storage
- **Database**: PostgreSQL via Drizzle ORM
- **Session Storage**: connect-pg-simple for Express sessions
- **Schema Location**: `shared/schema.ts` for shared type definitions between client/server
- **Migrations**: Drizzle Kit with `db:push` command for schema sync

**Core Tables:**
- `user_profiles` - User preferences, settings, and streak tracking
- `mother_cards` - Flashcard archetypes with situation/goal/constraints
- `srs_states` - Per-user card review states (interval, ease, lapses)
- `scenarios` - Roleplay scenarios linked to themes
- `sessions` / `session_events` - Training session history and events

### AI Integration
- **Provider**: OpenAI API via Replit AI Integrations
- **Features**: Text completions for answer generation, scoring, roleplay turns, and debriefs
- **Voice Support**: Speech-to-text transcription, text-to-speech synthesis
- **Audio Processing**: AudioWorklet for real-time streaming playback

**AI Prompt System:**
1. Flashcard Model Answer Generator - Creates profiled answers with variants
2. Flashcard Scoring - Evaluates user responses with feedback
3. Roleplay Turn Generator - Maintains conversational roleplay
4. Debrief Generator - Synthesizes session performance insights

### SRS Algorithm
Implements Anki-style SM-2 spaced repetition:
- **Hard**: Reset interval to 1 day, decrease ease, increment lapses
- **Medium**: Multiply interval by ease factor (~1.8x)
- **Easy**: Multiply interval by 2.5x, increase ease
- Cards with 2+ lapses marked as priority for targeted practice

## Admin Panel Authentication

The admin panel (`/admin`) uses a **separate session-based authentication** completely independent from Replit OAuth:
- Login: `POST /api/admin/login` with `ADMIN_USERNAME` + `ADMIN_PASSWORD` env vars
- Logout: `POST /api/admin/logout`
- Session check: `GET /api/admin/check`
- All admin API routes protected by `isAdminSession` middleware (not `isAuthenticated`)
- Admin credentials configured via `ADMIN_USERNAME` and `ADMIN_PASSWORD` env vars

### Card Generation Preview

Admin GenerateTab now supports a preview-before-save workflow:
- `POST /api/admin/preview-cards` — generates cards (via AI) without saving to DB
- `POST /api/admin/bulk-save-cards` — saves pre-generated preview cards to DB
- Count selector: 10 / 20 / 30 / 40 / 50 cards
- New subtheme form for creating cards with custom theme/subtheme config
- `generateCardsForPreview()` exported from `server/seed-cards.ts`

## External Dependencies

### Database
- **PostgreSQL**: Primary data store via `DATABASE_URL` environment variable
- **Drizzle ORM**: Type-safe database queries and schema management

### AI Services
- **OpenAI API**: Via Replit AI Integrations
  - Environment: `AI_INTEGRATIONS_OPENAI_API_KEY`, `AI_INTEGRATIONS_OPENAI_BASE_URL`
  - Models: GPT for text, Whisper for STT, TTS for speech synthesis

### Audio Processing
- **FFmpeg**: Required for audio format conversion (WebM/MP4 → WAV)
- **Web Audio API**: Client-side audio playback via AudioWorklet

### Key npm Packages
- `express` - Web server framework
- `drizzle-orm` / `drizzle-kit` - Database ORM and migrations
- `openai` - AI API client
- `zustand` - Client state management
- `@tanstack/react-query` - Server state management
- `framer-motion` - Animations
- `zod` - Runtime validation for API contracts