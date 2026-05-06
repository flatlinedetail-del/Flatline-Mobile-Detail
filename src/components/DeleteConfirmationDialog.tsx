import React, { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Loader2 } from "lucide-react";

interface DeleteConfirmationDialogProps {
  trigger: React.ReactElement;
  title: string;
  description?: string;
  onConfirm: () => void | Promise<void>;
  itemName?: string;
  isNativeButton?: boolean;
}

export function DeleteConfirmationDialog({
  trigger,
  title,
  description,
  onConfirm,
  itemName,
  isNativeButton = true,
}: DeleteConfirmationDialogProps) {
  const [open, setOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOpenChange = (nextOpen: boolean) => {
    if (isDeleting) return;
    setOpen(nextOpen);
    if (!nextOpen) setError(null);
  };

  const handleConfirm = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (isDeleting) return;

    setIsDeleting(true);
    setError(null);
    try {
      await onConfirm();
      setOpen(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Delete failed. Please try again.";
      setError(message);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger render={trigger} nativeButton={isNativeButton} />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="font-black text-red-600">{title}</AlertDialogTitle>
          <AlertDialogDescription className="text-gray-600">
            {description || `Are you sure you want to delete ${itemName ? `"${itemName}"` : "this item"}? This action cannot be undone and will permanently remove the record from the database.`}
          </AlertDialogDescription>
          {error && (
            <p className="text-sm font-bold text-red-600">
              {error}
            </p>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="font-bold" disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isDeleting}
            className="bg-red-600 hover:bg-red-700 font-black uppercase tracking-widest text-xs h-12 rounded-xl text-white shadow-glow-red transition-all hover:scale-105"
          >
            {isDeleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {isDeleting ? "Deleting..." : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
