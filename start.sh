#!/usr/bin/env bash
set -e

echo "Starting Alpha Engine..."

# Backend
cd "$(dirname "$0")/backend"
python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!
echo "  Backend  → http://localhost:8000  (PID $BACKEND_PID)"

# Frontend
cd "$(dirname "$0")/frontend"
npm run dev &
FRONTEND_PID=$!
echo "  Frontend → http://localhost:5173  (PID $FRONTEND_PID)"

echo ""
echo "  API docs → http://localhost:8000/docs"
echo ""
echo "Press Ctrl+C to stop both servers."

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" INT TERM
wait
