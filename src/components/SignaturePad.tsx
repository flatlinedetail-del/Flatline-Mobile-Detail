import React, { useRef, useState } from "react";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { X, Check, Eraser } from "lucide-react";

interface SignaturePadProps {
  onSave: (dataUrl: string) => void;
  onCancel: () => void;
  title?: string;
}

export default function SignaturePad({ onSave, onCancel, title = "Customer Signature" }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = ("touches" in e) ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = ("touches" in e) ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = ("touches" in e) ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = ("touches" in e) ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const save = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onSave(canvas.toDataURL("image/png"));
  };

  return (
    <Card className="w-full max-w-md mx-auto shadow-2xl border-none overflow-hidden rounded-2xl">
      <CardHeader className="bg-black text-white border-b border-white/10">
        <CardTitle className="text-lg font-black flex items-center justify-between uppercase tracking-tighter">
          {title}
          <Button variant="ghost" size="icon" onClick={onCancel} className="text-white/50 hover:text-white hover:bg-white/10"><X className="w-4 h-4" /></Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0 bg-white">
        <canvas
          ref={canvasRef}
          width={400}
          height={200}
          className="w-full h-48 bg-white cursor-crosshair touch-none"
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />
        <div className="p-4 bg-gray-50 border-t flex justify-between gap-3">
          <Button variant="outline" onClick={clear} className="flex-1 font-bold border-gray-200">
            <Eraser className="w-4 h-4 mr-2" /> Clear
          </Button>
          <Button onClick={save} className="flex-1 bg-primary hover:bg-red-700 font-bold">
            <Check className="w-4 h-4 mr-2" /> Save Signature
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
