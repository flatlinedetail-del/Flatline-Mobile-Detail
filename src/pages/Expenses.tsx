import { useState, useEffect } from "react";
import { collection, query, onSnapshot, addDoc, serverTimestamp, orderBy, getDocs, doc, deleteDoc } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Receipt, Plus, Search, Filter, Trash2, Calendar, DollarSign, Tag, Link as LinkIcon, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Category } from "../types";
import { StableInput } from "../components/StableInput";

export default function Expenses() {
  const { profile } = useAuth();
  const [expenses, setExpenses] = useState<any[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "expenses"), orderBy("date", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const expensesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setExpenses(expensesData);
      setLoading(false);
    });

    const unsubAppointments = onSnapshot(collection(db, "appointments"), (snap) => {
      setAppointments(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const catsQuery = query(collection(db, "categories"), orderBy("sortOrder", "asc"));
    const unsubscribeCats = onSnapshot(catsQuery, (snapshot) => {
      setCategories(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Category)));
    });

    return () => {
      unsubscribe();
      unsubAppointments();
      unsubscribeCats();
    };
  }, []);

  const handleCreateExpense = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    const newExpense = {
      description: formData.get("description"),
      amount: parseFloat(formData.get("amount") as string),
      category: formData.get("category"),
      date: new Date(formData.get("date") as string),
      receiptUrl: formData.get("receiptUrl"),
      linkedAppointmentId: formData.get("appointmentId") || null,
      createdBy: profile?.uid,
      createdAt: serverTimestamp(),
    };

    try {
      await addDoc(collection(db, "expenses"), newExpense);
      toast.success("Expense recorded!");
      setShowAddDialog(false);
    } catch (error) {
      toast.error("Failed to record expense");
    }
  };

  const handleDeleteExpense = async (id: string) => {
    try {
      await deleteDoc(doc(db, "expenses", id));
      toast.success("Expense deleted");
    } catch (error) {
      toast.error("Failed to delete expense");
    }
  };

  const filteredExpenses = expenses.filter(exp => 
    (exp.description?.toLowerCase() || "").includes(searchTerm.toLowerCase()) ||
    (exp.category?.toLowerCase() || "").includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tighter uppercase">Expenses</h1>
          <p className="text-gray-500 font-medium">Track business costs and link receipts.</p>
        </div>
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogTrigger render={
            <Button className="bg-primary hover:bg-red-700 shadow-md shadow-red-100 font-bold">
              <Plus className="w-4 h-4 mr-2" />
              Record Expense
            </Button>
          } />
          <DialogContent className="max-w-md bg-white rounded-2xl border-none shadow-2xl p-0 overflow-hidden">
            <DialogHeader className="p-6 bg-gray-50/50 border-b border-gray-100">
              <DialogTitle className="text-xl font-bold text-gray-900">Record New Expense</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateExpense} className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <StableInput id="description" name="description" placeholder="e.g. Microfiber Towels" required className="bg-white border-gray-200" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="amount">Amount ($)</Label>
                  <StableInput id="amount" name="amount" type="text" inputMode="decimal" placeholder="0.00" required className="bg-white border-gray-200" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="date">Date</Label>
                  <Input id="date" name="date" type="date" required className="bg-white border-gray-200" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Select name="category" defaultValue={categories.find(c => c.type === "expense" && c.isActive)?.name || "Other"}>
                  <SelectTrigger className="bg-white border-gray-200"><SelectValue placeholder="Select Category" /></SelectTrigger>
                  <SelectContent className="bg-white">
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
              <div className="space-y-2">
                <Label htmlFor="receiptUrl">Receipt URL / Link</Label>
                <StableInput id="receiptUrl" name="receiptUrl" placeholder="https://..." className="bg-white border-gray-200" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="appointmentId">Link to Appointment (Optional)</Label>
                <Select name="appointmentId">
                  <SelectTrigger className="bg-white border-gray-200"><SelectValue placeholder="Select appointment" /></SelectTrigger>
                  <SelectContent className="bg-white">
                    <SelectItem value="none">None</SelectItem>
                    {appointments.map(app => (
                      <SelectItem key={app.id} value={app.id}>
                        {format(app.scheduledAt?.toDate(), "MM/dd")} - {app.customerName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <Button variant="outline" type="button" onClick={() => setShowAddDialog(false)} className="font-bold">Cancel</Button>
                <Button type="submit" className="bg-primary hover:bg-red-700 font-bold">Save Expense</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

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
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-red-600" onClick={() => handleDeleteExpense(exp.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
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
