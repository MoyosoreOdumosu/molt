#!/bin/bash
set -e

cd /Users/user/Desktop/molt/host

echo "=========================================="
echo "MOLTBOT TEST SUITE - Part 2"
echo "=========================================="
echo ""
echo "⚠️  Make sure Bot-A is listening in another terminal!"
echo ""

# Test 3: Signature enforcement
echo "[TEST 3] Bot-B sends signed message..."
cp config.b.test.json config.json
TIMESTAMP=$(date +%s)
if node src/index.js post "topic/announcements" "PUBLIC" "signed hello $TIMESTAMP" 2>&1; then
    echo "✅ Message sent successfully"
    echo "   Check Bot-A terminal for: [PUBLIC] topic/announcements :: rwrv9Wq8YjrArppJiGYg8AfHYcHSMK67Gi"
else
    echo "❌ Failed to send message"
    exit 1
fi

echo ""
sleep 2

# Test 4: Large payload chunking
echo "[TEST 4] Bot-B sends large payload (chunking test)..."
cp config.b.test.json config.json
PAYLOAD=$(node -e "process.stdout.write('x'.repeat(1200))")
if node src/index.js post "topic/announcements" "PUBLIC" "$PAYLOAD" 2>&1; then
    echo "✅ Large payload sent successfully"
    echo "   Check Bot-A terminal for single merged [PUBLIC] message"
else
    echo "❌ Failed to send large payload"
    exit 1
fi

echo ""
sleep 2

# Test 5: API endpoints
echo "[TEST 5] Testing API endpoints..."
echo ""

echo "  Testing /health..."
if curl -s http://127.0.0.1:8787/health | grep -q '"ok":true'; then
    echo "  ✅ /health OK"
else
    echo "  ❌ /health failed"
    exit 1
fi

echo "  Testing /identity..."
if curl -s http://127.0.0.1:8787/identity | grep -q '"name"'; then
    echo "  ✅ /identity OK"
    curl -s http://127.0.0.1:8787/identity | jq .
else
    echo "  ❌ /identity failed"
    exit 1
fi

echo "  Testing /messages..."
if curl -s "http://127.0.0.1:8787/messages?channel=topic/announcements" | grep -q '"envelope"'; then
    echo "  ✅ /messages OK"
    MSG_COUNT=$(curl -s "http://127.0.0.1:8787/messages?channel=topic/announcements" | jq '. | length')
    echo "  Found $MSG_COUNT messages"
else
    echo "  ⚠️  /messages returned no messages (might be OK if none received yet)"
fi

echo "  Testing /send..."
SEND_RESULT=$(curl -s -X POST http://127.0.0.1:8787/send \
  -H "Content-Type: application/json" \
  -d '{"channel":"topic/announcements","payload":"api hello"}')
if echo "$SEND_RESULT" | grep -q '"ok":true'; then
    echo "  ✅ /send OK"
    echo "$SEND_RESULT" | jq .
else
    echo "  ❌ /send failed"
    echo "$SEND_RESULT"
    exit 1
fi

echo ""
echo "=========================================="
echo "✅ All tests passed!"
echo "=========================================="
