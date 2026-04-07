import { collection, addDoc, serverTimestamp, Timestamp } from "firebase/firestore";
import { db } from "../firebase";
import { addDays, subDays, setHours, setMinutes } from "date-fns";

export async function seedDemoData() {
  try {
    // Seed Leads
    const leads = [
      { name: "Michael Jordan", phone: "(555) 232-3232", email: "mj@bulls.com", status: "new", priority: "hot", vehicleInfo: "2023 Ferrari SF90", createdAt: serverTimestamp() },
      { name: "Serena Williams", phone: "(555) 123-4567", email: "serena@tennis.com", status: "follow_up", priority: "warm", vehicleInfo: "2024 Range Rover Autobiography", createdAt: serverTimestamp() },
      { name: "Tiger Woods", phone: "(555) 987-6543", email: "tiger@golf.com", status: "quoted", priority: "hot", vehicleInfo: "2022 Genesis GV80", createdAt: serverTimestamp() },
    ];

    for (const lead of leads) {
      await addDoc(collection(db, "leads"), lead);
    }

    // Seed Customers
    const customers = [
      { name: "Elon Musk", phone: "(555) 420-6969", email: "elon@x.com", address: "1 Tesla Way, Austin, TX", loyaltyPoints: 1250, createdAt: serverTimestamp() },
      { name: "Jeff Bezos", phone: "(555) 111-2222", email: "jeff@amazon.com", address: "1000 Blue Origin Blvd, Van Horn, TX", loyaltyPoints: 500, createdAt: serverTimestamp() },
    ];

    const customerIds = [];
    for (const customer of customers) {
      const docRef = await addDoc(collection(db, "customers"), customer);
      customerIds.push(docRef.id);
    }

    // Seed Vendors
    const vendors = [
      { businessName: "North Austin Collision", contactName: "Dave Miller", phone: "(555) 999-8888", email: "billing@northaustin.com", type: "collision_center", billingTerms: "net_30", createdAt: serverTimestamp() },
      { businessName: "South Austin BMW", contactName: "Sarah Connor", phone: "(555) 777-6666", email: "service@southaustinbmw.com", type: "dealership", billingTerms: "net_15", createdAt: serverTimestamp() },
    ];

    const vendorIds = [];
    for (const vendor of vendors) {
      const docRef = await addDoc(collection(db, "vendors"), vendor);
      vendorIds.push(docRef.id);
    }

    // Seed Appointments
    const now = new Date();
    const appointments = [
      { 
        customerId: customerIds[0], 
        customerName: "Elon Musk",
        vehicleInfo: "2024 Tesla Cybertruck", 
        status: "scheduled", 
        scheduledAt: Timestamp.fromDate(setHours(setMinutes(now, 0), 10)), 
        address: "1 Tesla Way, Austin, TX",
        totalAmount: 450,
        serviceNames: ["Full Interior", "Exterior Wash", "Ceramic Boost"]
      },
      { 
        customerId: customerIds[1], 
        customerName: "Jeff Bezos",
        vehicleInfo: "2023 Rivian R1S", 
        status: "in_progress", 
        scheduledAt: Timestamp.fromDate(setHours(setMinutes(now, 30), 13)), 
        address: "1000 Blue Origin Blvd, Van Horn, TX",
        totalAmount: 350,
        serviceNames: ["Interior Detail", "Ozone Treatment"]
      },
      { 
        vendorId: vendorIds[0], 
        customerName: "North Austin Collision",
        vehicleInfo: "2024 Porsche 911 GT3", 
        status: "completed", 
        scheduledAt: Timestamp.fromDate(setHours(setMinutes(subDays(now, 1), 0), 9)), 
        address: "123 Collision Way, Austin, TX",
        totalAmount: 1200,
        vin: "WP0AA2A9XRS200001",
        roNumber: "RO-99821",
        serviceNames: ["Overspray Removal", "Paint Correction", "Ceramic Coating"]
      },
    ];

    for (const app of appointments) {
      await addDoc(collection(db, "appointments"), app);
    }

    return true;
  } catch (error) {
    console.error("Error seeding data:", error);
    return false;
  }
}
