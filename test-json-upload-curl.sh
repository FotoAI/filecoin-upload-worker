#!/bin/bash

# Test JSON upload functionality with curl
# This script tests the new JSON upload type with the provided image URL

# Configuration
WORKER_URL="http://localhost:8787"  # Update this to your actual worker URL
USER_ID="test-user-123"

# JSON payload with the provided parameters
JSON_PAYLOAD='{
  "event_id": "1223",
  "image_url": "https://storage.fotoowl.ai/events/163135/xwqFlkSD3MUAmC9IUYbHinlVqqU2/med/IMG_3158.webp?last=1758542745",
  "fotoowl_image_id": "fotoowl_67890",
  "name": "IMG_3158.webp"
}'

echo "Testing JSON upload with the following payload:"
echo "$JSON_PAYLOAD" | jq '.' 2>/dev/null || echo "$JSON_PAYLOAD"
echo ""
echo "Sending request to: $WORKER_URL"
echo ""

# Make the curl request
curl -X POST "$WORKER_URL" \
  -H "Content-Type: application/json" \
  -H "user-id: $USER_ID" \
  -d "$JSON_PAYLOAD" \
  -w "\n\nHTTP Status: %{http_code}\nTotal Time: %{time_total}s\n" \
  -v

echo ""
echo "Request completed!"
