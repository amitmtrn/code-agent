#!/bin/bash
set -eu

echo "Reproducing Ollama connection timeout error..."

echo "Running: npm run dev with input 'what this project is about?'"

# Use a timeout to prevent hanging and capture the error
timeout 30s npm run dev <<EOF || exit_code=$?
what this project is about?
EOF

# If we reach here, the command didn't timeout or fail as expected
if [ ${exit_code:-0} -eq 0 ]; then
    echo "ERROR: Command succeeded unexpectedly - bug appears to be fixed"
    exit 0
fi

# Check if the error contains the expected Ollama connection timeout
if timeout 30s npm run dev <<< "what this project is about?" 2>&1 | grep -q "Connect Timeout Error.*11434.*timeout"; then
    echo "BUG CONFIRMED: Ollama connection timeout error detected"
    echo "Expected error pattern found: Connect Timeout Error (attempted address: *:11434, timeout: *ms)"
    exit 1
else
    echo "WARNING: Different error occurred, checking for any Ollama-related errors..."
    if timeout 30s npm run dev <<< "what this project is about?" 2>&1 | grep -q "Could not verify or pull model.*fetch failed"; then
        echo "BUG CONFIRMED: Ollama fetch failed error detected"
        echo "Expected error pattern found: Could not verify or pull model.*fetch failed"
        exit 1
    else
        echo "ERROR: Expected Ollama error not found - bug may be fixed or changed"
        exit 0
    fi
fi