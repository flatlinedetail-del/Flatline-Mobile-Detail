import fs from 'fs';
const content = fs.readFileSync('src/pages/Settings.tsx', 'utf8');

const utils = ["seedDemoData", "seedServiceTimingDemo", "importFullServiceSystem", "toast", "format", "useSearchParams", "migrateDataToClients", "processFollowUps", "resizeImage", "cn", "formatPhoneNumber", "formatCurrency", "linkGoogleCalendar", "getGoogleCalendarToken", "unlinkGoogleCalendar"];

for (const fn of utils) {
  const rx = new RegExp('\\b' + fn + '\\b', 'g');
  const matches = content.match(rx);
  if (!matches || matches.length <= 1) { // 1 match is the import itself
    console.log('Unused utility: ' + fn);
  }
}
