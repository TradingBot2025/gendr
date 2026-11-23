"use client";

import { useEffect, useRef, useState } from "react";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Download,
  Share2,
  Trash2,
  Lock,
  Eye,
  EyeOff,
  Move,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

interface PhotoViewerProps {
  isOpen: boolean;
  onClose: () => void;
  photos: {
    id: string;
    path: string;
    album_id: string | null;
    is_private?: boolean;
    view_timer?: string;
  }[];
  initialIndex?: number;
  urls: Record<string, string>;
  currentUserId?: string;
  isOwner?: boolean;
  onMoveToAlbum?: (photoId: string, albumId: string | null) => void;
  onDeletePhoto?: (photoId: string) => void;
  onSetTimer?: (photoId: string, timer: "normal" | "10s" | "15s") => void;
  albums?: { id: string; name: string; is_private?: boolean }[];
}

export function PhotoViewer({
  isOpen,
  onClose,
  photos,
  initialIndex = 0,
  urls,
  currentUserId,
  isOwner = false,
  onMoveToAlbum,
  onDeletePhoto,
  onSetTimer,
  albums = [],
}: PhotoViewerProps) {
  const [index, setIndex] = useState(initialIndex);
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [moveAlbumId, setMoveAlbumId] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    setIndex(initialIndex);
  }, [initialIndex]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") setIndex((i) => (i - 1 + photos.length) % photos.length);
      if (e.key === "ArrowRight") setIndex((i) => (i + 1) % photos.length);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, photos.length, onClose]);

  if (!isOpen || photos.length === 0) return null;

  const photo = photos[index];
  if (!photo) return null;
  const url = urls[photo.path];

  const handleMoveToAlbum = () => {
    if (onMoveToAlbum && moveAlbumId !== undefined) {
      onMoveToAlbum(photo.id, moveAlbumId === "none" ? null : moveAlbumId);
      setShowMoveDialog(false);
      setMoveAlbumId(null);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] p-0 bg-transparent shadow-none">
        <DialogTitle className="sr-only">Photo viewer</DialogTitle>
        <div className="relative bg-background rounded-2xl overflow-hidden">
          {/* Header */}
          <div className="absolute top-4 left-4 right-4 z-10 flex justify-between">
            <div className="flex items-center gap-2">
              {photo.is_private && <Lock className="h-4 w-4 text-amber-400" />}
              <span className="text-sm font-medium text-white/90 bg-black/50 px-3 py-1 rounded-full">
                {index + 1} / {photos.length}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {isOwner && onMoveToAlbum && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="bg-white/90"
                  onClick={() => setShowMoveDialog(true)}
                  title="Move to album"
                >
                  <Move className="h-4 w-4" />
                </Button>
              )}
              {isOwner && onDeletePhoto && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="bg-white/90 text-destructive"
                  onClick={() => {
                    if (confirm("Delete this photo?")) onDeletePhoto(photo.id);
                  }}
                  title="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="bg-white/90"
                onClick={onClose}
                title="Close"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>

          {/* Image */}
          <div className="aspect-square relative bg-black">
            <Button
              variant="ghost"
              size="icon"
              className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/20 hover:bg-white/30 text-white"
              onClick={() => setIndex((i) => (i - 1 + photos.length) % photos.length)}
              aria-label="Previous"
            >
              <ChevronLeft className="h-6 w-6" />
            </Button>
            <img
              ref={imgRef}
              src={url || ""}
              alt=""
              className="w-full h-full object-contain"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/20 hover:bg-white/30 text-white"
              onClick={() => setIndex((i) => (i + 1) % photos.length)}
              aria-label="Next"
            >
              <ChevronRight className="h-6 w-6" />
            </Button>
          </div>

          {/* Footer with timer controls */}
          {isOwner && (
            <div className="p-4 border-t bg-white/5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Label className="text-xs text-white/70">View timer:</Label>
                <select
                  value={photo.view_timer || "normal"}
                  onChange={(e) =>
                    onSetTimer?.(photo.id, e.target.value as "normal" | "10s" | "15s")
                  }
                  className="bg-white/10 border-white/20 text-white text-xs rounded px-2 py-1"
                >
                  <option value="normal">Normal (no limit)</option>
                  <option value="10s">10 seconds</option>
                  <option value="15s">15 seconds</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => url && window.open(url, "_blank")}
                >
                  <Download className="h-3 w-3 mr-1" /> Open full
                </Button>
              </div>
            </div>
          )}

          {/* Move to album dialog */}
          {showMoveDialog && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
              <div className="bg-background rounded-2xl p-6 w-full max-w-md mx-4">
                <h3 className="font-semibold mb-4">Move to album</h3>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  <label className="flex items-center gap-2 p-2 rounded-lg hover:bg-accent cursor-pointer">
                    <input
                      type="radio"
                      name="moveAlbum"
                      value="none"
                      checked={moveAlbumId === "none" || moveAlbumId === null}
                      onChange={() => setMoveAlbumId("none")}
                      className="h-4 w-4"
                    />
                    <span>Remove from album (Main photos)</span>
                  </label>
                  {albums?.map((a) => (
                    <label
                      key={a.id}
                      className="flex items-center gap-2 p-2 rounded-lg hover:bg-accent cursor-pointer"
                    >
                      <input
                        type="radio"
                        name="moveAlbum"
                        value={a.id}
                        checked={moveAlbumId === a.id}
                        onChange={() => setMoveAlbumId(a.id)}
                        className="h-4 w-4"
                      />
                      <span>
                        {a.name} ({a.is_private ? "Private" : "Public"})
                      </span>
                    </label>
                  ))}
                </div>
                <div className="flex gap-2 mt-4">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setShowMoveDialog(false);
                      setMoveAlbumId(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button className="flex-1" onClick={handleMoveToAlbum}>
                    Move
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
