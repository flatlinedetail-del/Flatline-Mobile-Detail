import { useState, useEffect } from "react";
import { ref, uploadBytes, getDownloadURL, listAll, deleteObject } from "firebase/storage";
import { storage } from "../firebase";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { Camera, Image as ImageIcon, X, Loader2, Plus, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface PhotoDocumentationProps {
  jobId: string;
  type: "before" | "after" | "damage";
}

export default function PhotoDocumentation({ jobId, type }: PhotoDocumentationProps) {
  const [photos, setPhotos] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);

  useEffect(() => {
    // Fail fast for storage retries to prevent UI hang if bucket isn't set up
    storage.maxOperationRetryTime = 3000;
    
    loadPhotos();
  }, [jobId, type]);

  const loadPhotos = async () => {
    if (!jobId) return;
    const storageRef = ref(storage, `jobs/${jobId}/${type}`);
    try {
      setStorageError(null);
      const result = await listAll(storageRef);
      const urls = await Promise.all(result.items.map(item => getDownloadURL(item)));
      setPhotos(urls);
    } catch (error: any) {
      if (error?.code === 'storage/retry-limit-exceeded' || error?.code === 'storage/unauthorized') {
        setStorageError("Photo storage is currently unavailable or unconfigured.");
      } else {
        console.warn("Storage warning:", error);
        setStorageError("Failed to load photos.");
      }
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (storageError) {
      toast.error("Storage is currently unavailable.");
      return;
    }

    setIsUploading(true);
    const uploadPromises = Array.from(files).map(async (file) => {
      const fileName = `${Date.now()}_${file.name}`;
      const storageRef = ref(storage, `jobs/${jobId}/${type}/${fileName}`);
      await uploadBytes(storageRef, file);
      return getDownloadURL(storageRef);
    });

    try {
      const newUrls = await Promise.all(uploadPromises);
      setPhotos(prev => [...prev, ...newUrls]);
      toast.success(`Uploaded ${files.length} photos`);
    } catch (error: any) {
      console.warn("Upload error:", error);
      if (error?.code === 'storage/retry-limit-exceeded' || error?.code === 'storage/unauthorized') {
        setStorageError("Photo storage is currently unavailable or unconfigured.");
        toast.error("Photo storage is unavailable.");
      } else {
        toast.error("Failed to upload photos");
      }
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (url: string) => {
    try {
      const storageRef = ref(storage, url);
      await deleteObject(storageRef);
      setPhotos(prev => prev.filter(p => p !== url));
      toast.success("Photo deleted");
    } catch (error) {
      console.warn("Delete error:", error);
      toast.error("Failed to delete photo");
    }
  };

  if (storageError) {
    return (
      <Card className="border-dashed border-red-500/20 bg-red-500/5">
        <CardContent className="flex flex-col items-center justify-center p-6 text-center space-y-2">
          <AlertCircle className="w-8 h-8 text-red-500/50 mb-2" />
          <p className="text-sm font-bold text-red-500">Storage Error</p>
          <p className="text-xs text-red-400/80">{storageError}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-black uppercase tracking-widest text-gray-400">{type} Photos</h3>
        <label className="cursor-pointer">
          <Input 
            type="file" 
            multiple 
            accept="image/*" 
            className="hidden" 
            onChange={handleUpload}
            disabled={isUploading}
          />
          <Button variant="outline" size="sm" disabled={isUploading} type="button" className="cursor-pointer font-bold border-gray-200 hover:bg-red-50 hover:text-primary">
            <div className="flex items-center">
              {isUploading ? <Loader2 className="w-4 h-4 animate-spin mr-2 text-primary" /> : <Plus className="w-4 h-4 mr-2" />}
              Add Photos
            </div>
          </Button>
        </label>
      </div>

      {photos.length === 0 ? (
        <div className="border-2 border-dashed border-gray-100 rounded-2xl p-8 text-center text-gray-400">
          <ImageIcon className="w-8 h-8 mx-auto mb-2 opacity-20 text-primary" />
          <p className="text-xs font-medium">No {type} photos uploaded yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
          {photos.map((url, i) => (
            <div key={i} className="relative aspect-square rounded-xl overflow-hidden border border-gray-100 group">
              <img src={url} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              <button 
                onClick={() => handleDelete(url)}
                className="absolute top-1 right-1 p-1 bg-black/50 text-white rounded-full transition-opacity"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={className}
      {...props}
    />
  )
}
