# Cursor AI Scope Guardrails

**DO NOT DELETE:**
- `src/routes/**` - Business logic routes
- `src/services/**` - Core services
- `src/db/**` - Database layer
- `src/lib/**` - Shared libraries
- `migrations/**` - Database migrations

**SAFE TO MODIFY:**
- `src/index.ts` - Main server entry
- `src/middleware/**` - Auth and request middleware
- `Dockerfile` - Container configuration
- `tsconfig.json` - TypeScript compiler config
- `package.json` - Dependencies (with care)
- `docs/**` - Documentation

**RULES:**
1. Never delete business logic to fix TypeScript errors - fix the errors instead
2. Use `tsconfig.json` exclude to temporarily skip compilation if needed
3. Migrations are immutable - never delete, only add new ones
4. Routes and services will be re-enabled incrementally per Kevin's plan
5. All infrastructure changes must align with `.context/` documentation

**Current Phase:** Step 3 - API skeleton with auth middleware
**Next Phase:** Step 4 - App Runner deployment

