import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ShieldCheck, CheckCircle2, PenLine, Camera, Calendar as CalendarIcon,
  User, Car, Briefcase, Receipt, X,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { deriveBlocksFromLegacy } from "./studioUtils";
import type { StudioFormTemplate, WaiverBlock } from "../../types/waiver";

interface Props {
  template: StudioFormTemplate;
  onClose: () => void;
}

export function CustomerPreviewModal({ template, onClose }: Props) {
  const blocks = ((template.blocks && template.blocks.length > 0)
    ? [...template.blocks].sort((a, b) => a.order - b.order)
    : deriveBlocksFromLegacy(template))
    // Hide internal-only clauses + any blocks bound to them — customers must
    // never see internal notes, regardless of how the template was authored.
    .filter(b => !(b.settings as any)?.internalOnly);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-w-3xl p-0 overflow-hidden bg-[#0B0B0B] border border-white/10"
        showCloseButton={false}
      >
        {/* Custom header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-black/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-white/40 font-black">Customer View · Preview</p>
              <p className="text-sm font-black text-white">How your customer will see this waiver</p>
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-lg hover:bg-white/5 text-white/50 hover:text-white flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Customer-facing preview */}
        <div className="max-h-[80vh] overflow-y-auto bg-gradient-to-b from-[#FAFAFA] to-white">
          <div className="max-w-2xl mx-auto p-6 md:p-10">
            {/* Brand header */}
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-[9px] font-black uppercase tracking-widest mb-3">
                <ShieldCheck className="w-3 h-3" /> Secure Digital Signing
              </div>
              <h1 className="text-2xl md:text-3xl font-black uppercase tracking-tight text-black">
                {template.customerTitle?.trim() || template.title}
              </h1>
              <p className="text-xs text-black/50 mt-2">Please review the document below and provide your signature.</p>
            </div>

            {/* Blocks */}
            <div className="space-y-5">
              {blocks.map(block => (
                <BlockView key={block.id} block={block} />
              ))}
            </div>

            {/* Submit zone */}
            <div className="mt-10 pt-6 border-t border-black/10">
              <Button
                disabled
                className="w-full h-14 bg-primary text-white font-black uppercase tracking-widest rounded-2xl text-sm"
              >
                <CheckCircle2 className="w-5 h-5 mr-2" />
                Sign & Submit (Preview)
              </Button>
              <p className="text-[9px] text-center text-black/40 mt-3 uppercase tracking-widest font-black">
                This is a preview · No data will be saved
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BlockView({ block }: { block: WaiverBlock }) {
  switch (block.type) {
    case "header":
      return <h2 className="text-xl font-black uppercase tracking-tight text-black border-b border-black/10 pb-2">{block.title}</h2>;
    case "legalText":
      return (
        <div className="bg-black/[0.02] rounded-xl p-4 border border-black/5">
          {block.title && <p className="text-sm font-black uppercase tracking-tight text-black mb-2">{block.title}</p>}
          <p className="text-sm text-black/70 leading-relaxed whitespace-pre-wrap">{block.content}</p>
        </div>
      );
    case "acknowledgmentCheckbox":
      return (
        <label className="flex items-start gap-3 p-3 rounded-xl bg-white border border-black/10 cursor-pointer hover:border-primary/30">
          <div className="w-5 h-5 rounded border-2 border-black/30 mt-0.5 shrink-0" />
          <span className="text-sm text-black flex-1">
            {block.title} {block.required && <span className="text-red-500">*</span>}
          </span>
        </label>
      );
    case "initials":
      return (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-white border border-black/10">
          <span className="text-sm font-bold text-black flex-1">{block.title}</span>
          <div className="w-24 h-10 bg-[#FAFAFA] border-2 border-dashed border-black/20 rounded flex items-center justify-center text-[9px] uppercase tracking-widest font-black text-black/30">
            Initials
          </div>
        </div>
      );
    case "signature":
      return (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-black">{block.title ?? "Signature"} {block.required && <span className="text-red-500">*</span>}</p>
            <span className="text-[9px] uppercase tracking-widest font-black text-black/30">Clear</span>
          </div>
          <div className="bg-white border-2 border-dashed border-black/20 rounded-xl h-32 flex flex-col items-center justify-center">
            <PenLine className="w-6 h-6 text-black/20 mb-1" />
            <p className="text-[10px] uppercase tracking-widest font-black text-black/30">Sign here</p>
          </div>
        </div>
      );
    case "date":
      return (
        <div className="flex items-center gap-2 text-black">
          <CalendarIcon className="w-4 h-4 text-black/40" />
          <span className="text-sm font-bold">Date:</span>
          <span className="text-sm text-black/60">{new Date().toLocaleDateString()}</span>
        </div>
      );
    case "customerInfo":
      return <AutoBlock icon={User} title={block.title ?? "Customer Information"} hint="Will be auto-filled at signing" />;
    case "vehicleInfo":
      return <AutoBlock icon={Car} title={block.title ?? "Vehicle Information"} hint="Will be auto-filled at signing" />;
    case "jobInfo":
      return <AutoBlock icon={Briefcase} title={block.title ?? "Appointment"} hint="Will be auto-filled at signing" />;
    case "serviceSummary":
      return <AutoBlock icon={Receipt} title={block.title ?? "Service Summary"} hint="Will be auto-filled at signing" />;
    case "beforeAfterPhotoAcknowledgment":
    case "preExistingDamageAcknowledgment":
    case "paymentTerms":
    case "lateFeeTerms":
    case "cancellationPolicy":
      return (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-sm font-black uppercase tracking-tight text-amber-900 mb-2">{block.title}</p>
          {block.content && <p className="text-sm text-amber-900/70 leading-relaxed whitespace-pre-wrap">{block.content}</p>}
        </div>
      );
    case "customQuestion":
      return (
        <div className="space-y-2">
          <p className="text-sm font-bold text-black">{block.title}</p>
          <div className="bg-white border border-black/10 rounded-xl px-3 py-2 text-xs text-black/30">
            Customer types response…
          </div>
        </div>
      );
    case "photoUploadRequest":
      return (
        <div className="bg-white border-2 border-dashed border-black/20 rounded-xl p-6 flex flex-col items-center">
          <Camera className="w-7 h-7 text-black/30 mb-2" />
          <p className="text-sm font-black uppercase tracking-tight text-black/60">{block.title}</p>
          <p className="text-[10px] text-black/40 mt-1">Tap to upload</p>
        </div>
      );
    default:
      return null;
  }
}

function AutoBlock({ icon: Icon, title, hint }: { icon: any; title: string; hint: string }) {
  return (
    <div className="bg-black/[0.02] border border-black/10 rounded-xl p-3 flex items-center gap-3">
      <div className="w-9 h-9 rounded-xl bg-white border border-black/10 flex items-center justify-center text-black/50">
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <p className="text-sm font-bold text-black">{title}</p>
        <p className="text-[10px] uppercase tracking-widest font-black text-black/30">{hint}</p>
      </div>
    </div>
  );
}
