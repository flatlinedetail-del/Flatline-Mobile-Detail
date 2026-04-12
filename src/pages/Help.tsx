import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { HelpCircle, BookOpen, AlertCircle } from "lucide-react";

export default function Help() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <HelpCircle className="w-8 h-8 text-primary" />
        <h1 className="text-3xl font-bold tracking-tight">Help Center</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="w-5 h-5" />
              Documentation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Accordion className="space-y-2">
              <AccordionItem value="clients">
                <AccordionTrigger>Clients</AccordionTrigger>
                <AccordionContent>Manage your customer and vendor profiles here.</AccordionContent>
              </AccordionItem>
              <AccordionItem value="vehicles">
                <AccordionTrigger>Vehicles</AccordionTrigger>
                <AccordionContent>Add and manage vehicles associated with your clients.</AccordionContent>
              </AccordionItem>
              <AccordionItem value="scheduling">
                <AccordionTrigger>Scheduling</AccordionTrigger>
                <AccordionContent>Create and manage appointments and jobs.</AccordionContent>
              </AccordionItem>
              <AccordionItem value="invoices">
                <AccordionTrigger>Invoices</AccordionTrigger>
                <AccordionContent>Generate and track invoices for completed jobs.</AccordionContent>
              </AccordionItem>
              <AccordionItem value="quotes">
                <AccordionTrigger>Quotes</AccordionTrigger>
                <AccordionContent>Create estimates for potential clients.</AccordionContent>
              </AccordionItem>
              <AccordionItem value="route">
                <AccordionTrigger>Route Optimization</AccordionTrigger>
                <AccordionContent>Optimize your daily travel routes.</AccordionContent>
              </AccordionItem>
              <AccordionItem value="integrations">
                <AccordionTrigger>Integrations</AccordionTrigger>
                <AccordionContent>Connect payment providers and other services.</AccordionContent>
              </AccordionItem>
              <AccordionItem value="editing">
                <AccordionTrigger>Editing/Deleting</AccordionTrigger>
                <AccordionContent>How to modify or remove existing records.</AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              Troubleshooting
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Accordion className="space-y-2">
              <AccordionItem value="search">
                <AccordionTrigger>Search not working?</AccordionTrigger>
                <AccordionContent>Ensure you have entered the correct search terms and check your internet connection.</AccordionContent>
              </AccordionItem>
              <AccordionItem value="delete">
                <AccordionTrigger>Delete not working?</AccordionTrigger>
                <AccordionContent>Check if the item is linked to an active appointment or invoice.</AccordionContent>
              </AccordionItem>
              <AccordionItem value="route">
                <AccordionTrigger>Route issues?</AccordionTrigger>
                <AccordionContent>Verify your addresses are correctly entered and geocoded.</AccordionContent>
              </AccordionItem>
              <AccordionItem value="invoices">
                <AccordionTrigger>Invoices not opening?</AccordionTrigger>
                <AccordionContent>Check your browser's pop-up blocker settings.</AccordionContent>
              </AccordionItem>
              <AccordionItem value="forms">
                <AccordionTrigger>Forms not saving?</AccordionTrigger>
                <AccordionContent>Ensure all required fields are filled out correctly.</AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
