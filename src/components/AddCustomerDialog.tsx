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
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-xl font-black">Add New Customer</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
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
            <Label htmlFor="notes">Notes</Label>
            <StableTextarea id="notes" name="notes" placeholder="Special requests, gate codes, etc." />
          </div>
          <Button type="submit" className="w-full bg-primary hover:bg-red-700 font-bold">Create Customer</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
