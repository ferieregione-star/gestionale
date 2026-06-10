export const STATUS = {
  smart: { label: 'Smart working', short: 'SW' },
  ferie: { label: 'Ferie', short: 'F' },
  malattia: { label: 'Malattia', short: 'M' },
  permesso: { label: 'Permesso', short: 'P' },
  altro: { label: 'Altro', short: 'A' },
};

export const ROLE_LABELS = {
  admin: 'Gestore',
  employee: 'Dipendente',
  sector_manager: 'Referente',
  viewer: 'Dirigente',
};

export function fullName(p) {
  return `${p?.first_name || ''} ${p?.last_name || ''}`.trim();
}

export function roleClass(role) {
  if (role === 'viewer') return 'role-viewer';
  if (role === 'sector_manager') return 'role-referente';
  return '';
}

export function isWeekend(date) {
  const d = new Date(date + 'T00:00:00').getDay();
  return d === 0 || d === 6;
}

export function italianHolidayName(date) {
  const md = date.slice(5);
  const fixed = {
    '01-01': 'Capodanno',
    '01-06': 'Epifania',
    '04-25': 'Liberazione',
    '05-01': 'Festa dei Lavoratori',
    '06-02': 'Festa della Repubblica',
    '07-16': 'San Vitaliano',
    '08-15': 'Ferragosto',
    '11-01': 'Tutti i Santi',
    '12-08': 'Immacolata',
    '12-25': 'Natale',
    '12-26': 'Santo Stefano',
  };
  return fixed[md] || '';
}

export function isBlockedDay(date) {
  return isWeekend(date) || Boolean(italianHolidayName(date));
}
