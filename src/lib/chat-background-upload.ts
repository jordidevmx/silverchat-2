import { isOwnBackgroundPath } from "./chat-background-validation";
import { getSignedUrlPolicy } from "./signed-url-policy";
import { supabase } from "./supabase";

export const CHAT_BACKGROUNDS_BUCKET = "chat-backgrounds";

export async function deleteCustomBackgroundFile(userId: string, path: string): Promise<void> {
  if (!isOwnBackgroundPath(userId, path)) return;
  const removed = await supabase.storage.from(CHAT_BACKGROUNDS_BUCKET).remove([path]);
  if (removed.error) throw removed.error;
  const metadata = await supabase
    .from("file_uploads")
    .delete()
    .eq("uploader_id", userId)
    .eq("bucket", CHAT_BACKGROUNDS_BUCKET)
    .eq("path", path);
  if (metadata.error) throw metadata.error;
}

export async function uploadCustomBackgroundFile(
  userId: string,
  blob: Blob,
  dimensions?: { width?: number; height?: number },
): Promise<{ path: string; uploadId: string }> {
  const filename = `bg-${crypto.randomUUID()}.webp`;
  const path = `${userId}/${filename}`;
  const uploadId = crypto.randomUUID();
  let metadataInserted = false;
  let objectUploaded = false;

  try {
    const metadata = await supabase.from("file_uploads").insert({
      id: uploadId,
      uploader_id: userId,
      bucket: CHAT_BACKGROUNDS_BUCKET,
      path,
      original_filename: filename,
      mime_type: "image/webp",
      size_bytes: blob.size,
      width: dimensions?.width ?? null,
      height: dimensions?.height ?? null,
    });
    if (metadata.error) throw metadata.error;
    metadataInserted = true;

    const uploading = await supabase
      .from("file_uploads")
      .update({ status: "uploading" })
      .eq("id", uploadId);
    if (uploading.error) throw uploading.error;

    const uploaded = await supabase.storage
      .from(CHAT_BACKGROUNDS_BUCKET)
      .upload(path, blob, { contentType: "image/webp", upsert: false });
    if (uploaded.error) throw uploaded.error;
    objectUploaded = true;

    const completed = await supabase
      .from("file_uploads")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", uploadId);
    if (completed.error) throw completed.error;

    return { path, uploadId };
  } catch (error) {
    if (objectUploaded) {
      await supabase.storage
        .from(CHAT_BACKGROUNDS_BUCKET)
        .remove([path])
        .catch(() => undefined);
    }
    if (metadataInserted) {
      await supabase
        .from("file_uploads")
        .update({ status: "failed" })
        .eq("id", uploadId)
        .then(
          () => undefined,
          () => undefined,
        );
      await supabase
        .from("file_uploads")
        .delete()
        .eq("id", uploadId)
        .eq("uploader_id", userId)
        .then(
          () => undefined,
          () => undefined,
        );
    }
    throw error;
  }
}

export async function fetchCustomBackgroundBlob(path: string): Promise<Blob> {
  const policy = getSignedUrlPolicy(CHAT_BACKGROUNDS_BUCKET);
  const signed = await supabase.storage
    .from(CHAT_BACKGROUNDS_BUCKET)
    .createSignedUrl(path, policy.ttlSeconds);
  if (signed.error || !signed.data?.signedUrl) {
    throw signed.error ?? new Error("Signed URL unavailable");
  }
  const response = await fetch(signed.data.signedUrl);
  if (!response.ok) {
    throw new Error(`Background fetch failed (${response.status})`);
  }
  return await response.blob();
}
