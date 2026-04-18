import React, { useState, useCallback, useRef } from "react";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../hooks/useAuth";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { Textarea } from "./ui/textarea";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";
import CustomerAddressInput, { CustomerAddressInputRef } from "./CustomerAddressInput";
import { StableInput } from "./StableInput";
import { StableTextarea } from "./StableTextarea";

interface AddCustomerDialogProps {
  onSuccess?: () => void;
}

export default function AddCustomerDialog({ onSuccess }: AddCustomerDialogProps) {
  const { profile } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const addressInputRef = useRef<CustomerAddressInputRef>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const addressData = addressInputRef.current?.getAddressData() || { address: "", lat: 0, lng: 0 };
    
    if (addressData.address && addressData.lat === 0) {
      toast.warning("Address selected but coordinates not found. Travel fees may not calculate correctly.");
    }

    const newCustomer = {
      name: formData.get("name"),
      phone: formData.get("phone"),
      email: formData.get("email"),
      address: addressData.address,
      latitude: addressData.lat,
      longitude: addressData.lng,
      loyaltyPoints: 0,
      membershipLevel: "none",
      notes: formData.get("notes"),
      createdAt: serverTimestamp(),
      createdBy: profile?.uid,
    };

    try {
      await addDoc(collection(db, "customers"), newCustomer);
      toast.success("Customer added successfully");
      setIsOpen(false);
      if (onSuccess) onSuccess();
    } catch (error) {
      console.error("Error adding customer:", error);
      toast.error("Failed to add customer");
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger render={
        <Button className="bg-primary hover:bg-red-700 shadow-lg shadow-red-100 font-bold">
          <UserPlus className="w-4 h-4 mr-2" />
          Add New Customer
        </Button>
      } />
      <DialogContent className="sm:max-w-4xl p-0 overflow-hidden border border-white/10 shadow-2xl bg-popover">
        <DialogHeader className="px-8 pt-8 pb-4 bg-black/40 border-b border-white/5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
              <UserPlus className="w-6 h-6" />
            </div>
            <div>
              <DialogTitle className="text-2xl font-black tracking-tighter uppercase text-white">Add New Customer</DialogTitle>
              <p className="text-white/40 text-xs font-medium">Create a new retail client profile.</p>
            </div>
          </div>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto space-y-6 px-8 py-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <StableInput id="name" name="name" placeholder="John Doe" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number</Label>
              <StableInput id="phone" name="phone" placeholder="(555) 000-0000" required />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <StableInput id="email" name="email" type="email" placeholder="john@example.com" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="address">Default Address</Label>
            <CustomerAddressInput 
              ref={addressInputRef}
              placeholder="123 Main St, City, ST"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Internal Notes</Label>
            <StableTextarea id="notes" name="notes" placeholder="Special requests, gate codes, etc." className="min-h-[120px]" />
          </div>
          <div className="pt-4">
            <Button type="submit" className="w-full h-12 bg-primary hover:bg-red-700 text-white font-black uppercase tracking-widest shadow-lg shadow-primary/20 rounded-xl">
              Create Customer Profile
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
