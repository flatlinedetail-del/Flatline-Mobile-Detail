const { startOfDay, endOfDay, addMinutes, isAfter } = require('date-fns');

const baseDate = new Date("2026-04-20T10:00");
const start = startOfDay(baseDate);
const end = endOfDay(baseDate);

console.log({ start, end });
