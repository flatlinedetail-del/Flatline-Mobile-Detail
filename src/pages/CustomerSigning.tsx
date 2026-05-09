import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { doc, getDoc, addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { getFormInstanceByToken, updateFormInstanceStatus } from "../services/formService";
import type { FormInstance, FormTemplate } from "../types/forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Loader2, AlertCircle, FileText } from "lucide-react";
import SignatureCanvas from "react-signature-canvas";

export default function CustomerSigning() {
  const { token } = useParams<{ token: string }>();
  const [instance, setInstance] = useState<FormInstance | null>(null);
  const [template, setTemplate] = useState<FormTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const sigPad = useRef<SignatureCanvas>(null);
  const [printedName, setPrintedName] = useState("");
  const [initials, setInitials] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [acknowledgments, setAcknowledgments] = useState<boolean[]>([]);

  useEffect(() => {
    if (!token) { setError("Invalid signing link."); setLoading(false); return; }

    (async () => {
      try {
        const inst = await getFormInstanceByToken(token);
        if (!inst) { setError("This signing link is invalid or has expired."); setLoading(false); return; }
        if (inst.status === "signed") { setSubmitted(true); setLoading(false); return; }

        setInstance(inst);

        const tplSnap = await getDoc(doc(db, "form_templates", inst.templateId));
        if (!tplSnap.exists()) { setError("Form template not found."); setLoading(false); return; }

        const tpl = { id: tplSnap.id, ...tplSnap.data() } as FormTemplate;
        setTemplate(tpl);
        setAcknowledgments(new Array(tpl.acknowledgments?.length ?? 0).fill(false));
      } catch {
        setError("Unable to load form. Please try again.");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const allAcknowledged = acknowledgments.length === 0 || acknowledgments.every(Boolean);

  const canSubmit =
    template &&
    (!template.requiresSignature || (sigPad.current && !sigPad.current.isEmpty())) &&
    (!template.requiresPrintedName || printedName.trim()) &&
    (!template.requiresInitials || initials.trim()) &&
    allAcknowledged &&
    !isSubmitting;

  const handleSubmit = async () => {
    if (!canSubmit || !instance || !template) return;
    setIsSubmitting(true);

    try {
      const signatureUrl = template.requiresSignature && sigPad.current
        ? sigPad.current.getTrimmedCanvas().toDataURL("image/png")
        : "";

      await addDoc(collection(db, "signed_forms"), {
        formId: template.id,
        formVersion: template.version ?? 1,
        formTitle: template.title,
        appointmentId: instance.appointmentId,
        clientId: instance.clientId,
        vehicleId: instance.vehicleId ?? null,
        signature: signatureUrl,
        printedName,
        date,
        initials,
        photos: [],
        acknowledgments,
        signedAt: serverTimestamp(),
        userAgent: navigator.userAgent,
      });

      await updateFormInstanceStatus(instance.id, "signed", {
        signedAt: serverTimestamp(),
      });

      setSubmitted(true);
    } catch {
      setError("Failed to save signature. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-white animate-spin" />
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-6">
        <Card className="max-w-md w-full bg-[#121212] border-white/10">
          <CardContent className="p-8 text-center space-y-4">
            <CheckCircle2 className="w-16 h-16 text-emerald-400 mx-auto" />
            <h2 className="text-xl font-black text-white uppercase tracking-tight">Form Signed</h2>
            <p className="text-sm text-white/60">Thank you. Your signed form has been recorded.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-6">
        <Card className="max-w-md w-full bg-[#121212] border-white/10">
          <CardContent className="p-8 text-center space-y-4">
            <AlertCircle className="w-16 h-16 text-red-400 mx-auto" />
            <h2 className="text-xl font-black text-white uppercase tracking-tight">Error</h2>
            <p className="text-sm text-white/60">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!template || !instance) return null;

  return (
    <div className="min-h-screen bg-black p-4 md:p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <Card className="bg-[#121212] border-white/10">
          <CardHeader className="border-b border-white/5 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <CardTitle className="text-lg font-black text-white uppercase tracking-tight">
                  {template.title}
                </CardTitle>
                <p className="text-[10px] text-white/40 font-black uppercase tracking-widest mt-0.5">
                  Please review and sign below
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            <div className="prose prose-invert prose-sm max-w-none">
              <div className="whitespace-pre-wrap text-white/80 text-sm leading-relaxed bg-white/5 p-4 rounded-xl border border-white/10 max-h-64 overflow-y-auto">
                {template.content}
              </div>
            </div>

            {template.acknowledgments?.length > 0 && (
              <div className="space-y-3">
                <p className="text-[10px] font-black text-white uppercase tracking-widest">Acknowledgments</p>
                {template.acknowledgments.map((ack, idx) => (
                  <label key={idx} className="flex items-start gap-3 p-3 rounded-xl bg-white/5 border border-white/10 cursor-pointer">
                    <Checkbox
                      checked={acknowledgments[idx]}
                      onCheckedChange={(checked) => {
                        const next = [...acknowledgments];
                        next[idx] = checked === true;
                        setAcknowledgments(next);
                      }}
                      className="mt-0.5"
                    />
                    <span className="text-sm text-white/80">{ack}</span>
                  </label>
                ))}
              </div>
            )}

            {template.requiresPrintedName && (
              <div className="space-y-2">
                <label className="text-[10px] font-black text-white uppercase tracking-widest">Full Name</label>
                <Input
                  value={printedName}
                  onChange={e => setPrintedName(e.target.value)}
                  className="bg-white/5 border-white/10 text-white"
                  placeholder="Enter your full name"
                />
              </div>
            )}

            {template.requiresInitials && (
              <div className="space-y-2">
                <label className="text-[10px] font-black text-white uppercase tracking-widest">Initials</label>
                <Input
                  value={initials}
                  onChange={e => setInitials(e.target.value)}
                  className="bg-white/5 border-white/10 text-white w-32"
                  placeholder="ABC"
                  maxLength={5}
                />
              </div>
            )}

            {template.requiresDate && (
              <div className="space-y-2">
                <label className="text-[10px] font-black text-white uppercase tracking-widest">Date</label>
                <Input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="bg-white/5 border-white/10 text-white w-48"
                />
              </div>
            )}

            {template.requiresSignature && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black text-white uppercase tracking-widest">Signature</label>
                  <button
                    type="button"
                    className="text-[9px] font-black text-primary uppercase tracking-widest hover:text-primary/80"
                    onClick={() => sigPad.current?.clear()}
                  >
                    Clear
                  </button>
                </div>
                <div className="bg-white rounded-xl border-2 border-white/20 overflow-hidden">
                  <SignatureCanvas
                    ref={sigPad}
                    canvasProps={{ className: "w-full h-40" }}
                    backgroundColor="white"
                  />
                </div>
              </div>
            )}

            <Button
              className="w-full h-14 bg-primary hover:bg-primary/90 text-white font-black uppercase tracking-widest rounded-xl disabled:opacity-50"
              disabled={!canSubmit}
              onClick={handleSubmit}
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Sign & Submit
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
