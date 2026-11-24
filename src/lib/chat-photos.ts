type Attachment = { id: string; attachment_path: string | null; attachment_type: string | null };

export function chatPhotos(messages: Attachment[], urls: Record<string, string>) {
  return messages.flatMap((message) => {
    const path = message.attachment_path;
    if (!path || !message.attachment_type?.startsWith("image/") || !urls[path]) return [];
    return [{ id: message.id, path, album_id: null, attachment_type: message.attachment_type }];
  });
}
