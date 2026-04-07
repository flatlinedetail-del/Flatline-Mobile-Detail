import { useState, useEffect } from "react";
import { doc, updateDoc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import { Checkbox } from "./ui/checkbox";
import { Label } from "./ui/label";
import { Card, CardContent } from "./ui/card";
import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface ServiceChecklistProps {
  jobId: string;
  services: string[];
}

const defaultChecklist: Record<string, string[]> = {
  "Full Interior": ["Vacuum", "Steam Clean", "Leather Condition", "Window Clean", "Door Jams"],
  "Exterior Wash": ["Hand Wash", "Wheel Clean", "Tire Shine", "Drying", "Window Clean"],
  "Ceramic Coating": ["Decontamination", "Clay Bar", "Paint Correction", "IPA Wipe", "Coating Application"],
  "Engine Bay": ["Degrease", "Steam Clean", "Dressing"],
  "Paint Correction": ["Compound", "Polish", "Finish Polish"],
};

export default function ServiceChecklist({ jobId, services }: ServiceChecklistProps) {
  const [completedTasks, setCompletedTasks] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadChecklist();
  }, [jobId]);

  const loadChecklist = async () => {
    if (!jobId) return;
    try {
      const docRef = doc(db, "appointments", jobId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setCompletedTasks(docSnap.data().completedTasks || {});
      }
    } catch (error) {
      console.error("Error loading checklist:", error);
    } finally {
      setLoading(false);
    }
  };

  const toggleTask = async (service: string, task: string) => {
    const currentTasks = completedTasks[service] || [];
    const newTasks = currentTasks.includes(task)
      ? currentTasks.filter(t => t !== task)
      : [...currentTasks, task];

    const updatedCompletedTasks = {
      ...completedTasks,
      [service]: newTasks,
    };

    setCompletedTasks(updatedCompletedTasks);

    try {
      const docRef = doc(db, "appointments", jobId);
      await updateDoc(docRef, { completedTasks: updatedCompletedTasks });
    } catch (error) {
      console.error("Error updating checklist:", error);
      toast.error("Failed to save progress");
    }
  };

  if (loading) return <div className="flex items-center justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      {services.map((service) => {
        const tasks = defaultChecklist[service] || ["General Cleaning", "Quality Check"];
        const completed = completedTasks[service] || [];
        const progress = Math.round((completed.length / tasks.length) * 100);

        return (
          <Card key={service} className="border-none shadow-sm bg-gray-50/50 overflow-hidden">
            <div className="bg-white p-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center transition-colors",
                  progress === 100 ? "bg-green-100 text-green-600" : "bg-red-100 text-primary"
                )}>
                  {progress === 100 ? <CheckCircle2 className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
                </div>
                <h4 className="font-bold text-gray-900">{service}</h4>
              </div>
              <span className="text-xs font-bold text-gray-400">{progress}% Complete</span>
            </div>
            <CardContent className="p-4 space-y-3">
              {tasks.map((task) => (
                <div key={task} className="flex items-center space-x-3">
                  <Checkbox 
                    id={`${service}-${task}`} 
                    checked={completed.includes(task)}
                    onCheckedChange={() => toggleTask(service, task)}
                    className="border-gray-300 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                  />
                  <Label 
                    htmlFor={`${service}-${task}`}
                    className={cn(
                      "text-sm font-medium cursor-pointer transition-colors",
                      completed.includes(task) ? "text-gray-400 line-through" : "text-gray-700"
                    )}
                  >
                    {task}
                  </Label>
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
