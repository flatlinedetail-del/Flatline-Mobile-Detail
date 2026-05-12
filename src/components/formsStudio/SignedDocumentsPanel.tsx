import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody } from "@/components/ui/dialog";
import {
  Search, FileSignature, CheckCircle2, ShieldCheck, Eye, Download, Clock, FileText,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { tsToDate } from "./studioUtils";
import type { StudioFormTemplate } from "../../types/waiver";

interface Props {
  signedForms: any[];
  templates: StudioFormTemplate[];
}

export function SignedDocumentsPanel({ signedForms, templates }: Props) {
  const [search, setSearch] = useState("");
  const [templateFilter, setTemplateFilter] = useState<string>("all");
  const [previewDoc, setPreviewDoc] = useState<any | null>(null);

  const list = useMemo(() => {
    return [...signedForms]
      .map(s => ({ ...s, _signedAt: tsToDate(s.signedAt) }))
      .filter(s => {
        if (templateFilter !== "all" && s.formId !== templateFilter) return false;
        if (search.trim()) {
          const q = search.toLowerCase();
          const hay = `${s.formTitle ?? ""} ${s.printedName ?? ""} ${s.clientId ?? ""}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => (b._signedAt?.getTime?.() ?? 0) - (a._signedAt?.getTime?.() ?? 0));
  }, [signedForms, search, templateFilter]);

  if (signedForms.length === 0) {
    return (
      <Card className="border-white/10 bg-[#0B0B0B] rounded-3xl overflow-hidden shadow-2xl">
        <CardContent className="p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-4">
            <FileSignature className="w-6 h-6 text-emerald-300" />
          </div>
          <h3 className="text-base font-black uppercase tracking-tight text-white">No Signed Documents Yet</h3>
          <p className="text-xs text-white/40 mt-2 max-w-sm mx-auto">
            Once customers sign a waiver, every signed copy is captured here with a tamper-evident audit trail —
            signer name, date, IP/user-agent, and document snapshot.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <Card className="border-white/10 bg-[#0B0B0B] rounded-3xl overflow-hidden shadow-2xl">
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
          <div className="md:col-span-7 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by waiver title, signer name…"
              className="bg-white/5 border-white/10 text-white pl-10 h-10 rounded-xl"
            />
          </div>
          <div className="md:col-span-4">
            <Select value={templateFilter} onValueChange={setTemplateFilter}>
              <SelectTrigger className="bg-white/5 border-white/10 text-white h-10 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Templates</SelectItem>
                {templates.map(t => (
                  <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-1 text-right text-[10px] font-black uppercase tracking-widest text-white/40">
            {list.length}/{signedForms.length}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {list.map(doc => (
          <Card
            key={doc.id}
            className="border-white/10 bg-[#0B0B0B] rounded-2xl overflow-hidden shadow-xl hover:border-white/20 transition group"
          >
            <CardContent className="p-5 space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-5 h-5 text-emerald-300" />
                </div>
                <Badge className="bg-emerald-500/15 text-emerald-300 border-none text-[9px] font-black uppercase tracking-widest">
                  Signed
                </Badge>
              </div>

              <div>
                <p className="text-sm font-black text-white truncate">{doc.formTitle ?? "Waiver"}</p>
                <p className="text-[10px] uppercase tracking-widest text-white/40 font-black mt-0.5">
                  v{doc.formVersion ?? 1}
                </p>
              </div>

              <div className="space-y-1 text-xs">
                <Row label="Signer" value={doc.printedName ?? "—"} />
                <Row label="Job" value={doc.appointmentId ? doc.appointmentId.slice(0, 10) + "…" : "—"} mono />
                <Row label="Signed" value={doc._signedAt ? doc._signedAt.toLocaleString() : "—"} />
              </div>

              <div className="flex gap-2 pt-2 border-t border-white/5">
                <Button
                  onClick={() => setPreviewDoc(doc)}
                  className="flex-1 bg-white/5 hover:bg-white/10 text-white font-black uppercase tracking-widest rounded-xl text-[10px] h-9 border border-white/10"
                >
                  <Eye className="w-3.5 h-3.5 mr-1.5" />
                  View
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Preview */}
      {previewDoc && (
        <Dialog open onOpenChange={(o) => !o && setPreviewDoc(null)}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>{previewDoc.formTitle}</DialogTitle>
            </DialogHeader>
            <DialogBody className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
              <div className="bg-white text-black rounded-2xl p-6 space-y-4">
                <div className="border-b pb-3">
                  <h2 className="text-xl font-black uppercase tracking-tight">{previewDoc.formTitle}</h2>
                  <p className="text-[10px] uppercase tracking-widest font-black text-black/50 mt-1">
                    Version {previewDoc.formVersion ?? 1}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4 text-xs">
                  <Field label="Signer Name" value={previewDoc.printedName ?? "—"} />
                  <Field label="Date" value={previewDoc.date ?? "—"} />
                  <Field label="Initials" value={previewDoc.initials ?? "—"} />
                  <Field
                    label="Signed At"
                    value={tsToDate(previewDoc.signedAt)?.toLocaleString() ?? "—"}
                  />
                </div>

                {previewDoc.signature && (
                  <div>
                    <p className="text-[10px] uppercase tracking-widest font-black text-black/50 mb-2">Signature</p>
                    <div className="border-2 border-dashed border-black/15 rounded-xl p-3 bg-white">
                      <img src={previewDoc.signature} alt="signature" className="max-h-32 mx-auto" />
                    </div>
                  </div>
                )}

                {Array.isArray(previewDoc.acknowledgments) && previewDoc.acknowledgments.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-widest font-black text-black/50 mb-2">Acknowledgments</p>
                    <ul className="space-y-1">
                      {previewDoc.acknowledgments.map((v: boolean, i: number) => (
                        <li key={i} className="flex items-center gap-2 text-xs">
                          <CheckCircle2 className={cn("w-3.5 h-3.5", v ? "text-emerald-600" : "text-black/20")} />
                          <span className={v ? "text-black" : "text-black/40"}>Acknowledgment #{i + 1}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {previewDoc.userAgent && (
                  <p className="text-[9px] text-black/30 uppercase tracking-widest font-black border-t pt-3 break-all">
                    Audit · {previewDoc.userAgent}
                  </p>
                )}
              </div>
            </DialogBody>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[10px] uppercase tracking-widest text-white/40 font-black">{label}</span>
      <span className={cn("text-white/80 truncate", mono && "font-mono text-[10px]")}>{value}</span>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest font-black text-black/50">{label}</p>
      <p className="text-sm text-black font-bold">{value}</p>
    </div>
  );
}
