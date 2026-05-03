import { useState, useEffect } from "react";
import { collection, query, onSnapshot, addDoc, serverTimestamp, orderBy, getDocs, doc, deleteDoc, updateDoc, Timestamp, limit, where } from "firebase/firestore";
import { db, storage } from "../firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useAuth } from "../hooks/useAuth";
import { PageHeader } from "../components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Receipt, Plus, Search, Filter, Trash2, Calendar, DollarSign, Tag, Link as LinkIcon, ExternalLink, Loader2, Camera, FileText, Sparkles, Upload, Edit2, RefreshCcw, Zap } from "lucide-react";
import { toast } from "sonner";
import { syncService } from "../services/syncService";
import { format } from "date-fns";
import { cn, formatCurrency } from "@/lib/utils";
import { Category } from "../types";
import { StableInput } from "../components/StableInput";
import { SearchableSelector } from "../components/SearchableSelector";
import { NumberInput } from "../components/NumberInput";
import { handleFirestoreError, OperationType } from "../firebase";
import { analyzeReceipt } from "../services/gemini";

import { DeleteConfirmationDialog } from "../components/DeleteConfirmationDialog";
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle, 
  AlertDialogTrigger 
} from "@/components/ui/alert-dialog";

export default function Expenses() {
  const { profile, loading: authLoading, settings: authSettings, canAccessAdmin } = useAuth();
  const [expenses, setExpenses] = useState<any[]>([]);

  if (authLoading) return <div className="flex items-center justify-center h-screen bg-black">
    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-primary"></div>
  </div>;

  const canAccess = canAccessAdmin;

  if (!profile || !canAccess) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] space-y-4">
        <Receipt className="w-16 h-16 text-red-500" />
        <h2 className="text-2xl font-black text-white uppercase tracking-tight">Access Restricted</h2>
        <p className="text-white/60 font-medium text-center max-w-md px-6">
          Administrative financial isolation protocol is active. Expense management is restricted to owners and core administrators.
        </p>
        <Button onClick={() => window.history.back()} variant="outline" className="border-white/10 text-white/40 hover:text-white">Go Back</Button>
      </div>
    );
  }

  const [appointments, setAppointments] = useState<any[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingExpense, setEditingExpense] = useState<any | null>(null);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [newExpense, setNewExpense] = useState({
    description: "",
    amount: "",
    date: new Date().toISOString().split("T")[0],
    category: "Other",
    receiptUrl: ""
  });

  const fetchExpenses = async (showToast = false) => {
    if (showToast) toast.loading("Syncing Ledger...", { id: "sync-expenses" });
    setLoading(true);
    try {
      const expensesQuery = query(collection(db, "expenses"), orderBy("date", "desc"), limit(200));
      const snapshot = await getDocs(expensesQuery);
      let expensesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Merge pending offline expenses
      expensesData = await syncService.injectPendingRecords("expenses", expensesData);
      
      setExpenses(expensesData);
      
      const [appointmentsSnap, categoriesSnap] = await Promise.all([
        getDocs(query(collection(db, "appointments"), orderBy("scheduledAt", "desc"), limit(50))),
        getDocs(query(collection(db, "categories"), where("isActive", "==", true)))
      ]);

      setAppointments(appointmentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setCategories(categoriesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Category)));
      
      if (showToast) toast.success("Ledger Synchronized", { id: "sync-expenses" });
    } catch (error) {
      console.error("Error fetching expense data:", error);
      if (showToast) toast.error("Sync Failed", { id: "sync-expenses" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading || !profile || !canAccess) return;
    fetchExpenses();
  }, [profile, authLoading]);

  useEffect(() => {
    if (categories.length > 0 && newExpense.category === "Other") {
      const firstExpenseCat = categories.find(c => c.type === "expense" && c.isActive);
      if (firstExpenseCat) {
        setNewExpense(prev => ({ ...prev, category: firstExpenseCat.name }));
      }
    }
  }, [categories]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setReceiptFile(file);
    
    // Auto-analyze if it's an image or PDF
    if (file.type.startsWith("image/") || file.type === "application/pdf") {
      // Add debounce check
      const now = Date.now();
      const lastAIAction = Number(localStorage.getItem('last_receipt_ai_action') || 0);
      if (now - lastAIAction < 3000) {
        toast.info("Please wait a moment between receipt analyses.");
        return;
      }
      localStorage.setItem('last_receipt_ai_action', now.toString());

      setIsAnalyzing(true);
      try {
        console.log("[Expenses] Receipt Analysis Triggered");
        const reader = new FileReader();
        reader.onload = async (event) => {
          try {
            const base64 = event.target?.result as string;
            const data = await analyzeReceipt(base64);
            
            setNewExpense(prev => ({
              ...prev,
              description: data.vendor || prev.description,
              amount: data.totalAmount?.toString() || prev.amount,
              date: data.date ? new Date(data.date).toISOString().split("T")[0] : prev.date,
              category: data.categorySuggestion || prev.category
            }));
            toast.success("Receipt analyzed! Fields auto-filled.");
          } catch (err: any) {
            console.error("Analysis error:", err);
            if (err.message?.includes("QUOTA_EXCEEDED")) {
              toast.error("Monthly spending cap reached. Please manage your limits at ai.studio/spend", {
                duration: 10000,
                action: {
                  label: "Manage Cap",
                  onClick: () => window.open("https://ai.studio/spend", "_blank")
                }
              });
            } else {
              toast.error("Could not analyze receipt automatically.");
            }
          } finally {
            setIsAnalyzing(false);
          }
        };
        reader.onerror = () => {
          toast.error("Failed to read file");
          setIsAnalyzing(false);
        };
        reader.readAsDataURL(file);
      } catch (error) {
        console.error("File reading error:", error);
        toast.error("Failed to process file.");
        setIsAnalyzing(false);
      }
    }
  };

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newExpense.description || !newExpense.amount) {
      toast.error("Please fill in description and amount");
      return;
    }

    setLoading(true);
    try {
      let finalReceiptUrl = newExpense.receiptUrl;

      if (receiptFile) {
        const storageRef = ref(storage, `expenses/${Date.now()}_${receiptFile.name}`);
        await uploadBytes(storageRef, receiptFile);
        finalReceiptUrl = await getDownloadURL(storageRef);
      }

      const expenseData = {
        description: newExpense.description,
        amount: parseFloat(newExpense.amount),
        category: newExpense.category,
        date: Timestamp.fromDate(new Date(newExpense.date)),
        receiptUrl: finalReceiptUrl,
        linkedAppointmentId: selectedAppointmentId || null,
        createdBy: profile?.uid,
        updatedAt: serverTimestamp(),
      };

      if (editingExpense) {
        try {
          await updateDoc(doc(db, "expenses", editingExpense.id), expenseData);
          toast.success("Expense updated!");
        } catch (err) {
          console.warn("Direct update failed, enqueuing...", err);
          await syncService.enqueueTask("expenses", expenseData, 'update', editingExpense.id);
          toast.info("Offline: Update saved locally and will sync later");
        }
      } else {
        try {
          await addDoc(collection(db, "expenses"), {
            ...expenseData,
            createdAt: serverTimestamp(),
          });
          toast.success("Expense recorded!");
        } catch (err) {
          console.warn("Direct add failed, enqueuing...", err);
          await syncService.enqueueTask("expenses", {
            ...expenseData,
            createdAt: Date.now()
          }, 'create');
          toast.info("Offline: Expense saved locally and will sync later");
        }
      }
      setShowAddDialog(false);
      setEditingExpense(null);
      setNewExpense({
        description: "",
        amount: "",
        date: new Date().toISOString().split("T")[0],
        category: categories.find(c => c.type === "expense" && c.isActive)?.name || "Other",
        receiptUrl: ""
      });
      setReceiptFile(null);
      setSelectedAppointmentId("");
    } catch (error) {
      console.error("Error saving expense:", error);
      toast.error(editingExpense ? "Failed to update expense" : "Failed to record expense");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteExpense = async (id: string) => {
    console.log("Attempting to delete expense:", id);
    if (!id) {
      toast.error("Invalid expense ID");
      return;
    }

    // Optimistic update
    const previousExpenses = [...expenses];
    setExpenses(prev => prev.filter(exp => exp.id !== id));

    try {
      await deleteDoc(doc(db, "expenses", id));
      toast.success("Expense deleted successfully");
    } catch (error) {
      console.error("Error deleting expense:", error);
      // Rollback on error
      setExpenses(previousExpenses);
      try {
        handleFirestoreError(error, OperationType.DELETE, `expenses/${id}`);
      } catch (err: any) {
        toast.error(`Failed to delete expense: ${err.message}`);
      }
    }
  };

  const filteredExpenses = expenses.filter(exp => 
    (exp.description?.toLowerCase() || "").includes(searchTerm.toLowerCase()) ||
    (exp.category?.toLowerCase() || "").includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Expense REGISTRY" 
        accentWord="REGISTRY" 
        subtitle="Operational Overhead & Capital Expenditure Tracking"
        actions={
          <div className="flex items-center gap-3">
            <Button 
              variant="outline" 
              className={cn("border-white/10 bg-white/5 text-white hover:bg-white/10 rounded-xl px-6 h-12 font-bold uppercase tracking-widest text-[10px]", loading && "animate-spin")}
              onClick={() => fetchExpenses(true)}
              disabled={loading}
            >
              <RefreshCcw className="w-4 h-4 mr-2 text-primary" />
              Sync Ledger
            </Button>
            <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
              <DialogTrigger render={
                <Button className="bg-primary hover:bg-[#2A6CFF] text-white font-black h-12 px-8 rounded-xl uppercase tracking-[0.2em] text-[10px] shadow-glow-blue transition-all hover:scale-105">
                  <Plus className="w-4 h-4 mr-2" />
                  Log Expenditure
                </Button>
              } />
              <DialogContent className="max-w-xl bg-card rounded-3xl border-none shadow-2xl shadow-black p-0 overflow-hidden">
              <DialogHeader className="p-8 bg-black/40 border-b border-white/5">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
                    <DollarSign className="w-6 h-6" />
                  </div>
                  <div>
                    <DialogTitle className="text-2xl font-black text-white uppercase tracking-tighter">{editingExpense ? "Modify Expenditure" : "New Tactical Expenditure"}</DialogTitle>
                    <p className="text-[10px] text-white/70 font-black uppercase tracking-[0.2em] mt-1">Operational Cost Tracking Protocol</p>
                  </div>
                </div>
              </DialogHeader>
              <form onSubmit={handleCreateExpense} className="flex-1 overflow-y-auto p-8 space-y-8">
                <div className="space-y-6">
                  <div className="flex items-center gap-6 p-6 bg-white/5 rounded-2xl border border-white/10 group hover:border-primary/30 transition-all">
                    <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20 shadow-lg shadow-primary/5">
                      <Camera className="w-8 h-8" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-black text-white uppercase tracking-tight">Receipt Management</p>
                      <p className="text-[10px] text-white/70 font-bold uppercase tracking-widest mt-1">Upload or Import Mission Receipts</p>
                    </div>
                    <Button 
                      type="button" 
                      variant="outline" 
                      className="rounded-xl font-black uppercase tracking-widest text-[10px] h-12 px-6 border-white/10 hover:bg-white/5 bg-primary/10 text-primary border-primary/20"
                      onClick={() => document.getElementById('receipt-upload')?.click()}
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      {receiptFile ? "Change File" : "Upload / Import"}
                    </Button>
                    <input 
                      id="receipt-upload" 
                      type="file" 
                      accept="image/*,application/pdf" 
                      className="hidden" 
                      onChange={handleFileChange}
                    />
                  </div>

                  {isAnalyzing && (
                    <div className="flex items-center gap-3 p-4 bg-primary/5 text-primary rounded-2xl border border-primary/20 animate-pulse">
                      <Sparkles className="w-4 h-4" />
                      <span className="text-[10px] font-black uppercase tracking-[0.2em]">AI Analyzing Mission Data...</span>
                    </div>
                  )}

                  {receiptFile && (
                    <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/10">
                      <FileText className="w-4 h-4 text-primary" />
                      <span className="text-[10px] font-bold text-white/70 uppercase tracking-widest truncate flex-1">{receiptFile.name}</span>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-white bg-red-500/10 hover:bg-red-500 hover:text-white" onClick={() => setReceiptFile(null)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>

                <div className="space-y-6">
                  <div className="space-y-3">
                    <Label htmlFor="description" className="font-black uppercase tracking-widest text-[10px] text-white/70">Mission Description</Label>
                    <StableInput 
                      id="description" 
                      value={newExpense.description}
                      onValueChange={val => setNewExpense(prev => ({ ...prev, description: val }))}
                      placeholder="e.g. Tactical Microfiber Resupply" 
                      required 
                      className="bg-white/5 border-white/10 h-12 rounded-xl font-bold text-white" 
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-3">
                      <Label htmlFor="amount" className="font-black uppercase tracking-widest text-[10px] text-white/70">Financial Value ($)</Label>
                      <NumberInput 
                        value={newExpense.amount}
                        onValueChange={val => setNewExpense(prev => ({ ...prev, amount: val.toString() }))}
                        placeholder="0.00" 
                        required 
                        className="bg-white/5 border-white/10 h-12 rounded-xl font-bold text-white" 
                      />
                    </div>
                    <div className="space-y-3">
                      <Label htmlFor="date" className="font-black uppercase tracking-widest text-[10px] text-white">Transaction Date</Label>
                      <Input 
                        id="date" 
                        type="date" 
                        value={newExpense.date}
                        onChange={e => setNewExpense(prev => ({ ...prev, date: e.target.value }))}
                        required 
                        className="bg-white/5 border-white/10 h-12 rounded-xl font-bold text-white" 
                      />
                    </div>
                  </div>
                  <div className="space-y-3">
                    <Label htmlFor="category" className="font-black uppercase tracking-widest text-[10px] text-white">Operational Category</Label>
                    <Select 
                      value={newExpense.category}
                      onValueChange={val => setNewExpense(prev => ({ ...prev, category: val }))}
                    >
                      <SelectTrigger className="bg-white/5 border-white/10 text-white h-12 rounded-xl font-bold">
                        <SelectValue placeholder="Select Category" />
                      </SelectTrigger>
                      <SelectContent className="bg-card border-white/5 text-white">
                        {categories.filter(c => c.type === "expense" && c.isActive).map(cat => (
                          <SelectItem key={cat.id} value={cat.name}>{cat.name}</SelectItem>
                        ))}
                        {categories.filter(c => c.type === "expense" && c.isActive).length === 0 && (
                          <>
                            <SelectItem value="supplies">Supplies</SelectItem>
                            <SelectItem value="fuel">Fuel</SelectItem>
                            <SelectItem value="marketing">Marketing</SelectItem>
                            <SelectItem value="insurance">Insurance</SelectItem>
                            <SelectItem value="maintenance">Maintenance</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-3">
                    <Label htmlFor="receiptUrl" className="font-black uppercase tracking-widest text-[10px] text-white">Digital Receipt URL (Optional)</Label>
                    <StableInput 
                      id="receiptUrl" 
                      value={newExpense.receiptUrl}
                      onValueChange={val => setNewExpense(prev => ({ ...prev, receiptUrl: val }))}
                      placeholder="https://..." 
                      className="bg-white/5 border-white/10 h-12 rounded-xl font-bold text-white" 
                    />
                  </div>
                  <div className="space-y-3">
                    <Label htmlFor="appointmentId" className="font-black uppercase tracking-widest text-[10px] text-white">Linked Mission (Optional)</Label>
                    <SearchableSelector
                      options={[
                        { value: "none", label: "None" },
                        ...appointments.map(app => ({
                          value: app.id,
                          label: `${format(app.scheduledAt?.toDate(), "MM/dd")} - ${app.customerName}`,
                          description: app.vehicleInfo
                        }))
                      ]}
                      value={selectedAppointmentId}
                      onSelect={(val) => setSelectedAppointmentId(val === "none" ? "" : val)}
                      placeholder="Search missions..."
                    />
                  </div>
                </div>

                <div className="flex items-center gap-4 pt-6 border-t border-white/5">
                  <Button variant="ghost" type="button" onClick={() => setShowAddDialog(false)} className="flex-1 text-white hover:text-white font-black uppercase tracking-widest text-[10px] h-14">
                    Abort
                  </Button>
                  <Button type="submit" className="flex-[2] bg-primary hover:bg-[#2A6CFF] text-white font-black h-14 rounded-2xl uppercase tracking-[0.2em] text-xs shadow-glow-blue transition-all hover:scale-105">
                    {editingExpense ? "Authorize Modification" : "Authorize Expenditure"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
          </div>
        }
      />

      <Card className="border-white/5 bg-card shadow-xl overflow-hidden mt-8">
        <CardHeader className="border-b border-white/5 bg-black/40 p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
              <Input 
                placeholder="Search ledger..." 
                className="pl-10 bg-black/40 border-white/10 text-white rounded-full h-10"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-black/20 border-b border-white/5">
              <TableRow className="hover:bg-transparent border-white/5">
                <TableHead className="font-black uppercase tracking-widest text-[10px] text-white h-14">Date</TableHead>
                <TableHead className="font-black uppercase tracking-widest text-[10px] text-white h-14">Description</TableHead>
                <TableHead className="font-black uppercase tracking-widest text-[10px] text-white h-14">Category</TableHead>
                <TableHead className="font-black uppercase tracking-widest text-[10px] text-white h-14">Amount</TableHead>
                <TableHead className="font-black uppercase tracking-widest text-[10px] text-white h-14">Receipt</TableHead>
                <TableHead className="font-black uppercase tracking-widest text-[10px] text-white h-14 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-20 text-white/20 font-black uppercase tracking-[0.2em] text-[10px]">Synchronizing Financial Data...</TableCell>
                </TableRow>
              ) : filteredExpenses.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-20 text-white/20 font-black uppercase tracking-[0.2em] text-[10px]">No Strategic Expenditures Recorded</TableCell>
                </TableRow>
              ) : (
                filteredExpenses.map((exp) => (
                  <TableRow key={exp.id} className="hover:bg-white/[0.02] transition-colors border-white/5 group">
                    <TableCell className="text-xs font-bold text-white">
                      {exp.date?.toDate ? format(exp.date.toDate(), "MMM d, yyyy") : "---"}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-bold text-white tracking-tight">{exp.description}</span>
                        {exp.linkedAppointmentId && (
                          <span className="text-[9px] text-primary font-black uppercase tracking-widest flex items-center gap-1 mt-1">
                            <Zap className="w-2.5 h-2.5" /> Mission Attached
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[9px] font-black uppercase tracking-wider bg-white/5 border-white/10 text-white">
                        {exp.category}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="font-black text-white text-sm">{formatCurrency(exp.amount)}</span>
                    </TableCell>
                    <TableCell>
                      {exp.receiptUrl ? (
                        <a href={exp.receiptUrl} target="_blank" rel="noopener noreferrer" className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-primary hover:bg-primary hover:text-white transition-all border border-white/10">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      ) : (
                        <span className="text-white/20 font-black text-xs">---</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-9 w-9 text-white hover:text-white hover:bg-white/10 rounded-xl"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingExpense(exp);
                            setNewExpense({
                              description: exp.description,
                              amount: exp.amount?.toString() || "",
                              date: exp.date?.toDate ? format(exp.date.toDate(), "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd"),
                              category: exp.category,
                              receiptUrl: exp.receiptUrl || ""
                            });
                            setSelectedAppointmentId(exp.linkedAppointmentId || "");
                            setShowAddDialog(true);
                          }}
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <DeleteConfirmationDialog
                          trigger={
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-9 w-9 text-white hover:text-primary hover:bg-primary/10 rounded-xl"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          }
                          title="Purge Expenditure?"
                          itemName={exp.description}
                          onConfirm={() => handleDeleteExpense(exp.id)}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
