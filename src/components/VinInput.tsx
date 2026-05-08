import { useState } from "react";
import { Camera, Clock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface VinInputProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  className?: string;
  inputClassName?: string;
  /** forwarded to the inner <Input> so FormData.get(name) still works */
  name?: string;
  id?: string;
  showLabel?: boolean;
  labelClassName?: string;
}

/**
 * Reusable VIN input with optional BarcodeDetector camera-scan.
 * Works in controlled mode (value + onChange).
 * Pass name="" to keep the inner <input name="vin"> for uncontrolled form submission.
 */
export function VinInput({
  value,
  onChange,
  label = "VIN (Optional)",
  placeholder = "17-character VIN",
  disabled = false,
  readOnly = false,
  className,
  inputClassName,
  name,
  id,
  showLabel = true,
  labelClassName,
}: VinInputProps) {
  const [isScanning, setIsScanning] = useState(false);

  const handleScan = async () => {
    if (!("BarcodeDetector" in window)) {
      toast.error(
        "Barcode scanning is not supported on this device/browser. Please enter VIN manually."
      );
      return;
    }
    setIsScanning(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      const video = document.createElement("video");
      video.srcObject = stream;
      video.setAttribute("playsinline", "true");
      await video.play();

      // @ts-ignore
      const detector = new (window as any).BarcodeDetector({
        formats: ["code_128", "code_39", "qr_code", "data_matrix"],
      });

      let detected = false;

      const scanLoop = async () => {
        if (detected) return;
        try {
          const barcodes = await detector.detect(video);
          if (barcodes.length > 0) {
            detected = true;
            const raw = barcodes[0].rawValue || "";
            const vin = raw
              .replace(/[^A-HJ-NPR-Z0-9]/gi, "")
              .toUpperCase()
              .slice(0, 17);
            if (vin.length === 17) {
              onChange(vin);
              toast.success(`VIN scanned: ${vin}`);
            } else {
              toast.warning(
                "Could not extract a valid 17-char VIN. Please verify manually."
              );
              onChange(raw.toUpperCase().slice(0, 17));
            }
            stream.getTracks().forEach((t) => t.stop());
            setIsScanning(false);
            return;
          }
        } catch (_) {}
        if (!detected) requestAnimationFrame(scanLoop);
      };

      // Timeout after 8 seconds
      setTimeout(() => {
        if (!detected) {
          stream.getTracks().forEach((t) => t.stop());
          setIsScanning(false);
          toast.info("Scan timed out. Please try again or enter VIN manually.");
        }
      }, 8000);

      requestAnimationFrame(scanLoop);
    } catch (err: any) {
      console.error("VIN scan error:", err);
      toast.error(
        "Camera access denied or unavailable. Please enter VIN manually."
      );
      setIsScanning(false);
    }
  };

  return (
    <div className={cn("space-y-2", className)}>
      {showLabel && (
        <Label
          htmlFor={id}
          className={cn(
            "font-black uppercase tracking-widest text-[10px] text-white",
            labelClassName
          )}
        >
          {label}
        </Label>
      )}
      <div className="flex gap-2">
        <Input
          id={id}
          name={name}
          value={value}
          onChange={(e) =>
            onChange(
              e.target.value
                .replace(/[^A-HJ-NPR-Z0-9]/gi, "")
                .toUpperCase()
                .slice(0, 17)
            )
          }
          placeholder={placeholder}
          maxLength={17}
          disabled={disabled}
          readOnly={readOnly}
          className={cn(
            "flex-1 bg-white/5 border-white/10 text-white rounded-xl h-12 font-bold tracking-widest font-mono",
            inputClassName
          )}
        />
        <button
          type="button"
          onClick={handleScan}
          disabled={isScanning || disabled || readOnly}
          title="Scan VIN barcode with camera"
          className="h-12 px-3 rounded-xl bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest shrink-0"
        >
          {isScanning ? (
            <>
              <Clock className="w-4 h-4 animate-spin" />
              <span className="hidden sm:inline">Scanning</span>
            </>
          ) : (
            <>
              <Camera className="w-4 h-4" />
              <span className="hidden sm:inline">Scan</span>
            </>
          )}
        </button>
      </div>
      {value.length === 17 && (
        <p className="text-[9px] text-emerald-400 font-bold uppercase tracking-widest">
          ✓ Valid VIN length
        </p>
      )}
    </div>
  );
}
