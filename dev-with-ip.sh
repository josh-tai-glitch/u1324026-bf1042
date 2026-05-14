#!/bin/bash

# 獲取本機 IP
LOCAL_IP=$(hostname -I | awk '{print $1}')
if [ -z "$LOCAL_IP" ]; then
  LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || echo "localhost")
fi

echo "🌍 Network IP: http://$LOCAL_IP:3000"
echo "💻 Local URL: http://localhost:3000"
echo ""

# 啟動 bun，綁定到 0.0.0.0
HOST=0.0.0.0 bun dev --host
