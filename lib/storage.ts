
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from 'uuid';

// Initialize S3 Client for Cloudflare R2
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL;
const R2_CONTENT_BUCKET_NAME = process.env.R2_CONTENT_BUCKET_NAME;
const R2_CONTENT_PUBLIC_URL = process.env.R2_CONTENT_PUBLIC_URL;

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME || !R2_PUBLIC_URL) {
    console.warn("Missing R2 environment variables. Photo storage will fail.");
}
if (!R2_CONTENT_BUCKET_NAME || !R2_CONTENT_PUBLIC_URL) {
    console.warn("Missing R2_CONTENT_BUCKET_NAME or R2_CONTENT_PUBLIC_URL. Attachment storage will fail.");
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
 * Uploads any file buffer to the content attachments bucket, preserving the original file extension.
 */
export async function uploadFileToR2(fileBuffer: Buffer, contentType: string, originalFilename: string): Promise<string> {
    const ext = originalFilename.includes('.') ? originalFilename.split('.').pop() : 'bin';
    const filename = `${uuidv4()}.${ext}`;

    const command = new PutObjectCommand({
        Bucket: R2_CONTENT_BUCKET_NAME,
        Key: filename,
        Body: fileBuffer,
        ContentType: contentType,
    });

    try {
        await r2Client.send(command);
        const baseUrl = R2_CONTENT_PUBLIC_URL?.replace(/\/$/, '');
        return `${baseUrl}/${filename}`;
    } catch (error) {
        console.error("Error uploading to R2 content bucket:", error);
        throw new Error("Failed to upload file to storage");
    }
}

/**
 * Uploads a file buffer to the content attachments bucket under an explicit key
 * (e.g. `my-draft-20260606-191500.md`) instead of a random UUID. The key is
 * sanitized and a short random suffix is appended to avoid collisions/overwrites.
 * Returns the public URL.
 */
export async function uploadNamedFileToR2(fileBuffer: Buffer, contentType: string, desiredKey: string): Promise<string> {
    // Split extension, sanitize the base, re-attach ext, add a short uniqueness suffix.
    const lastDot = desiredKey.lastIndexOf('.')
    const rawBase = lastDot > 0 ? desiredKey.slice(0, lastDot) : desiredKey
    const ext = lastDot > 0 ? desiredKey.slice(lastDot + 1) : 'bin'
    const base = rawBase.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120) || 'file'
    const suffix = uuidv4().slice(0, 8)
    const key = `${base}-${suffix}.${ext}`

    const command = new PutObjectCommand({
        Bucket: R2_CONTENT_BUCKET_NAME,
        Key: key,
        Body: fileBuffer,
        ContentType: contentType,
    })

    try {
        await r2Client.send(command)
        const baseUrl = R2_CONTENT_PUBLIC_URL?.replace(/\/$/, '')
        return `${baseUrl}/${key}`
    } catch (error) {
        console.error("Error uploading named file to R2 content bucket:", error)
        throw new Error("Failed to upload file to storage")
    }
}

/**
 * Deletes a file from the content attachments bucket given its full public URL.
 */
export async function deleteFileFromR2(fileUrl: string): Promise<void> {
    if (!fileUrl) return;

    try {
        let urlString = fileUrl;
        if (!urlString.startsWith('http://') && !urlString.startsWith('https://')) {
            urlString = `https://${urlString}`;
        }
        const url = new URL(urlString);

        const contentPublicUrlObj = R2_CONTENT_PUBLIC_URL
            ? new URL(R2_CONTENT_PUBLIC_URL.startsWith('http') ? R2_CONTENT_PUBLIC_URL : `https://${R2_CONTENT_PUBLIC_URL}`)
            : null;

        if (contentPublicUrlObj && url.host !== contentPublicUrlObj.host) {
            console.log("Skipping delete for non-content-R2 URL:", fileUrl);
            return;
        }

        const key = url.pathname.substring(1);
        if (!key) {
            console.warn("Could not extract key from URL:", fileUrl);
            return;
        }

        const command = new DeleteObjectCommand({
            Bucket: R2_CONTENT_BUCKET_NAME,
            Key: key,
        });

        await r2Client.send(command);
        console.log(`Deleted R2 content object: ${key}`);
    } catch (error) {
        console.error("Error deleting from R2 content bucket:", error);
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
