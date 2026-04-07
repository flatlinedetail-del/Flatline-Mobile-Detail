import { useState, useEffect } from "react";
import { ref, uploadBytes, getDownloadURL, listAll, deleteObject } from "firebase/storage";
import { storage } from "../firebase";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { Camera, Image as ImageIcon, X, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

interface PhotoDocumentationProps {
  jobId: string;
  type: "before" | "after" | "damage";
}

export default function PhotoDocumentation({ jobId, type }: PhotoDocumentationProps) {
  const [photos, setPhotos] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    loadPhotos();
  }, [jobId, type]);

  const loadPhotos = async () => {
    if (!jobId) return;
    const storageRef = ref(storage, `jobs/${jobId}/${type}`);
    try {
      const result = await listAll(storageRef);
      const urls = await Promise.all(result.items.map(item => getDownloadURL(item)));
      setPhotos(urls);
    } catch (error) {
      console.error("Error loading photos:", error);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

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
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Failed to upload photos");
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
      console.error("Delete error:", error);
      toast.error("Failed to delete photo");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold uppercase tracking-widest text-gray-400">{type} Photos</h3>
        <label className="cursor-pointer">
          <Input 
            type="file" 
            multiple 
            accept="image/*" 
            className="hidden" 
            onChange={handleUpload}
            disabled={isUploading}
          />
          <Button variant="outline" size="sm" disabled={isUploading} type="button" className="cursor-pointer">
            <div className="flex items-center">
              {isUploading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
              Add Photos
            </div>
          </Button>
        </label>
      </div>

      {photos.length === 0 ? (
        <div className="border-2 border-dashed border-gray-100 rounded-2xl p-8 text-center text-gray-400">
          <ImageIcon className="w-8 h-8 mx-auto mb-2 opacity-20" />
          <p className="text-xs">No {type} photos uploaded yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {photos.map((url, i) => (
            <div key={i} className="relative aspect-square rounded-xl overflow-hidden border border-gray-100 group">
              <img src={url} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              <button 
                onClick={() => handleDelete(url)}
                className="absolute top-1 right-1 p-1 bg-black/50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
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
