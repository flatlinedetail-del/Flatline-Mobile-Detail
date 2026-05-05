import fs from 'fs';
const content = fs.readFileSync('src/pages/Settings.tsx', 'utf8');

const icons = ['User', 'Shield', 'Bell', 'CreditCard', 'Database', 'Globe', 'DatabaseZap', 'Loader2', 'Palette', 'Layout', 'Truck', 'MapPin', 'Plus', 'Trash2', 'Edit2', 'Check', 'X', 'Star', 'Percent', 'ClipboardList', 'Tag', 'Ticket', 'Lock', 'Users', 'ShieldAlert', 'ShieldCheck', 'Upload', 'Calendar', 'Link', 'Building2', 'Zap', 'Save', 'Clock', 'MessageSquare', 'Smartphone', 'Send', 'AlertCircle', 'ArrowUp', 'ArrowDown', 'ImageIcon', 'DollarIcon'];

for (const icon of icons) {
  const isUsedAsTag = content.includes('<' + icon);
  const isUsedAsProp = content.includes('=' + '{' + icon + '}');
  const isUsedInArray = content.includes('icon: ' + icon);
  
  if (!isUsedAsTag && !isUsedAsProp && !isUsedInArray) {
    console.log('Unused icon: ' + icon);
  }
}
