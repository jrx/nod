export type ScheduleFrequency = 'daily' | 'weekdays' | 'weekends' | 'weekly' | 'monthly' | 'custom';
export const scheduleWeekDays = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export function readSchedule(cron: string) {
  const match = /^(\d{1,2})\s+(\d{1,2})\s+(\*|\d{1,2})\s+\*\s+(\*|1-5|0,6|6,0|6-7|[0-7])$/.exec(
    cron.trim(),
  );
  if (!match || Number(match[1]) > 59 || Number(match[2]) > 23)
    return { frequency: 'custom' as ScheduleFrequency, time: '09:00', day: '1' };
  const [, minute, hour, date, weekday] = match;
  const frequency: ScheduleFrequency =
    date !== '*'
      ? weekday === '*' && Number(date) >= 1 && Number(date) <= 31
        ? 'monthly'
        : 'custom'
      : weekday === '*'
        ? 'daily'
        : weekday === '1-5'
          ? 'weekdays'
          : ['0,6', '6,0', '6-7'].includes(weekday)
            ? 'weekends'
            : 'weekly';
  return {
    frequency,
    time: `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`,
    day:
      frequency === 'monthly'
        ? String(Number(date))
        : frequency === 'weekly'
          ? String(Number(weekday) % 7)
          : '1',
  };
}

export function scheduleLabel(
  cron: string,
  formatClock: (value: string) => string = (value) => value,
) {
  const value = readSchedule(cron);
  if (value.frequency !== 'custom') {
    const frequency =
      value.frequency === 'daily'
        ? 'Every day'
        : value.frequency === 'weekdays'
          ? 'Every weekday'
          : value.frequency === 'weekends'
            ? 'Every Saturday and Sunday'
            : value.frequency === 'monthly'
              ? `Day ${value.day} of ${Number(value.day) > 28 ? 'each month that has that day' : 'every month'}`
              : `Every ${scheduleWeekDays[Number(value.day)]}`;
    return `${frequency} at ${formatClock(value.time)}`;
  }
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 5) return 'Custom timing';
  const [minute, hour, day, month, weekday] = fields;
  if (day === '*' && month === '*' && weekday === '*') {
    if (hour === '*') {
      const interval = minute === '*' ? 1 : Number(/^\*\/(\d{1,2})$/.exec(minute)?.[1]);
      if (interval > 0 && interval < 60 && 60 % interval === 0)
        return interval === 1 ? 'Every minute' : `Every ${interval} minutes`;
      if (/^\d{1,2}$/.test(minute) && Number(minute) < 60)
        return Number(minute) === 0 ? 'Every hour' : `Every hour at :${minute.padStart(2, '0')}`;
    }
    const interval = Number(/^\*\/(\d{1,2})$/.exec(hour)?.[1]);
    if (minute === '0' && interval > 0 && interval < 24 && 24 % interval === 0)
      return interval === 1 ? 'Every hour' : `Every ${interval} hours`;
  }
  return 'Custom timing';
}
