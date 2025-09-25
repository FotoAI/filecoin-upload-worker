# Filecoin Upload Worker

A Cloudflare Worker that handles file uploads to Filecoin using the Synapse SDK and notifies your backend API upon successful uploads.

## Features

- ✅ File upload handling via multipart form data or direct stream
- ✅ **NEW**: JSON upload type for image URL processing
- ✅ Filecoin storage using Synapse SDK
- ✅ Backend API notification with upload details
- ✅ CORS support for web applications
- ✅ File size validation (127 bytes - 200MB)
- ✅ Error handling and logging
- ✅ Support for staging and production environments

## Prerequisites

1. **Cloudflare Account**: You need a Cloudflare account with Workers enabled
2. **Filecoin Wallet**: A Filecoin wallet with private key for the Synapse SDK
3. **Backend API**: An API endpoint to receive upload notifications

## Setup Instructions

### 1. Clone and Install Dependencies

```bash
git clone <your-repo>
cd upload-worker
npm install
```

### 2. Configure Environment Variables

You need to set the following secrets using Wrangler:

#### Required Secrets

```bash
# Filecoin private key for Synapse SDK
wrangler secret put FILECOIN_PRIVATE_KEY

# Your backend API URL for notifications
wrangler secret put BACKEND_API_URL
```

#### Optional Secrets

```bash
# Bearer token for backend API authentication (if required)
wrangler secret put BACKEND_API_KEY

# Custom Filecoin RPC URL (defaults to calibration network)
wrangler secret put FILECOIN_RPC_URL

# Filecoin network (defaults to "calibration")
wrangler secret put FILECOIN_NETWORK

# CDN base URL (defaults to "https://pdp-test.thcloud.dev")
wrangler secret put THCLOUD_API_BASE
```

### 3. Development

Start the development server:

```bash
npm run dev
```

The worker will be available at `http://localhost:8787`

### 4. Deployment

#### Deploy to staging:

```bash
npm run deploy:staging
```

#### Deploy to production:

```bash
npm run deploy:production
```

#### Deploy to default environment:

```bash
npm run deploy
```

## API Usage

### Endpoint

`POST /`

### Headers

- `user-id` (required): User identifier that will be sent to your backend API
- `Content-Type`: Either `multipart/form-data`, `application/json`, or the file's content type for stream uploads
- `x-file-name` (optional): Original filename (required for stream uploads)
- `x-file-size` (optional): File size in bytes (used for stream upload validation)
- `x-upload-method` (optional): Upload method indicator ('multipart' or 'stream')

### Request Body

- **Multipart Form Data**: Include a `file` field with the file to upload
- **Direct Stream**: Send the file data directly as the request body
- **JSON Upload**: Send JSON with `event_id`, `image_url`, and `fotoowl_image_id` fields

### Example Requests

#### Using multipart form data:

```javascript
const formData = new FormData();
formData.append("file", file);

const response = await fetch("https://your-worker-domain.workers.dev", {
  method: "POST",
  headers: {
    "user-id": "user123",
  },
  body: formData,
});
```

#### Using direct stream:

```javascript
const fileBuffer = await file.arrayBuffer();

const response = await fetch("https://your-worker-domain.workers.dev", {
  method: "POST",
  headers: {
    "user-id": "user123",
    "Content-Type": "image/jpeg",
    "x-file-name": "photo.jpg",
    "x-file-size": file.size.toString(),
    "x-upload-method": "stream",
  },
  body: fileBuffer,
});
```

#### Using JSON upload (NEW):

```javascript
const jsonPayload = {
  event_id: "event_12345",
  image_url: "https://example.com/path/to/image.jpg",
  fotoowl_image_id: "fotoowl_67890",
};

const response = await fetch("https://your-worker-domain.workers.dev", {
  method: "POST",
  headers: {
    "user-id": "user123",
    "Content-Type": "application/json",
  },
  body: JSON.stringify(jsonPayload),
});
```

### Response

#### Success Response (200):

```json
{
  "success": true,
  "name": "photo.jpg",
  "size": 1024576,
  "cid": "baga6ea4sea...",
  "filecoin_url": "https://pdp-test.thcloud.dev/piece/baga6ea4sea...",
  "user_id": "user123",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

#### JSON Upload Success Response (200):

```json
{
  "success": true,
  "name": "image_67890.jpg",
  "size": 1024576,
  "cid": "baga6ea4sea...",
  "filecoin_url": "https://pdp-test.thcloud.dev/piece/baga6ea4sea...",
  "user_id": "user123",
  "event_id": "event_12345",
  "fotoowl_image_id": "fotoowl_67890",
  "original_image_url": "https://example.com/path/to/image.jpg",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

#### Error Response (4xx/5xx):

```json
{
  "error": "Upload failed",
  "message": "File too large (maximum 200MB allowed)",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

## JSON Upload Type

The worker now supports a new JSON upload type that allows you to upload images from URLs. This is useful when you have an image URL and want to store it on Filecoin.

### JSON Upload Process

1. **Send JSON payload** with `event_id`, `image_url`, and `fotoowl_image_id`
2. **Worker downloads** the image from the provided URL
3. **Uploads to Filecoin** using the existing Synapse SDK
4. **Notifies backend** with the upload details plus the original event data

### JSON Upload Fields

- `event_id` (required): Event identifier that will be sent to your backend
- `image_url` (required): URL of the image to download and upload
- `fotoowl_image_id` (required): FotoOwl image identifier

## Backend API Integration

When a file is successfully uploaded to Filecoin, the worker will send a POST request to your `BACKEND_API_URL` with the following payload:

### Standard Upload Payload:

```json
{
  "name": "photo.jpg",
  "size": 1024576,
  "cid": "baga6ea4sea...",
  "filecoin_url": "https://pdp-test.thcloud.dev/piece/baga6ea4sea...",
  "user_id": "user123"
}
```

### JSON Upload Payload:

```json
{
  "name": "image_67890.jpg",
  "size": 1024576,
  "cid": "baga6ea4sea...",
  "filecoin_url": "https://pdp-test.thcloud.dev/piece/baga6ea4sea...",
  "user_id": "user123",
  "event_id": "event_12345",
  "fotoowl_image_id": "fotoowl_67890",
  "original_image_url": "https://example.com/path/to/image.jpg"
}
```

### Backend API Requirements

Your backend API should:

1. Accept POST requests with JSON payload
2. Handle the notification data appropriately
3. Return appropriate HTTP status codes
4. Optionally require authentication via `Authorization: Bearer <token>` header

## File Constraints

- **Minimum size**: 127 bytes
- **Maximum size**: 200MB
- **Supported formats**: Any file format

## Environment Configuration

### Default Values

- **Filecoin Network**: `calibration` (testnet)
- **RPC URL**: `https://api.calibration.node.glif.io/rpc/v1`
- **CDN Base**: `https://pdp-test.thcloud.dev`

### Production Setup

For production use:

1. Use mainnet Filecoin network: `wrangler secret put FILECOIN_NETWORK` → `mainnet`
2. Use mainnet RPC URL: `wrangler secret put FILECOIN_RPC_URL` → `https://api.node.glif.io/rpc/v1`
3. Ensure your private key has sufficient FIL for storage deals

## Monitoring

View real-time logs:

```bash
npm run tail
```

## Troubleshooting

### Common Issues

1. **"FILECOIN_PRIVATE_KEY not configured"**

   - Run: `wrangler secret put FILECOIN_PRIVATE_KEY`

2. **"BACKEND_API_URL not configured"**

   - Run: `wrangler secret put BACKEND_API_URL`

3. **"performance.mark is not a function" Error**

   - This is automatically handled by built-in polyfills in the worker
   - Ensure compatibility date is set to `2024-09-23` or later
   - Verify `nodejs_compat` compatibility flag is enabled

4. **File upload fails**

   - Check file size constraints (127 bytes - 200MB)
   - Verify Filecoin private key has sufficient funds
   - Check network connectivity

5. **Backend notification fails**

   - Worker continues to return success even if backend notification fails
   - Check backend API URL and authentication
   - Check worker logs for backend response errors

6. **Synapse SDK Compatibility Issues**
   - The worker includes polyfills for Node.js APIs required by Synapse SDK
   - Performance API methods are polyfilled for Cloudflare Workers environment
   - Process global is polyfilled with necessary Worker-compatible methods

## Development Notes

- The worker uses the Synapse SDK for Filecoin integration
- **Ultra-fast responses**: Returns immediately when `onUploadComplete` callback fires (doesn't wait for full upload result)
- Backend notifications are fire-and-forget (non-blocking) using `ctx.waitUntil()`
- CORS is enabled for web application integration
- Comprehensive error handling and logging included
- Built-in polyfills for Node.js APIs (performance, process) to support Synapse SDK
- Uses `nodejs_compat` compatibility flag for enhanced Node.js API support

## License

ISC
