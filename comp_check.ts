import fs from 'fs';
const content = fs.readFileSync('src/pages/Settings.tsx', 'utf8');

const components = ["Card", "CardContent", "CardHeader", "CardTitle", "CardDescription", "Button", "Input", "Label", "Tabs", "TabsContent", "TabsList", "TabsTrigger", "Badge", "Select", "SelectContent", "SelectItem", "SelectTrigger", "SelectValue", "Switch", "Slider", "StandardInput", "StableInput", "StableTextarea", "NumberInput", "AddressInput", "Dialog", "DialogContent", "DialogHeader", "DialogTitle", "DialogTrigger", "DialogFooter", "Textarea", "DeleteConfirmationDialog", "AlertDialog", "AlertDialogAction", "AlertDialogCancel", "AlertDialogContent", "AlertDialogDescription", "AlertDialogFooter", "AlertDialogHeader", "AlertDialogTitle", "AlertDialogTrigger", "MapZoneEditor"];

for (const comp of components) {
  const isUsedAsTag = content.includes('<' + comp);
  if (!isUsedAsTag) {
    console.log('Unused comp: ' + comp);
  }
}
