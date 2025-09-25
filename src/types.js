/**
 * Backend payload types and validation schemas
 */

/**
 * Upload payload structure for backend API
 * @typedef {Object} UploadPayload
 * @property {string} name - Original file name
 * @property {number} size - File size in bytes
 * @property {string} cid - Filecoin piece CID
 * @property {string} filecoin_url - CDN URL for accessing the file
 * @property {string} user_id - User identifier from request headers
 * @property {boolean} is_selfie - Whether the image is a selfie (true) or regular image (false)
 * @property {number} [height] - Image height in pixels (optional)
 * @property {number} [width] - Image width in pixels (optional)
 */

/**
 * Validation error structure
 * @typedef {Object} ValidationError
 * @property {string} field - Field name that failed validation
 * @property {string} message - Error message describing the validation failure
 * @property {*} received - The value that was received
 */

export const UPLOAD_PAYLOAD_SCHEMA = {
  name: {
    type: "string",
    required: true,
    minLength: 1,
    maxLength: 255,
    pattern: /^[^<>:"/\\|?*\x00-\x1F]+$/,
    description:
      "File name must be a valid filename without prohibited characters",
  },
  size: {
    type: "number",
    required: true,
    min: 127,
    max: 200 * 1024 * 1024, // 200MB
    description: "File size must be between 127 bytes and 200MB",
  },
  cid: {
    type: "string",
    required: true,
    pattern: /^[a-zA-Z0-9]+$/,
    minLength: 10,
    description: "CID must be a valid Filecoin piece CID",
  },
  filecoin_url: {
    type: "string",
    required: true,
    pattern: /^https?:\/\/.+/,
    description: "Filecoin URL must be a valid HTTP/HTTPS URL",
  },
  user_id: {
    type: "string",
    required: true,
    minLength: 1,
    maxLength: 128,
    description: "User ID must be provided and within length limits",
  },
  is_selfie: {
    type: "boolean",
    required: true,
    description:
      "Whether the image is a selfie (true) or regular image (false)",
  },
  height: {
    type: "number",
    required: false,
    min: 1,
    max: 10000,
    description: "Image height in pixels (optional)",
  },
  width: {
    type: "number",
    required: false,
    min: 1,
    max: 10000,
    description: "Image width in pixels (optional)",
  },
};

/**
 * Creates a properly structured upload payload
 * @param {string} name - File name
 * @param {number} size - File size in bytes
 * @param {string} cid - Filecoin piece CID
 * @param {string} filecoin_url - CDN URL for file access
 * @param {string} user_id - User identifier
 * @param {boolean} is_selfie - Whether the image is a selfie
 * @param {number} [height] - Image height in pixels (optional)
 * @param {number} [width] - Image width in pixels (optional)
 * @returns {UploadPayload} Structured payload object
 */
export function createUploadPayload(
  name,
  size,
  cid,
  filecoin_url,
  user_id,
  is_selfie,
  height = undefined,
  width = undefined
) {
  const payload = {
    name,
    size,
    cid,
    filecoin_url,
    is_selfie,
  };

  // Add user_id if provided
  if (user_id !== undefined && user_id !== null && user_id !== "") {
    payload.user_id = user_id;
  }

  // Add height and width if provided
  if (height !== undefined && height !== null) {
    payload.height = height;
  }
  if (width !== undefined && width !== null) {
    payload.width = width;
  }

  return payload;
}

/**
 * Validates upload payload against schema
 * @param {Object} payload - Payload object to validate
 * @param {string} uploadType - Type of upload: 'json', 'stream', or 'formdata'
 * @returns {{valid: boolean, errors: ValidationError[]}} Validation result
 */
export function validateUploadPayload(payload, uploadType = "stream") {
  const errors = [];

  for (const [field, rules] of Object.entries(UPLOAD_PAYLOAD_SCHEMA)) {
    const value = payload[field];

    // Special handling for user_id: required for stream and formdata, optional for json
    const isUserIdField = field === "user_id";
    const isUserIdRequired = isUserIdField
      ? uploadType !== "json"
      : rules.required;

    // Check if required field is missing
    if (
      isUserIdRequired &&
      (value === undefined || value === null || value === "")
    ) {
      errors.push({
        field,
        message: `${field} is required${
          isUserIdField ? ` for ${uploadType} uploads` : ""
        }`,
        received: value,
      });
      continue;
    }

    // Skip validation if field is not required and not provided
    if (!isUserIdRequired && (value === undefined || value === null)) {
      continue;
    }

    // Type validation
    if (rules.type === "string" && typeof value !== "string") {
      errors.push({
        field,
        message: `${field} must be a string`,
        received: typeof value,
      });
      continue;
    }

    if (rules.type === "number" && typeof value !== "number") {
      errors.push({
        field,
        message: `${field} must be a number`,
        received: typeof value,
      });
      continue;
    }

    if (rules.type === "boolean" && typeof value !== "boolean") {
      errors.push({
        field,
        message: `${field} must be a boolean`,
        received: typeof value,
      });
      continue;
    }

    // String-specific validations
    if (rules.type === "string" && typeof value === "string") {
      if (rules.minLength && value.length < rules.minLength) {
        errors.push({
          field,
          message: `${field} must be at least ${rules.minLength} characters long`,
          received: value.length,
        });
      }

      if (rules.maxLength && value.length > rules.maxLength) {
        errors.push({
          field,
          message: `${field} must be no more than ${rules.maxLength} characters long`,
          received: value.length,
        });
      }

      if (rules.pattern && !rules.pattern.test(value)) {
        errors.push({
          field,
          message: `${field} format is invalid. ${rules.description}`,
          received: value,
        });
      }
    }

    // Number-specific validations
    if (rules.type === "number" && typeof value === "number") {
      if (rules.min !== undefined && value < rules.min) {
        errors.push({
          field,
          message: `${field} must be at least ${rules.min}`,
          received: value,
        });
      }

      if (rules.max !== undefined && value > rules.max) {
        errors.push({
          field,
          message: `${field} must be no more than ${rules.max}`,
          received: value,
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Sanitizes file name to remove potentially dangerous characters
 * @param {string} filename - Original filename
 * @returns {string} Sanitized filename
 */
export function sanitizeFileName(filename) {
  if (!filename || typeof filename !== "string") {
    return "untitled";
  }

  return filename
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_") // Replace prohibited characters
    .replace(/^\.+/, "") // Remove leading dots
    .replace(/\.+$/, "") // Remove trailing dots
    .slice(0, 255) // Limit length
    .trim();
}

/**
 * Formats file size in human-readable format
 * @param {number} bytes - Size in bytes
 * @returns {string} Formatted size string
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return "0 B";

  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));

  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
}
