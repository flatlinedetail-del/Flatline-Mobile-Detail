import * as fs from 'fs';

const path = 'src/pages/Settings.tsx';
let text = fs.readFileSync(path, 'utf8');

const clientCatTab = '</TabsContent>\n\n        <TabsContent value="client-categories" className="mt-0">';

if (text.includes(clientCatTab)) {
    text = text.replace(clientCatTab, '\n          {/* Client Categories Merged */}\n          <div className="mt-8"></div>');
    fs.writeFileSync(path, text, 'utf8');
    console.log("Success: Client Categories merged.");
} else {
    console.log("Failed: Could not find client-categories tab.");
}
