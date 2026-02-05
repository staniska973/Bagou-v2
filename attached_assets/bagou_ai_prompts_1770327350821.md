Build a mobile app (React Native Expo + TypeScript) named Bagou.
Use the provided files:
- bagou_models_and_content.json (schemas + example content)
- bagou_ai_prompts.md (AI prompts)

Features:
1) Onboarding creates UserProfile (language, objectives, tone, risk, register, limits, mode).
2) Daily Session default 12 minutes:
   A) Flashcards (active recall): show due cards (SRS), require user to type OR record before reveal.
      - Call AI Prompt #1 to generate profiled model answers/variants.
      - Call AI Prompt #2 to score user's answer, then show oneFix + redoPrompt, enforce one redo.
      - Save rating hard/medium/easy and update SRS.
   B) Roleplay 5 minutes:
      - Select scenario linked to weakest cards or today's theme.
      - Multi-turn chat. Each user message calls AI Prompt #3 and updates history.
      - Stop when AI returns stop=true or max turns.
   C) Debrief:
      - Call AI Prompt #4 with transcript; display 2 strengths + 1 key improvement + optimized rewrite + redo prompt.
3) SRS Scheduling:
   - hard => interval=1 day, ease-=0.2, lapses+1, due tomorrow
   - medium => interval=max(2, round(interval*1.8))
   - easy => interval=round(interval*2.5), ease+=0.1
   - If lapses>=2 on a card, mark it priority and ensure next roleplay is related before it can be rated easy again.
4) Modes:
   - Text mode works end-to-end.
   - Voice mode MVP: record audio, transcribe (STT), treat as userMessage text, coach as usual; AI responses can be text for MVP.
5) Storage:
   - Use Supabase (Postgres + Auth) or local SQLite for MVP; must store profile, cards SRS state, sessions, transcripts.

Implement clean UI: Home -> Start Session -> Flashcards -> Roleplay -> Debrief -> Stats.
Follow the JSON contracts strictly (AI returns JSON only).
