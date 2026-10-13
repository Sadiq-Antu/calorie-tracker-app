/**
 * Local Date & Time Utilities for Food Diary Navigation
 */

export function getTodayDateString(): string {
  const now = new Date();
  return formatDateToYYYYMMDD(now);
}

export function formatDateToYYYYMMDD(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseYYYYMMDD(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1, 12, 0, 0);
}

export function shiftDateString(dateStr: string, deltaDays: number): string {
  const date = parseYYYYMMDD(dateStr);
  date.setDate(date.getDate() + deltaDays);
  return formatDateToYYYYMMDD(date);
}

export function formatReadableDate(dateStr: string, todayStr: string = getTodayDateString()): string {
  if (dateStr === todayStr) {
    return 'Today';
  }
  const yesterdayStr = shiftDateString(todayStr, -1);
  if (dateStr === yesterdayStr) {
    return 'Yesterday';
  }
  const tomorrowStr = shiftDateString(todayStr, 1);
  if (dateStr === tomorrowStr) {
    return 'Tomorrow';
  }

  const parsed = parseYYYYMMDD(dateStr);
  return parsed.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: parsed.getFullYear() !== parseYYYYMMDD(todayStr).getFullYear() ? 'numeric' : undefined,
  });
}

export function formatFullDateSubheading(dateStr: string): string {
  const parsed = parseYYYYMMDD(dateStr);
  return parsed.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function getSevenDayWindow(centerDateStr: string): Array<{
  dateStr: string;
  dayShort: string;
  dayNumber: string;
  isToday: boolean;
  isSelected: boolean;
}> {
  const todayStr = getTodayDateString();
  const days = [];
  for (let offset = -3; offset <= 3; offset++) {
    const dStr = shiftDateString(centerDateStr, offset);
    const dObj = parseYYYYMMDD(dStr);
    days.push({
      dateStr: dStr,
      dayShort: dObj.toLocaleDateString('en-US', { weekday: 'short' }),
      dayNumber: String(dObj.getDate()),
      isToday: dStr === todayStr,
      isSelected: dStr === centerDateStr,
    });
  }
  return days;
}

export function getCurrentTimeHHMM(): string {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function inferMealTypeFromTime(hhmm: string = getCurrentTimeHHMM()): 'breakfast' | 'lunch' | 'dinner' | 'snacks' {
  const hour = parseInt(hhmm.split(':')[0] || '12', 10);
  if (hour >= 5 && hour < 11) return 'breakfast';
  if (hour >= 11 && hour < 15) return 'lunch';
  if (hour >= 17 && hour < 22) return 'dinner';
  return 'snacks';
}
