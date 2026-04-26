import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import AddressInput from "@/components/AddressInput";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, Plus, Trash2, Star, Edit2, Check, X } from "lucide-react";
import { Client } from "@/types";

interface ClientAddressesManagerProps {
  client: Client;
  onUpdate: (updates: Partial<Client>) => void;
}

export function ClientAddressesManager({ client, onUpdate }: ClientAddressesManagerProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState("Home");
  const [newAddress, setNewAddress] = useState("");
  const [newLat, setNewLat] = useState<number | undefined>();
  const [newLng, setNewLng] = useState<number | undefined>();

  // Ensure client has addresses array; migrate old address if possible
  const addresses = client.addresses || [];
  if (addresses.length === 0 && client.address) {
    addresses.push({
      id: "legacy-address",
      label: "Default",
      address: client.address,
      latitude: client.latitude,
      longitude: client.longitude,
      isDefault: true
    });
  }

  const handleSaveNew = () => {
    if (!newAddress) return;
    const newEntry = {
      id: Math.random().toString(36).substr(2, 9),
      label: newLabel,
      address: newAddress,
      latitude: newLat,
      longitude: newLng,
      isDefault: addresses.length === 0
    };
    
    // If it's the first one, also update legacy fields for backward compatibility
    const updates: Partial<Client> = { addresses: [...addresses, newEntry] };
    if (newEntry.isDefault) {
      updates.address = newEntry.address;
      updates.latitude = newEntry.latitude;
      updates.longitude = newEntry.longitude;
    }
    
    onUpdate(updates);
    setIsAdding(false);
    setNewAddress("");
    setNewLabel("Home");
    setNewLat(undefined);
    setNewLng(undefined);
  };

  const handleRemove = (id: string) => {
    const newAddresses = addresses.filter(a => a.id !== id);
    // If we removed the default, and there is one left, make the first one default
    let defaultChanged = false;
    if (newAddresses.length > 0 && !newAddresses.find(a => a.isDefault)) {
      newAddresses[0].isDefault = true;
      defaultChanged = true;
    }
    
    const updates: Partial<Client> = { addresses: newAddresses };
    if (defaultChanged || addresses.find(a => a.id === id)?.isDefault) {
      if (newAddresses.length > 0) {
        const def = newAddresses.find(a => a.isDefault) || newAddresses[0];
        updates.address = def.address;
        updates.latitude = def.latitude;
        updates.longitude = def.longitude;
      } else {
        updates.address = "";
        updates.latitude = undefined;
        updates.longitude = undefined;
      }
    }
    
    onUpdate(updates);
  };

  const handleSetDefault = (id: string) => {
    const newAddresses = addresses.map(a => ({
      ...a,
      isDefault: a.id === id
    }));
    const def = newAddresses.find(a => a.id === id);
    if (!def) return;
    
    onUpdate({
      addresses: newAddresses,
      address: def.address,
      latitude: def.latitude,
      longitude: def.longitude
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="text-[10px] font-black uppercase tracking-widest text-white/40">Saved Service Locations</Label>
        {!isAdding && (
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setIsAdding(true)}
            className="h-6 text-[9px] font-black uppercase tracking-widest text-primary hover:text-primary hover:bg-primary/10 px-2"
          >
            <Plus className="w-3 h-3 mr-1" /> Add Address
          </Button>
        )}
      </div>

      <div className="space-y-2">
        {addresses.map((addr) => (
          <div key={addr.id} className="bg-black/20 border border-white/5 p-3 rounded-xl flex items-start gap-3 group relative">
            <div className="pt-0.5">
              <MapPin className="w-4 h-4 text-white/30" />
            </div>
            <div className="flex-1">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase font-black tracking-widest text-white/60">{addr.label}</span>
                  {addr.isDefault && (
                    <span className="text-[8px] bg-primary/20 text-primary px-1.5 py-0.5 rounded font-black uppercase tracking-widest">Default</span>
                  )}
                </div>
                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                  {!addr.isDefault && (
                    <Button variant="ghost" size="icon" className="w-6 h-6 text-white/40 hover:text-yellow-400" onClick={() => handleSetDefault(addr.id)} title="Set as Default">
                      <Star className="w-3 h-3" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="w-6 h-6 text-white/40 hover:text-red-400" onClick={() => handleRemove(addr.id)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
              <p className="text-sm font-medium text-white/90 mt-1">{addr.address}</p>
            </div>
          </div>
        ))}
      </div>

      {isAdding && (
        <div className="bg-black/40 border border-primary/20 p-4 rounded-xl space-y-4">
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-white/40">Location Label</Label>
            <Select value={newLabel} onValueChange={setNewLabel}>
              <SelectTrigger className="bg-black/40 border-white/10 text-white rounded-xl h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-gray-900 border-white/10 text-white">
                <SelectItem value="Home">Home</SelectItem>
                <SelectItem value="Work">Work</SelectItem>
                <SelectItem value="Shop">Shop</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-white/40">Address</Label>
            <AddressInput 
              defaultValue={newAddress}
              onAddressSelect={(address, lat, lng) => {
                setNewAddress(address);
                setNewLat(lat);
                setNewLng(lng);
              }}
              className="bg-black/40 border-white/10 text-white rounded-xl h-10 focus:ring-primary/50"
            />
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <Button variant="ghost" className="h-8 text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white" onClick={() => setIsAdding(false)}>Cancel</Button>
            <Button variant="default" className="h-8 text-[10px] font-black uppercase tracking-widest bg-primary text-white" onClick={handleSaveNew}>Save Address</Button>
          </div>
        </div>
      )}

      {addresses.length === 0 && !isAdding && (
        <div className="text-center py-4 bg-black/20 border border-white/5 rounded-xl border-dashed">
          <p className="text-xs text-white/40">No locations saved.</p>
          <Button variant="link" className="text-[10px] text-primary" onClick={() => setIsAdding(true)}>Add your first address</Button>
        </div>
      )}
    </div>
  );
}
