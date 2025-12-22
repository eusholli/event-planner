
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from 'uuid';

// Initialize S3 Client for Cloudflare R2
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL;

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME || !R2_PUBLIC_URL) {
    console.warn("Missing R2 environment variables. Photo storage will fail.");
}

const r2Client = new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: R2_ACCESS_KEY_ID || '',
        secretAccessKey: R2_SECRET_ACCESS_KEY || '',
    },
});

/**
 * Uploads a file buffer to R2 and returns the public URL.
 */
export async function uploadImageToR2(fileBuffer: Buffer, contentType: string, originalFilename?: string): Promise<string> {
    const ext = contentType.split('/').pop() || 'jpg';
    const filename = `${uuidv4()}.${ext}`;

    const command = new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: filename,
        Body: fileBuffer,
        ContentType: contentType,
    });

    try {
        await r2Client.send(command);
        // Return the public URL
        // Ensure R2_PUBLIC_URL doesn't end with slash, ensure filename doesn't start with slash
        const baseUrl = R2_PUBLIC_URL?.replace(/\/$/, '');
        return `${baseUrl}/${filename}`;
    } catch (error) {
        console.error("Error uploading to R2:", error);
        throw new Error("Failed to upload image to storage");
    }
}

/**
 * Deletes an image from R2 given its full public URL.
 * It extracts the key (filename) from the URL.
 */
export async function deleteImageFromR2(fileUrl: string): Promise<void> {
    if (!fileUrl) return;

    // Extract filename from URL
    // Assumes URL format: https://[domain]/[filename]
    try {
        let urlString = fileUrl;
        if (!urlString.startsWith('http://') && !urlString.startsWith('https://')) {
            urlString = `https://${urlString}`;
        }
        const url = new URL(urlString);

        // Normalize public URL for check
        const publicUrlObj = R2_PUBLIC_URL ? new URL(R2_PUBLIC_URL.startsWith('http') ? R2_PUBLIC_URL : `https://${R2_PUBLIC_URL}`) : null;

        if (publicUrlObj && url.host !== publicUrlObj.host) {
            console.log("Skipping delete for non-R2 URL:", fileUrl);
            return;
        }

        const key = url.pathname.substring(1); // Remove leading slash

        if (!key) {
            console.warn("Could not extract key from URL:", fileUrl);
            return;
        }

        const command = new DeleteObjectCommand({
            Bucket: R2_BUCKET_NAME,
            Key: key,
        });

        await r2Client.send(command);
        console.log(`Deleted R2 object: ${key}`);
    } catch (error) {
        console.error("Error deleting from R2:", error);
        // We generally don't want to throw here, just log it, 
        // as this is usually a cleanup step.
    }
}

/**
 * Fetches an image from an external URL and uploads it to R2.
 * Returns the new R2 public URL.
 */
export async function fetchAndUploadImageToR2(externalUrl: string): Promise<string> {
    try {
        const response = await fetch(externalUrl);
        if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const contentType = response.headers.get("content-type") || "image/jpeg";

        return await uploadImageToR2(buffer, contentType);
    } catch (error) {
        console.error("Error fetching and uploading image:", error);
        throw error;
    }
}
