import * as fs from 'fs';

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
txt = txt.replace(/"text-\[10px\] text-gray-400 font-black/g, `"text-[10px] text-white/40 font-black`);
txt = txt.replace(/"text-\[10px\] font-mono text-gray-400 font-black uppercase tracking-widest"/g, `"text-[10px] font-mono text-white/40 font-black uppercase tracking-widest"`);
txt = txt.replace(/"text-\[10px\] text-gray-400 font-black uppercase tracking-widest italic"/g, `"text-[10px] text-white/40 font-black uppercase tracking-widest italic"`);
txt = txt.replace(/"font-black uppercase tracking-widest text-\[10px\] text-gray-400"/g, `"font-black uppercase tracking-widest text-[10px] text-white/40"`);
txt = txt.replace(/"text-\[10px\] font-black uppercase tracking-\[0\.2em\] text-gray-400"/g, `"text-[10px] font-black uppercase tracking-[0.2em] text-white/40"`);
txt = txt.replace(/"text-gray-400 uppercase text-\[10px\] font-black tracking-widest"/g, `"text-white/40 uppercase text-[10px] font-black tracking-widest"`);

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

// Add form popup
txt = txt.replace(/<DialogContent className="max-w-2xl bg-white p-6 rounded-2xl border-none shadow-2xl">/g, `<DialogContent className="max-w-2xl bg-card p-6 rounded-3xl border border-white/5 shadow-2xl">`);
txt = txt.replace(/<DialogHeader><DialogTitle className="font-black">Select Form to Add<\/DialogTitle><\/DialogHeader>/g, `<DialogHeader><DialogTitle className="font-black text-white tracking-tighter uppercase">Select Form to Add</DialogTitle></DialogHeader>`);
txt = txt.replace(/<span className="text-\[10px\] text-gray-500 capitalize">/g, `<span className="text-[10px] text-white/40 capitalize">`);

// Signed form summary popup
txt = txt.replace(/<DialogContent className="max-w-3xl max-h-\[90vh\] overflow-y-auto bg-white p-8 rounded-2xl border-none shadow-2xl">/g, `<DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-card p-8 rounded-3xl border border-white/5 shadow-2xl">`);
txt = txt.replace(/<h2 className="text-2xl font-black uppercase tracking-tighter">/g, `<h2 className="text-2xl font-black uppercase tracking-tighter text-white">`);
txt = txt.replace(/<p className="text-xs text-gray-500">Version/g, `<p className="text-xs text-white/40">Version`);
txt = txt.replace(/<p className="font-bold text-gray-900">/g, `<p className="font-bold text-white">`);
txt = txt.replace(/<div className="border rounded-xl p-4 bg-white inline-block">/g, `<div className="border border-white/10 rounded-xl p-4 bg-white/5 inline-block">`);

fs.writeFileSync(path, txt, 'utf8');
