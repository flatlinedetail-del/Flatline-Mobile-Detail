import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { createJob } from "./jobService";
import { createInvoice } from "./invoiceService";

export async function seedNewBusinessData(businessId: string) {
  try {
    console.log("Seeding data for business:", businessId);

    // 1. Services & Add-ons
    const services = [
      { name: "Full Detail", category: "Detail", basePrice: 200, estimatedDuration: 120, isActive: true },
      { name: "Express Wash", category: "Wash", basePrice: 50, estimatedDuration: 30, isActive: true },
    ];
    const addOns = [
      { name: "Wax", price: 30, estimatedDuration: 20, isActive: true },
      { name: "Interior Deep Clean", price: 80, estimatedDuration: 60, isActive: true },
    ];
    
    const serviceIds: Record<string, string> = {};
    for (const s of services) {
      const ref = await addDoc(collection(db, "services"), { ...s, businessId, createdAt: serverTimestamp() });
      serviceIds[s.name] = ref.id;
    }
    for (const a of addOns) {
      await addDoc(collection(db, "addons"), { ...a, businessId, createdAt: serverTimestamp() });
    }

    // 2. Clients
    const clients = [
      { firstName: "Demo", lastName: "Customer 1", email: "demo1@example.com", phone: "555-0101" },
      { firstName: "Demo", lastName: "Customer 2", email: "demo2@example.com", phone: "555-0202" },
    ];
    const clientIds = [];
    for (const c of clients) {
      const ref = await addDoc(collection(db, "clients"), { 
        ...c, 
        businessId, 
        createdAt: serverTimestamp(),
        isDeleted: false 
      });
      clientIds.push(ref.id);
    }

    // 3. Vehicles
    const vehicles = [
      { clientId: clientIds[0], make: "Tesla", model: "Model 3", year: "2023", businessId },
      { clientId: clientIds[1], make: "Rivian", model: "R1T", year: "2024", businessId },
    ];
    const vehicleIds = [];
    for (const v of vehicles) {
      const ref = await addDoc(collection(db, "vehicles"), { 
        ...v, 
        createdAt: serverTimestamp(),
        isDeleted: false 
      });
      vehicleIds.push(ref.id);
    }

    // 4. Appointments
    const now = new Date();
    const appointments = [
      { clientId: clientIds[0], vehicleId: vehicleIds[0], scheduledAt: serverTimestamp(), status: "completed", serviceIds: [serviceIds["Full Detail"]], businessId },
      { clientId: clientIds[1], vehicleId: vehicleIds[1], scheduledAt: serverTimestamp(), status: "scheduled", serviceIds: [serviceIds["Express Wash"]], businessId },
    ];
    const appointmentIds = [];
    for (const a of appointments) {
      const ref = await addDoc(collection(db, "appointments"), {
        ...a,
        customerName: "Demo Customer",
        customerType: "retail",
        technicianId: "demo-tech",
        technicianName: "Demo Tech",
        totalAmount: 100,
        baseAmount: 100,
        travelFee: 0,
        discountAmount: 0,
        taxAmount: 0,
        depositAmount: 0,
        depositType: "fixed",
        depositPaid: false,
        paymentStatus: "unpaid",
        waiverAccepted: false,
        photos: { before: [], after: [], damage: [] },
        cancellationFeeEnabled: false,
        cancellationFeeAmount: 0,
        cancellationFeeType: "fixed",
        cancellationCutoffHours: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      appointmentIds.push(ref.id);
    }

    // 5. Jobs & Invoices (linked)
    for (let i = 0; i < appointmentIds.length; i++) {
        const jobId = await createJob({
            appointmentId: appointmentIds[i],
            clientId: i === 0 ? clientIds[0] : clientIds[1],
            serviceSelections: [],
            totalAmount: 100,
            status: "completed"
        }, businessId);
        
        await createInvoice({
            clientId: i === 0 ? clientIds[0] : clientIds[1],
            jobId: jobId,
            appointmentId: appointmentIds[i],
            total: 100
        }, businessId);
    }


    console.log("Seeding complete for business:", businessId);
    return true;
  } catch (error) {
    console.error("Seeding failed:", error);
    return false;
  }
}
