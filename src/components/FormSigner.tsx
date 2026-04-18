import { useState, useRef } from "react";
import SignatureCanvas from "react-signature-canvas";
import { db, storage, handleFirestoreError, OperationType } from "../firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadString, getDownloadURL } from "firebase/storage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, trimCanvas, resizeImage } from "../lib/utils";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { Camera, X, CheckCircle2 } from "lucide-react";

interface FormSignerProps {
  template: any;
  appointmentId: string;
  clientId: string;
  onComplete: (signedForm: any) => void;
  onCancel: () => void;
}

export default function FormSigner({ template, appointmentId, clientId, onComplete, onCancel }: FormSignerProps) {
  const sigPad = useRef<any>(null);
  const [printedName, setPrintedName] = useState("");
  const [initials, setInitials] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [acknowledgments, setAcknowledgments] = useState<boolean[]>(
    new Array(template.acknowledgments?.length || 0).fill(false)
  );
  const [photos, setPhotos] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleToggleAck = (index: number) => {
    const newAcks = [...acknowledgments];
    newAcks[index] = !newAcks[index];
    setAcknowledgments(newAcks);
  };

  const clearSignature = () => {
    sigPad.current?.clear();
  };

  const handleSubmit = async () => {
    // Validation
    if (template.requiresSignature && sigPad.current?.isEmpty()) {
      toast.error("Signature is required");
      return;
    }
    if (template.requiresPrintedName && !printedName.trim()) {
      toast.error("Printed name is required");
      return;
    }
    if (template.requiresInitials && !initials.trim()) {
      toast.error("Initials are required");
      return;
    }
    if (acknowledgments.some(ack => !ack)) {
      toast.error("All acknowledgments must be checked");
      return;
    }

    setIsSubmitting(true);
    try {
      let signatureUrl = "";
      if (template.requiresSignature && sigPad.current) {
        // Manually retrieve and trim canvas to bypass the failing getTrimmedCanvas internal dependency
        const rawCanvas = sigPad.current.getCanvas();
        const trimmed = trimCanvas(rawCanvas);
        signatureUrl = trimmed.toDataURL("image/png");
      }

      // Upload photos if any
      const photoUrls = [];
      for (let i = 0; i < photos.length; i++) {
        // Since Firebase storage rules might block unstructured uploads, we will compress to Base64
        // and store these as blobs. Form photos shouldn't be huge.
        const compressed = await resizeImage(photos[i], 800);
        photoUrls.push(compressed);
      }

      const signedForm = {
        formId: template.id,
        formVersion: template.version,
        formTitle: template.title,
        appointmentId,
        clientId,
        customerId: clientId, // Backward compatibility
        signature: signatureUrl,
        printedName,
        date,
        initials,
        photos: photoUrls,
        acknowledgments,
        signedAt: serverTimestamp()
      };

      const docRef = await addDoc(collection(db, "signed_forms"), signedForm);
      setIsSuccess(true);
      toast.success("Form signed successfully");
      
      // Delay dismissal to show success state
      setTimeout(() => {
        onComplete({ id: docRef.id, ...signedForm, signedAt: new Date().toISOString() });
      }, 1500);
    } catch (error) {
      console.error("Error saving signed form:", error);
      try {
        handleFirestoreError(error, OperationType.CREATE, "signed_forms");
      } catch (err: any) {
        toast.error(`Failed to save signed form: ${err.message}`);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-6 animate-in fade-in zoom-in duration-500">
        <div className="w-24 h-24 bg-green-500/10 rounded-full flex items-center justify-center">
          <CheckCircle2 className="w-12 h-12 text-green-500 animate-bounce" />
        </div>
        <div className="text-center">
          <h3 className="text-2xl font-black uppercase tracking-tighter">Protocol Complete</h3>
          <p className="text-gray-500 font-medium">Your signature has been securely archived.</p>
        </div>
      </div>
    );
  }

  return (
    <Card className="border-none shadow-none bg-white">
      <CardHeader className="px-0 pt-0 pb-6 border-b">
        <CardTitle className="text-2xl font-black tracking-tighter uppercase">{template.title}</CardTitle>
        <p className="text-sm text-gray-500">Please review the content below and provide the required information.</p>
      </CardHeader>
      <CardContent className="px-0 py-6 space-y-8">
        {/* Form Content */}
        <div className="prose prose-sm max-w-none p-6 bg-gray-50 rounded-xl border border-gray-200 max-h-96 overflow-y-auto text-gray-900 prose-headings:text-gray-900 prose-p:text-gray-900 prose-a:text-primary prose-strong:text-gray-900 prose-ul:text-gray-900 prose-li:text-gray-900">
          <ReactMarkdown>{template.content}</ReactMarkdown>
        </div>

        {/* Acknowledgments */}
        {template.acknowledgments?.length > 0 && (
          <div className="space-y-4">
            <Label className="text-gray-900 text-base font-bold">Acknowledgments</Label>
            <div className="space-y-3">
              {template.acknowledgments.map((ack: string, index: number) => (
                <div key={index} className="flex items-start space-x-3 p-4 rounded-xl border border-gray-100 bg-white hover:border-primary/20 transition-colors cursor-pointer" onClick={() => handleToggleAck(index)}>
                  <Checkbox 
                    id={`ack-${index}`} 
                    checked={acknowledgments[index]}
                    onCheckedChange={() => handleToggleAck(index)}
                    className="mt-1"
                  />
                  <Label htmlFor={`ack-${index}`} className="text-gray-900 text-sm font-medium leading-relaxed cursor-pointer">{ack}</Label>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Required Fields */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {template.requiresPrintedName && (
            <div className="space-y-2">
              <Label className="text-gray-900">Printed Name</Label>
              <Input 
                placeholder="Full Legal Name" 
                value={printedName}
                onChange={e => setPrintedName(e.target.value)}
                className="bg-white border-gray-200 text-gray-900"
              />
            </div>
          )}
          {template.requiresInitials && (
            <div className="space-y-2">
              <Label className="text-gray-900">Initials</Label>
              <Input 
                placeholder="Initials" 
                value={initials}
                onChange={e => setInitials(e.target.value)}
                className="bg-white border-gray-200 text-gray-900"
              />
            </div>
          )}
          {template.requiresDate && (
            <div className="space-y-2">
              <Label className="text-gray-900">Date</Label>
              <Input 
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="bg-white border-gray-200 text-gray-900"
              />
            </div>
          )}
        </div>

        {/* Signature */}
        {template.requiresSignature && (
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label>Signature</Label>
              <Button variant="ghost" size="sm" onClick={clearSignature} className="text-xs text-gray-500 hover:text-red-600">Clear</Button>
            </div>
            <div className="border-2 border-dashed border-gray-200 rounded-xl bg-gray-50 overflow-hidden">
              <SignatureCanvas 
                ref={sigPad}
                penColor="black"
                canvasProps={{
                  className: "w-full h-48 cursor-crosshair"
                }}
              />
            </div>
          </div>
        )}

        {/* Photos */}
        {template.requiresPhoto && (
          <div className="space-y-2">
            <Label>Required Photos</Label>
            <div className="flex flex-wrap gap-4">
              {photos.map((photo, index) => (
                <div key={index} className="relative w-24 h-24 rounded-xl overflow-hidden border">
                  <img src={photo} alt={`Photo ${index + 1}`} className="w-full h-full object-cover" />
                  <Button 
                    variant="destructive" 
                    size="icon" 
                    className="absolute top-1 right-1 h-6 w-6 rounded-full"
                    onClick={() => setPhotos(prev => prev.filter((_, i) => i !== index))}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ))}
              <Button 
                variant="outline" 
                className="h-24 w-24 flex-col gap-2 border-dashed"
                onClick={() => document.getElementById('form-photo-upload')?.click()}
              >
                <Camera className="w-6 h-6 text-gray-400" />
                <span className="text-[10px] text-gray-500">Add Photo</span>
              </Button>
              <input 
                id="form-photo-upload"
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  
                  const reader = new FileReader();
                  reader.onload = (event) => {
                    setPhotos(prev => [...prev, event.target?.result as string]);
                  };
                  reader.readAsDataURL(file);
                }}
              />
            </div>
          </div>
        )}

        <div className="flex gap-3 pt-6 border-t">
          {!template.isMandatory && (
            <Button variant="outline" onClick={onCancel} disabled={isSubmitting} className="flex-1 font-bold h-12">Cancel</Button>
          )}
          <Button 
            onClick={handleSubmit} 
            disabled={isSubmitting}
            className={cn("flex-1 bg-primary hover:bg-red-700 font-bold h-12", template.isMandatory && "w-full")}
          >
            {isSubmitting ? "Saving..." : "Sign & Complete"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
