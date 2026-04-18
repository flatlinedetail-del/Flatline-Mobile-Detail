import * as fs from 'fs';

const path = 'src/pages/Settings.tsx';
let text = fs.readFileSync(path, 'utf8');

const catStartStr = '<TabsContent value="categories" className="mt-0">';
const loyStartStr = '</TabsContent>\n\n        <TabsContent value="loyalty" className="mt-0">';
const intStartStr = '</TabsContent>\n\n        <TabsContent value="integrations" className="mt-0">';

const c_start = text.indexOf(catStartStr);
const l_start = text.indexOf(loyStartStr);

if (c_start !== -1 && l_start !== -1) {
    const block = text.substring(c_start + catStartStr.length, l_start);
    
    // Remove the block from original location
    text = text.substring(0, c_start) + text.substring(l_start + '</TabsContent>\n\n'.length);
    
    // Find integrations start to insert BEFORE it
    const i_start = text.indexOf(intStartStr);
    
    if (i_start !== -1) {
        const insertion = `\n          {/* Categories Merged */}\n          <div className="mt-8"></div>\n${block}`;
        text = text.substring(0, i_start) + insertion + text.substring(i_start);
        fs.writeFileSync(path, text, 'utf8');
        console.log("Success: Categories moved.");
    } else {
        console.log("Failed: Could not find integrations block to insert.");
    }
} else {
    console.log("Failed: Could not find categories or loyalty block bounds.");
}
