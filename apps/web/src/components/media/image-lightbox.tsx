import { useEffect } from "react";
import { X } from "lucide-react";
import type { FocusedImage } from "@/app/types";
import { Button } from "@/components/ui/button";

export function ImageLightbox({
  image,
  onClose,
}: {
  image: FocusedImage;
  onClose: () => void;
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      aria-label="Focused image preview"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-4 backdrop-blur-sm"
      role="dialog"
      onClick={onClose}
    >
      <Button
        aria-label="Close image preview"
        className="absolute right-4 top-4 z-10 bg-background/90"
        size="icon"
        type="button"
        variant="outline"
        onClick={onClose}
      >
        <X />
      </Button>
      <div
        className="max-h-full max-w-full"
        onClick={(event) => event.stopPropagation()}
      >
        <img
          alt={image.alt}
          className="max-h-[85svh] max-w-[92vw] rounded-lg border bg-muted object-contain shadow-2xl"
          src={image.src}
        />
      </div>
    </div>
  );
}
