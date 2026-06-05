# Tech Stack

- **Framework**: Next.js 16 (App Router, Turbopack dev) + React 19
- **Language**: TypeScript (strict). Path alias `@/*` → `./src/*`
- **DB**: PostgreSQL + Prisma ORM (`@prisma/client`, `pg`). Singleton at `src/lib/db.ts`
- **Package manager**: **npm only**. `package-lock.json` is the single source of truth — never commit `pnpm-lock.yaml`/`yarn.lock`
- **Editor**: TipTap (starter-kit, placeholder, character-count)
- **Animation/particles**: framer-motion v12, @tsparticles, simplex-noise, perfect-freehand (doodles)
- **State**: Zustand (persisted)
- **Payments**: Dodo Payments (`dodopayments`) = active MoR. Stripe/Lemon Squeezy deps present but legacy/unused
- **Email**: Resend. **Auth**: jose (dev JWT) + Supabase (`@supabase/ssr`, `@supabase/supabase-js`)
- **Crypto**: Web Crypto AES-256-GCM; tweetnacl, hash-wasm
- **Images**: sharp, html2canvas-pro, html-to-image. Storage adapter selected by `PHOTO_STORAGE` (local Postgres blob | supabase bucket)
- **Tests**: Vitest (but project convention is to skip formal tests — see `mem:conventions`)
- **Desktop**: Tauri (`desktop:dev`/`desktop:build`)
- **Deploy**: Vercel (npm)
