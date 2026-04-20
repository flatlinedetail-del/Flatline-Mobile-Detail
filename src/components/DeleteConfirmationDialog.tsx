import React from "react";
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

interface DeleteConfirmationDialogProps {
  trigger: React.ReactElement;
  title: string;
  description?: string;
  onConfirm: () => void;
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
  return (
    <AlertDialog>
      <AlertDialogTrigger render={trigger} nativeButton={isNativeButton} />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="font-black text-red-600">{title}</AlertDialogTitle>
          <AlertDialogDescription className="text-gray-600">
            {description || `Are you sure you want to delete ${itemName ? `"${itemName}"` : "this item"}? This action cannot be undone and will permanently remove the record from the database.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="font-bold">Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.stopPropagation();
              onConfirm();
            }}
            className="bg-red-600 hover:bg-red-700 font-bold text-white"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
