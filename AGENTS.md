# Project Instructions For Codex

This project is maintained with Codex as the primary coding assistant. Prefer practical, low-risk fixes and keep the user unblocked.

## Default Deployment Rule

- After making code changes, deploy them to the server by default unless the user explicitly says not to deploy.
- If a change is frontend-only, sync the changed frontend files, build on the server, publish `dist`, and reload Nginx.
- If a change includes backend code, sync the changed backend files, compile on the server, and restart the backend service after a successful build.
- Always mention whether deployment succeeded or failed in the final response.

## Server

- SSH host: `myvps`
- Remote project path: `/opt/multi-chat/ai`
- Frontend publish path: `/var/www/multi-chat`
- Backend service: `multi-chat-backend`

## Frontend Deploy

Run from the local repo after syncing changed files to the server:

```powershell
ssh myvps "cd /opt/multi-chat/ai/frontend && export NODE_OPTIONS=--max-old-space-size=1536 && npm run build"
ssh myvps "rsync -a --delete /opt/multi-chat/ai/frontend/dist/ /var/www/multi-chat/ && nginx -t && systemctl reload nginx"
```

## Backend Deploy

Run from the local repo after syncing changed files to the server:

```powershell
ssh myvps "cd /opt/multi-chat/ai/backend && mvn -q -DskipTests compile"
ssh myvps "systemctl restart multi-chat-backend && systemctl is-active multi-chat-backend"
```

## Safety

- Never use destructive git commands such as `git reset --hard` or `git checkout --` unless the user explicitly asks for them.
- Avoid inline remote file rewrites for files containing Chinese text or complex quotes. Prefer `scp`/`rsync` to sync files.
- Before deploying, run the relevant local build when feasible. If skipped, say why.
- The working tree may contain user changes. Do not revert unrelated changes.

## Orientation

- Read `docs/CODEBASE_MAP.md` first when debugging unfamiliar behavior.
- Main frontend page: `frontend/src/views/ChatView.vue`
- Main frontend styles: `frontend/src/views/ChatView.css`
- Frontend chat helpers: `frontend/src/views/chat/`
- Backend provider client: `backend/src/main/java/com/multichat/service/OpenAiCompatClient.java`
- Backend orchestration service: `backend/src/main/java/com/multichat/service/ChatService.java`

