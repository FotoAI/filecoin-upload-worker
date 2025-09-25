import { Synapse } from "@filoz/synapse-sdk";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

// Load environment variables
dotenv.config();

/**
 * Test Filecoin upload using Synapse SDK
 * Usage: node test-filecoin-upload.js [file-path]
 */
async function testFilecoinUpload(filePath) {
  try {
    console.log("🚀 Testing Filecoin upload with Synapse SDK...\n");

    // Validate environment variables
    if (!process.env.PRIVATE_KEY) {
      throw new Error("PRIVATE_KEY not found in environment variables");
    }

    console.log("📋 Configuration:");
    console.log(`   Network: ${process.env.FILECOIN_NETWORK || "calibration"}`);
    console.log(`   RPC URL: ${process.env.RPC_URL}`);
    console.log(
      `   Private Key: ${process.env.PRIVATE_KEY.substring(
        0,
        6
      )}...${process.env.PRIVATE_KEY.slice(-4)}`
    );

    // Use existing image file if no file provided
    if (!filePath) {
      console.log(
        "\n📁 No file provided, checking for existing image files..."
      );

      // Check for existing image files in the current directory
      const possibleFiles = [
        "code912A0226.JPG",
        "test-image.jpg",
        "test-image.png",
      ];
      let foundFile = null;

      for (const file of possibleFiles) {
        if (fs.existsSync(file)) {
          foundFile = file;
          break;
        }
      }

      if (foundFile) {
        filePath = foundFile;
        console.log(`   Using existing image: ${filePath}`);
      } else {
        // Fallback: create test file
        console.log("   No image files found, creating test file...");
        const testContent = `Test file created at ${new Date().toISOString()}
This is a test upload to Filecoin using Synapse SDK from NEAR Web3 backend.
File created for testing purposes with minimum size requirements.
Testing integration between NEAR Protocol authentication and Filecoin storage.
Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore.`;
        filePath = "./test-upload-file.txt";
        fs.writeFileSync(filePath, testContent);
        console.log(`   Created: ${filePath}`);
      }
    }

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    // Read file
    const fileBuffer = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);
    const fileSize = fileBuffer.length;

    console.log("\n📊 File Information:");
    console.log(`   Name: ${fileName}`);
    console.log(
      `   Size: ${fileSize} bytes (${(fileSize / 1024).toFixed(2)} KB)`
    );

    // Validate file size
    if (fileSize < 127) {
      throw new Error("File too small (minimum 127 bytes required)");
    }

    if (fileSize > 200 * 1024 * 1024) {
      throw new Error("File too large (maximum 200MB allowed)");
    }

    console.log("\n🔧 Initializing Synapse SDK...");

    // Initialize Synapse SDK
    const synapse = await Synapse.create({
      privateKey: process.env.PRIVATE_KEY,
      rpcURL:
        process.env.RPC_URL || "https://api.calibration.node.glif.io/rpc/v1",
      network: process.env.FILECOIN_NETWORK || "calibration",
    });

    console.log("✅ Synapse SDK initialized successfully");

    console.log("\n📦 Creating storage context...");

    // Create storage context
    const storageContext = await synapse.storage.createContext({
      withCDN: false,
      callbacks: {
        onProviderSelected: (provider) => {
          console.log(
            `🔗 Storage provider selected: ${provider.serviceProvider}`
          );
          console.log(`   Address: ${provider.address}`);
        },
      },
    });

    console.log("✅ Storage context created successfully");

    console.log("\n⬆️ Uploading to Filecoin...");
    console.log("   This may take a few moments...");

    // Upload file with progress tracking
    const uploadResult = await storageContext.upload(fileBuffer, {
      onUploadComplete: (pieceCid) => {
        console.log(`🎉 Upload completed! Piece CID: ${pieceCid}`);
      },
    });

    console.log("\n✅ Upload Result:");
    console.log(`   Piece CID: ${uploadResult.pieceCid}`);

    // Generate possible CDN URLs
    const cdnUrls = [
      `${
        process.env.THCLOUD_API_BASE || "https://pdp-test.thcloud.dev"
      }/piece/${uploadResult.pieceCid}`,
    ];

    console.log("\n🌐 CDN URLs (files may take 5-10 minutes to be available):");
    cdnUrls.forEach((url, index) => {
      console.log(`   ${index + 1}. ${url}`);
    });

    console.log("\n📄 Full Upload Result:");
    console.log(JSON.stringify(uploadResult, null, 2));

    // Clean up test file if we created it (don't delete existing image files)
    if (filePath === "./test-upload-file.txt") {
      fs.unlinkSync(filePath);
      console.log("\n🧹 Cleaned up test file");
    } else {
      console.log("\n✅ Image file preserved for future use");
    }

    console.log("\n🎯 Test completed successfully!");

    return {
      success: true,
      pieceCid: uploadResult.pieceCid,
      cdnUrls,
      uploadResult,
      filename: fileName,
      size: fileSize,
    };
  } catch (error) {
    console.error("\n❌ Test failed:", error.message);
    console.error("Stack:", error.stack);

    return {
      success: false,
      error: error.message,
    };
  }
}

// Run test if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const filePath = process.argv[2];
  testFilecoinUpload(filePath)
    .then((result) => {
      if (result.success) {
        console.log("\n🏆 SUCCESS: Filecoin upload test completed!");
        process.exit(0);
      } else {
        console.log("\n💥 FAILED: Filecoin upload test failed!");
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error("\n💀 CRITICAL ERROR:", error);
      process.exit(1);
    });
}

export { testFilecoinUpload };
