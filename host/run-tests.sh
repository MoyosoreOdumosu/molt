#!/bin/bash
set -e

cd /Users/user/Desktop/molt/host

echo "=========================================="
echo "MOLTBOT TEST SUITE"
echo "=========================================="
echo ""

# Test 1: Registration
echo "[TEST 1] Bot-A Registration..."
cp config.a.test.json config.json
if node src/index.js register 2>&1; then
    echo "✅ Bot-A registered successfully"
else
    echo "❌ Bot-A registration failed"
    exit 1
fi

echo ""
echo "[TEST 1] Bot-B Registration..."
cp config.b.test.json config.json
if node src/index.js register 2>&1; then
    echo "✅ Bot-B registered successfully"
else
    echo "❌ Bot-B registration failed"
    exit 1
fi

echo ""
echo "=========================================="
echo "✅ All registration tests passed!"
echo ""
echo "Next steps (run in separate terminals):"
echo ""
echo "Terminal 1 - Start Bot-A listener:"
echo "  cd /Users/user/Desktop/molt/host"
echo "  cp config.a.test.json config.json"
echo "  node src/index.js listen"
echo ""
echo "Terminal 2 - Run remaining tests:"
echo "  cd /Users/user/Desktop/molt/host"
echo "  ./run-tests-part2.sh"
echo "=========================================="
