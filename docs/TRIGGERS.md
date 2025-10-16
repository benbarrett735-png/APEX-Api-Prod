# Authentication Triggers

The Cognito post-signup trigger and other auth-related Lambda functions are maintained separately.

**Location:** These will be moved to a dedicated `APEX-Auth-Triggers` repository to keep the API service focused on HTTP endpoints only.

**Current Trigger:**
- `apex-cognito-post-signup` - Handles post-signup user initialization

This separation aligns with Kevin's infrastructure simplification plan (Step 3).

