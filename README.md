# QueueFlow — Queue Management Application

A full-stack queue management app built with React, Vite, Express and SQLite.

## Features
- Manager registration and login (passwords hashed with bcrypt, JWT authentication)
- Create and delete named queues
- Add people and automatically generate sequential token numbers
- Live waiting list with search
- Move waiting tokens up/down
- Call the first waiting token with one click
- Complete the currently served token or cancel a token
- Analytics for waiting, serving, completed, average wait time and 7-day token creation trend
- Responsive dashboard UI with automatic refresh every 12 seconds

## Requirements
- Node.js 18 or newer
- npm

## Run locally
1. Extract the project ZIP.
2. Open the project folder in a terminal.
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start the app:
   ```bash
   npm run dev
   ```
5. Open http://localhost:5173
6. Create a manager account and start creating queues.

The Express API runs on http://localhost:5000. SQLite creates `server/queueflow.db` automatically.

## Production build
```bash
npm run build
npm start
```
Then open http://localhost:5000.

## API overview
| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/auth/register` | Create manager account |
| POST | `/api/auth/login` | Login |
| GET | `/api/queues` | List manager queues |
| POST | `/api/queues` | Create queue |
| DELETE | `/api/queues/:id` | Delete queue |
| GET | `/api/queues/:id/tokens` | List tokens |
| POST | `/api/queues/:id/tokens` | Add person / generate token |
| PATCH | `/api/tokens/:id/move` | Move waiting token up/down |
| POST | `/api/queues/:id/serve-next` | Call next waiting token |
| POST | `/api/tokens/:id/complete` | Complete service |
| POST | `/api/tokens/:id/cancel` | Cancel token |
| GET | `/api/analytics` | Dashboard analytics |

## GitHub submission
Create a new empty GitHub repository, then from this project folder run:
```bash
git init
git add .
git commit -m "Build QueueFlow queue management application"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/queueflow.git
git push -u origin main
```

## Notes before deployment
- Set a strong `JWT_SECRET` environment variable before deploying.
- The included SQLite database is suitable for a demo or small single-instance deployment. For a multi-instance production deployment, use a managed database.
- Average wait time is calculated as the time between token creation and the manager calling it. It is an estimate based on recorded timestamps.
