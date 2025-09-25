import { Synapse } from "@filoz/synapse-sdk";
import {
  createUploadPayload,
  validateUploadPayload,
  sanitizeFileName,
} from "./types.js";

/**
 * Cloudflare Worker for uploading files to Filecoin using Synapse SDK
 * Handles file stream uploads and notifies backend API upon successful upload
 */

// Polyfill for performance API - Synapse SDK requires this for Cloudflare Workers
if (
  typeof globalThis.performance === "undefined" ||
  !globalThis.performance.mark
) {
  const startTime = Date.now();
  globalThis.performance = {
    ...globalThis.performance,
    now: () => Date.now() - startTime,
    mark: (name) => {
      console.debug(`Performance mark: ${name}`);
    },
    measure: (name, startMark, endMark) => {
      console.debug(
        `Performance measure: ${name} from ${startMark} to ${endMark}`
      );
    },
    clearMarks: (name) => {
      console.debug(`Clearing performance marks: ${name || "all"}`);
    },
    clearMeasures: (name) => {
      console.debug(`Clearing performance measures: ${name || "all"}`);
    },
    getEntriesByName: (name) => [],
    getEntriesByType: (type) => [],
    getEntries: () => [],
  };
}

// Additional polyfills that might be needed by Synapse SDK
if (typeof globalThis.process === "undefined") {
  globalThis.process = {
    env: {},
    version: "v18.0.0",
    platform: "cloudflare-worker",
    nextTick: (callback, ...args) => {
      Promise.resolve().then(() => callback(...args));
    },
  };
}

export default {
  async fetch(request, env, ctx) {
    // Handle CORS for all requests
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers":
            "Content-Type, user-id, Authorization, x-file-name, x-file-size, x-upload-method, x-image-type, x-image-height, x-image-width",
        },
      });
    }

    // Only allow POST requests for file uploads
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    try {
      // Extract user-id from request headers
      const userId = request.headers.get("user-id");

      // Determine content type early to check if userId is required
      const contentType = request.headers.get("content-type");
      const isJsonUpload =
        contentType && contentType.includes("application/json");

      // userId is required for stream upload and formdata upload, but optional for JSON upload
      if (!isJsonUpload && !userId) {
        return new Response(
          JSON.stringify({
            error:
              "Missing user-id header (required for stream and formdata uploads)",
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      // Extract image type and determine if it's a selfie
      const imageType = request.headers.get("x-image-type");
      const isSelfie = imageType === "selfie";
      console.log(
        `Image type: ${imageType || "not specified"}, is_selfie: ${isSelfie}`
      );

      // Extract image dimensions from headers (for stream uploads)
      let imageHeight = request.headers.get("x-image-height");
      let imageWidth = request.headers.get("x-image-width");
      console.log(
        `Image dimensions from headers: height=${
          imageHeight || "not specified"
        }, width=${imageWidth || "not specified"}`
      );

      // Validate environment variables
      if (!env.FILECOIN_PRIVATE_KEY) {
        throw new Error("FILECOIN_PRIVATE_KEY not configured");
      }

      // if (!env.BACKEND_API_URL) {
      //   throw new Error("BACKEND_API_URL not configured");
      // }

      // Get file stream from request
      let fileBuffer;
      let fileName = "uploaded-file";
      let jsonUploadData = null;
      let uploadType = "stream"; // Default to stream, will be updated based on content type

      if (contentType && contentType.includes("application/json")) {
        // Handle JSON upload type
        uploadType = "json";
        try {
          const jsonData = await request.json();

          // Validate required JSON fields
          if (
            !jsonData.event_id ||
            !jsonData.image_url ||
            !jsonData.fotoowl_image_id
          ) {
            return new Response(
              JSON.stringify({
                error:
                  "Missing required fields. JSON must contain: event_id, image_url, fotoowl_image_id",
              }),
              {
                status: 400,
                headers: { "Content-Type": "application/json" },
              }
            );
          }

          jsonUploadData = {
            event_id: jsonData.event_id,
            image_url: jsonData.image_url,
            fotoowl_image_id: jsonData.fotoowl_image_id,
            name: jsonData.name,
          };

          // Extract image dimensions from JSON payload
          if (jsonData.height) {
            imageHeight = parseInt(jsonData.height);
          }
          if (jsonData.width) {
            imageWidth = parseInt(jsonData.width);
          }

          console.log(
            `JSON upload: event_id=${jsonUploadData.event_id}, image_url=${jsonUploadData.image_url}, fotoowl_image_id=${jsonUploadData.fotoowl_image_id}`
          );
          console.log(
            `Image dimensions from JSON: height=${
              imageHeight || "not specified"
            }, width=${imageWidth || "not specified"}`
          );

          // Download image from provided URL
          try {
            const imageResponse = await fetch(jsonUploadData.image_url);
            if (!imageResponse.ok) {
              throw new Error(
                `Failed to download image: ${imageResponse.status} ${imageResponse.statusText}`
              );
            }

            const imageBuffer = await imageResponse.arrayBuffer();
            fileBuffer = new Uint8Array(imageBuffer);
            const decodedJsonFileName = jsonUploadData.name
              ? decodeURIComponent(jsonUploadData.name)
              : null;
            fileName = sanitizeFileName(decodedJsonFileName) || "uploaded-file";
            console.log(
              `Downloaded image: ${fileName}, Size: ${fileBuffer.length} bytes`
            );
          } catch (downloadError) {
            console.error("Image download failed:", downloadError.message);
            return new Response(
              JSON.stringify({
                error: "Failed to download image from provided URL",
                message: downloadError.message,
              }),
              {
                status: 400,
                headers: { "Content-Type": "application/json" },
              }
            );
          }
        } catch (jsonError) {
          console.error("JSON parsing failed:", jsonError.message);
          return new Response(
            JSON.stringify({
              error: "Invalid JSON format",
              message: jsonError.message,
            }),
            {
              status: 400,
              headers: { "Content-Type": "application/json" },
            }
          );
        }
      } else if (contentType && contentType.includes("multipart/form-data")) {
        // Handle multipart form data
        uploadType = "formdata";
        const formData = await request.formData();
        const file = formData.get("file");

        if (!file) {
          return new Response(
            JSON.stringify({ error: "No file provided in form data" }),
            {
              status: 400,
              headers: { "Content-Type": "application/json" },
            }
          );
        }

        const decodedFormFileName = file.name
          ? decodeURIComponent(file.name)
          : null;
        fileName = sanitizeFileName(decodedFormFileName) || "uploaded-file";
        fileBuffer = new Uint8Array(await file.arrayBuffer());

        // Extract image dimensions from form data
        const formHeight = formData.get("height");
        const formWidth = formData.get("width");

        if (formHeight) {
          imageHeight = parseInt(formHeight);
        }
        if (formWidth) {
          imageWidth = parseInt(formWidth);
        }

        console.log(
          `Image dimensions from form data: height=${
            imageHeight || "not specified"
          }, width=${imageWidth || "not specified"}`
        );
      } else {
        // Handle direct file stream
        const rawFileName = request.headers.get("x-file-name");
        const decodedFileName = rawFileName
          ? decodeURIComponent(rawFileName)
          : null;
        fileName = sanitizeFileName(decodedFileName) || "uploaded-file";
        const uploadMethod = request.headers.get("x-upload-method");
        const expectedSize = request.headers.get("x-file-size");

        fileBuffer = new Uint8Array(await request.arrayBuffer());

        // Use dimensions from headers for stream uploads
        if (imageHeight) {
          imageHeight = parseInt(imageHeight);
        }
        if (imageWidth) {
          imageWidth = parseInt(imageWidth);
        }

        // Validate file size if provided in headers
        if (expectedSize && parseInt(expectedSize) !== fileBuffer.length) {
          console.warn(
            `File size mismatch: expected ${expectedSize}, got ${fileBuffer.length}`
          );
        }

        console.log(
          `Stream upload: ${fileName}, method: ${uploadMethod || "stream"}`
        );
      }

      // Validate file size
      const fileSize = fileBuffer.length;
      console.log(`Processing file: ${fileName}, Size: ${fileSize} bytes`);

      if (fileSize < 127) {
        return new Response(
          JSON.stringify({
            error: "File too small (minimum 127 bytes required)",
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      if (fileSize > 200 * 1024 * 1024) {
        return new Response(
          JSON.stringify({ error: "File too large (maximum 200MB allowed)" }),
          {
            status: 413,
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      console.log("Initializing Synapse SDK...");

      // Initialize Synapse SDK with detailed error handling
      let synapse;
      try {
        synapse = await Synapse.create({
          privateKey: env.FILECOIN_PRIVATE_KEY,
          rpcURL:
            env.FILECOIN_RPC_URL ||
            "https://api.calibration.node.glif.io/rpc/v1",
          network: env.FILECOIN_NETWORK || "calibration",
        });
      } catch (synapseError) {
        console.error(
          "Synapse SDK initialization failed:",
          synapseError.message
        );
        throw new Error(
          `Synapse SDK initialization failed: ${synapseError.message}`
        );
      }

      console.log("Creating storage context...");

      // Create storage context with detailed error handling
      let storageContext;
      try {
        storageContext = await synapse.storage.createContext({
          withCDN: false,
          callbacks: {
            onProviderSelected: (provider) => {
              console.log(
                `Storage provider selected: ${provider.serviceProvider}`
              );
            },
          },
        });
      } catch (contextError) {
        console.error("Storage context creation failed:", contextError.message);
        throw new Error(
          `Storage context creation failed: ${contextError.message}`
        );
      }

      console.log("Uploading to Filecoin...");

      // Create a promise that resolves when upload completes via callback
      return new Promise((resolve, reject) => {
        // Start the upload with callback for immediate response
        storageContext
          .upload(fileBuffer, {
            onUploadComplete: (pieceCid) => {
              console.log(`Upload completed! Piece CID: ${pieceCid}`);

              // Generate CDN URL
              const cdnUrl = `${
                env.THCLOUD_API_BASE || "https://pdp-test.thcloud.dev"
              }/piece/${pieceCid}`;

              // Create structured payload for backend API
              const backendPayload = createUploadPayload(
                fileName, // name
                fileSize, // size
                pieceCid.toString(), // cid
                cdnUrl, // filecoin_url
                userId, // user_id
                isSelfie, // is_selfie
                imageHeight, // height
                imageWidth // width
              );

              // Validate the payload before sending
              const validation = validateUploadPayload(
                backendPayload,
                uploadType
              );
              if (!validation.valid) {
                console.error("Payload validation failed:", validation.errors);
                // Log validation errors but don't fail the upload
                validation.errors.forEach((error) => {
                  console.error(
                    `- ${error.field}: ${error.message} (received: ${error.received})`
                  );
                });
              } else {
                console.log("Payload validation passed");
              }

              // Schedule backend API notification as non-blocking operation
              if (env.BACKEND_API_URL) {
                ctx.waitUntil(
                  (async () => {
                    try {
                      console.log("Notifying backend API (non-blocking)...");

                      // For JSON uploads, send event_id to backend
                      let backendPayloadToSend = backendPayload;
                      if (jsonUploadData) {
                        backendPayloadToSend = {
                          ...backendPayload,
                          event_id: jsonUploadData.event_id,
                          fotoowl_image_id: jsonUploadData.fotoowl_image_id,
                          original_image_url: jsonUploadData.image_url,
                          filecoin_cid: pieceCid.toString(),
                        };
                      }

                      console.log(
                        "Sending backend payload to:",
                        env.BACKEND_API_URL + "/api/v1/internal/images"
                      );
                      console.log(
                        "Backend payload to send:",
                        backendPayloadToSend
                      );
                      console.log("Backend API key:", env.BACKEND_API_KEY);
                      const backendResponse = await fetch(
                        env.BACKEND_API_URL + "/api/v1/internal/images",
                        {
                          method: "POST",
                          headers: {
                            "Content-Type": "application/json",
                            ...(env.BACKEND_API_KEY && {
                              Authorization: `Basic ${env.BACKEND_API_KEY}`,
                            }),
                          },
                          body: JSON.stringify(backendPayloadToSend),
                        }
                      );

                      if (!backendResponse.ok) {
                        console.error(
                          `Backend API notification failed: ${backendResponse.status}`
                        );
                      } else {
                        console.log("Backend API notified successfully");
                      }
                    } catch (backendError) {
                      console.error(
                        "Backend API notification error:",
                        backendError.message
                      );
                    }
                  })()
                );
              }

              // Return success response with structured payload format
              const responseData = {
                success: true,
                ...backendPayload, // Include the structured payload fields
                timestamp: new Date().toISOString(),
              };

              // Include JSON upload data if this was a JSON upload
              if (jsonUploadData) {
                responseData.event_id = jsonUploadData.event_id;
                responseData.fotoowl_image_id = jsonUploadData.fotoowl_image_id;
                responseData.original_image_url = jsonUploadData.image_url;
              }

              resolve(
                new Response(JSON.stringify(responseData), {
                  status: 200,
                  headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                  },
                })
              );
            },
          })
          .catch((uploadError) => {
            console.error("Filecoin upload failed:", uploadError.message);
            console.error("Upload error stack:", uploadError.stack);
            reject(new Error(`Filecoin upload failed: ${uploadError.message}`));
          });
      });
    } catch (error) {
      console.error("Upload failed:", error.message);
      console.error("Stack:", error.stack);

      return new Response(
        JSON.stringify({
          error: "Upload failed",
          message: error.message,
          timestamp: new Date().toISOString(),
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }
  },
};
