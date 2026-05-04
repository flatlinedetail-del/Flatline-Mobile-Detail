import fs from 'fs';

const content = fs.readFileSync('src/pages/Settings.tsx', 'utf8');

const regex = /<Label[^>]*>.*?<Label \/>/g;
let match;
while ((match = regex.exec(content)) !== null) {
  console.log('Found wrong label: ', match[0]);
}

const tagRegex = /<Tag[^>]*>.*?<Tag \/>/g;
while ((match = tagRegex.exec(content)) !== null) {
  console.log('Found wrong tag: ', match[0]);
}

const strayGtRegex = />\s*>/g;
while ((match = strayGtRegex.exec(content)) !== null) {
  console.log('Found stray >: ', match[0]);
}

const brokenComponentRegex = /<(Input|Label|Tabs|Card|Button)[^>]*>(?!.*<\/\1>).{0,50}$/gm;
while ((match = brokenComponentRegex.exec(content)) !== null) {
  console.log('Found unclosed component: ', match[0], 'at line (approx)');
}
