import { formatClockTime, formatDateTime, type DateFormat } from './date-format';
import {
  scheduleLabel as sharedScheduleLabel,
  type ScheduleFrequency,
} from '../../shared/schedule-timing';

export {
  readSchedule,
  scheduleWeekDays,
  type ScheduleFrequency,
} from '../../shared/schedule-timing';

export function scheduleExpression(
  frequency: ScheduleFrequency,
  time: string,
  day: string,
  original?: string,
) {
  if (frequency === 'custom') {
    if (original) return original;
    throw new Error('Choose how often this schedule repeats.');
  }
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59)
    throw new Error('Choose a valid time.');
  if (frequency === 'weekly' && !/^[0-6]$/.test(day)) throw new Error('Choose a day of the week.');
  if (frequency === 'monthly' && !/^([1-9]|[12]\d|3[01])$/.test(day))
    throw new Error('Choose a day of the month.');
  const weekday =
    frequency === 'weekly'
      ? day
      : frequency === 'weekdays'
        ? '1-5'
        : frequency === 'weekends'
          ? '0,6'
          : '*';
  return `${Number(match[2])} ${Number(match[1])} ${frequency === 'monthly' ? day : '*'} * ${weekday}`;
}

export function scheduleLabel(cron: string, format?: DateFormat) {
  return sharedScheduleLabel(cron, (time) => formatClockTime(time, format));
}

export function scheduleLocalTime(value: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)!.value;
  return {
    date: `${part('year')}-${part('month')}-${part('day')}`,
    time: `${part('hour')}:${part('minute')}`,
  };
}

export function scheduleRunAt(date: string, time: string, timeZone: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time))
    throw new Error('Choose a date and time.');
  const wallTime = `${date}T${time}:00.000Z`;
  const reference = Date.parse(wallTime);
  if (!Number.isFinite(reference) || new Date(reference).toISOString() !== wallTime)
    throw new Error('Choose a valid date and time.');
  const offsets = new Set<number>();
  for (const hours of [-36, 0, 36]) {
    const instant = reference + hours * 3_600_000;
    const local = scheduleLocalTime(new Date(instant).toISOString(), timeZone);
    offsets.add(Date.parse(`${local.date}T${local.time}:00.000Z`) - instant);
  }
  const matches = [...offsets]
    .map((offset) => new Date(reference - offset).toISOString())
    .filter((instant) => {
      const local = scheduleLocalTime(instant, timeZone);
      return local.date === date && local.time === time;
    });
  if (matches.length !== 1)
    throw new Error(
      matches.length
        ? 'This time occurs twice because the clocks change. Choose another time.'
        : 'This time does not exist because the clocks change. Choose another time.',
    );
  return matches[0];
}

export function scheduleDate(value: string, timeZone: string, format?: DateFormat) {
  try {
    if (!Number.isFinite(Date.parse(value))) throw new Error();
    return formatDateTime(value, format, { timeZone });
  } catch {
    return 'Time unavailable';
  }
}
