const fs = require('fs');

const path = 'src/pages/JobDetail.tsx';
let txt = fs.readFileSync(path, 'utf8');

txt = txt.replace(/bg-gray-50 rounded-xl p-3 grid/g, "bg-white/5 border border-white/10 rounded-xl p-3 grid");
txt = txt.replace(/<div className="text-gray-400">Make: <span className="text-gray-900">/g, `<div className="text-white/40">Make: <span className="text-white">`);
txt = txt.replace(/<div className="text-gray-400">Model: <span className="text-gray-900">/g, `<div className="text-white/40">Model: <span className="text-white">`);
txt = txt.replace(/<div className="text-gray-400">Year: <span className="text-gray-900">/g, `<div className="text-white/40">Year: <span className="text-white">`);
txt = txt.replace(/<div className="text-gray-400">Type: <span className="text-gray-900">/g, `<div className="text-white/40">Type: <span className="text-white">`);

txt = txt.replace(/bg-red-50 rounded-xl/g, "bg-primary/10 border border-primary/20 rounded-xl");
txt = txt.replace(/span className="text-xs font-bold text-primary"/g, `span className="text-xs font-black text-primary"`);

// Find all text-gray-400 in main UI EXCEPT around line 750-800 which is the invoice.
txt = txt.replace(/text-gray-400 hover:text-primary transition-all shadow-sm/g, "text-white/60 hover:text-primary transition-all shadow-sm");
txt = txt.replace(/"text-\[10px\] text-gray-400 font-black"/g, `"text-[10px] text-white/40 font-black"`);
txt = txt.replace(/"text-\[10px\] font-mono text-gray-400 font-black uppercase tracking-widest"/g, `"text-[10px] font-mono text-white/40 font-black uppercase tracking-widest"`);
txt = txt.replace(/"text-\[10px\] text-gray-400 font-black uppercase tracking-widest italic"/g, `"text-[10px] text-white/40 font-black uppercase tracking-widest italic"`);
txt = txt.replace(/"font-black uppercase tracking-widest text-\[10px\] text-gray-400"/g, `"font-black uppercase tracking-widest text-[10px] text-white/40"`);
txt = txt.replace(/"text-\[10px\] font-black uppercase tracking-\[0\.2em\] text-gray-400"/g, `"text-[10px] font-black uppercase tracking-[0.2em] text-white/40"`);
txt = txt.replace(/"text-gray-400 uppercase text-\[10px\] font-black tracking-widest"/g, `"text-white/40 uppercase text-[10px] font-black tracking-widest"`);
// Also add these replacements just in case
txt = txt.replace(/"text-gray-400"/g, `"text-white/40"`); // We just replace them globally, except in invoice

// "text-gray-600" in main UI
txt = txt.replace(/"text-gray-600 font-black uppercase tracking-tight text-xs"/g, `"text-white/70 font-black uppercase tracking-tight text-xs"`);
txt = txt.replace(/"text-gray-600 font-black uppercase tracking-tight text-xs italic"/g, `"text-white/70 font-black uppercase tracking-tight text-xs italic"`);

// Asset profile 
txt = txt.replace(/"text-xl font-black text-gray-900 tracking-tight uppercase"/g, `"text-xl font-black text-white tracking-tight uppercase"`);
// Pricing "Included"
txt = txt.replace(/"font-black text-gray-900 text-xs uppercase tracking-widest"/g, `"font-black text-white text-xs uppercase tracking-widest"`);
// Dialog trigger scan icon background
txt = txt.replace(/"h-10 w-10 border-border bg-white text-gray-900 hover:bg-gray-50 rounded-xl shadow-sm"/g, `"h-10 w-10 border-white/10 bg-white/5 text-white hover:bg-white/10 rounded-xl shadow-sm border"`);

// DialogContent in 'Collect Payment'
txt = txt.replace(/<DialogContent className="bg-white border-none shadow-2xl rounded-2xl p-0 overflow-hidden">/g, `<DialogContent className="bg-card border-none shadow-2xl rounded-3xl p-0 overflow-hidden">`);
txt = txt.replace(/<DialogHeader className="p-6 border-b">/g, `<DialogHeader className="p-6 border-b border-white/5 bg-black/40">`);
txt = txt.replace(/<DialogTitle className="font-black">/g, `<DialogTitle className="font-black text-white uppercase tracking-tighter">`);
txt = txt.replace(/<SelectTrigger className="bg-white border-gray-200">/g, `<SelectTrigger className="bg-white/5 border-white/10 text-white font-bold h-12 rounded-xl">`);
txt = txt.replace(/<SelectContent className="bg-white">/g, `<SelectContent className="bg-card border-white/5 text-white">`);
txt = txt.replace(/<Label className="font-bold">/g, `<Label className="font-black uppercase tracking-widest text-[10px] text-white/40">`);
txt = txt.replace(/<Label className="font-bold">Payment Method<\/Label>/g, `<Label className="font-black uppercase tracking-widest text-[10px] text-white/40">Payment Method</Label>`);

fs.writeFileSync(path, txt, 'utf8');
