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
import { Receipt, Plus, Search, Filter, Trash2, Calendar, DollarSign, Tag, Link as LinkIcon, ExternalLink, Loader2, Camera, FileText, Sparkles, Upload, Edit2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Category } from "../types";
import { StableInput } from "../components/StableInput";
import { SearchableSelector } from "../components/SearchableSelector";
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
  const { profile, loading: authLoading } = useAuth();
  const [expenses, setExpenses] = useState<any[]>([]);
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

  useEffect(() => {
    if (authLoading || !profile) return;

    setLoading(true);
    
    // Set up real-time listener for expenses
    const expensesQuery = query(collection(db, "expenses"), orderBy("date", "desc"));
    const unsubscribeExpenses = onSnapshot(expensesQuery, (snapshot) => {
      setExpenses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (error) => {
      console.error("Error listening to expenses:", error);
      setLoading(false);
    });

    // Fetch other data once
    const fetchSupportData = async () => {
      try {
        const [appointmentsSnap, categoriesSnap] = await Promise.all([
          getDocs(query(collection(db, "appointments"), orderBy("scheduledAt", "desc"), limit(50))),
          getDocs(query(collection(db, "categories"), where("isActive", "==", true)))
        ]);

        setAppointments(appointmentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setCategories(categoriesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Category)));
      } catch (error) {
        console.error("Error fetching support data:", error);
      }
    };

    fetchSupportData();

    return () => {
      unsubscribeExpenses();
    };
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
      setIsAnalyzing(true);
      try {
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
        await updateDoc(doc(db, "expenses", editingExpense.id), expenseData);
        toast.success("Expense updated!");
      } else {
        await addDoc(collection(db, "expenses"), {
          ...expenseData,
          createdAt: serverTimestamp(),
        });
        toast.success("Expense recorded!");
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
          <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
            <DialogTrigger render={
              <Button className="bg-primary hover:bg-red-700 text-white font-black h-12 px-8 rounded-xl uppercase tracking-[0.2em] text-[10px] shadow-lg shadow-primary/20 transition-all hover:scale-105">
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
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-500 hover:text-red-500 hover:bg-red-500/10" onClick={() => setReceiptFile(null)}>
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
                      <StableInput 
                        id="amount" 
                        value={newExpense.amount}
                        onValueChange={val => setNewExpense(prev => ({ ...prev, amount: val }))}
                        type="text" 
                        inputMode="decimal" 
                        placeholder="0.00" 
                        required 
                        className="bg-white/5 border-white/10 h-12 rounded-xl font-bold text-white" 
                      />
                    </div>
                    <div className="space-y-3">
                      <Label htmlFor="date" className="font-black uppercase tracking-widest text-[10px] text-white/70">Transaction Date</Label>
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
                    <Label htmlFor="category" className="font-black uppercase tracking-widest text-[10px] text-white/70">Operational Category</Label>
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
                    <Label htmlFor="receiptUrl" className="font-black uppercase tracking-widest text-[10px] text-white/70">Digital Receipt URL (Optional)</Label>
                    <StableInput 
                      id="receiptUrl" 
                      value={newExpense.receiptUrl}
                      onValueChange={val => setNewExpense(prev => ({ ...prev, receiptUrl: val }))}
                      placeholder="https://..." 
                      className="bg-white/5 border-white/10 h-12 rounded-xl font-bold text-white" 
                    />
                  </div>
                  <div className="space-y-3">
                    <Label htmlFor="appointmentId" className="font-black uppercase tracking-widest text-[10px] text-white/70">Linked Mission (Optional)</Label>
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
                  <Button variant="ghost" type="button" onClick={() => setShowAddDialog(false)} className="flex-1 text-gray-400 hover:text-white font-black uppercase tracking-widest text-[10px] h-14">
                    Abort
                  </Button>
                  <Button type="submit" className="flex-[2] bg-primary hover:bg-red-700 text-white font-black h-14 rounded-2xl uppercase tracking-[0.2em] text-xs shadow-xl shadow-primary/20 transition-all hover:scale-105">
                    {editingExpense ? "Authorize Modification" : "Authorize Expenditure"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <Card className="border-none shadow-sm bg-white overflow-hidden">
        <CardHeader className="border-b border-gray-50 bg-gray-50/50">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input 
                placeholder="Search expenses..." 
                className="pl-10 bg-white border-gray-200"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-gray-50/50">
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Receipt</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-10 text-gray-500">Loading expenses...</TableCell>
                </TableRow>
              ) : filteredExpenses.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-10 text-gray-500">No expenses recorded.</TableCell>
                </TableRow>
              ) : (
                filteredExpenses.map((exp) => (
                  <TableRow key={exp.id} className="hover:bg-gray-50/50 transition-colors group">
                    <TableCell className="text-sm font-medium text-gray-600">
                      {exp.date?.toDate ? format(exp.date.toDate(), "MMM d, yyyy") : "---"}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-bold text-gray-900">{exp.description}</span>
                        {exp.linkedAppointmentId && (
                          <span className="text-[10px] text-primary font-black uppercase tracking-widest flex items-center gap-1 mt-1">
                            <LinkIcon className="w-3 h-3" /> Linked to Job
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-wider bg-gray-50">
                        {exp.category}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="font-black text-gray-900">${exp.amount?.toFixed(2)}</span>
                    </TableCell>
                    <TableCell>
                      {exp.receiptUrl ? (
                        <a href={exp.receiptUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-red-700">
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      ) : (
                        <span className="text-gray-300">---</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-gray-400 hover:text-primary"
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
                              className="h-8 w-8 text-gray-400 hover:text-red-600"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          }
                          title="Delete Expense?"
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
