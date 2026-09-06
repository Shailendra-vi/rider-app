export const colors = {
  bg: '#f7f5f2',
  surface: '#ffffff',
  surfaceAlt: '#f1ede6',
  border: '#e8e1d6',
  ink: '#2b2620',
  inkMuted: '#7a7266',
  accent: '#c2703d',
  accentInk: '#ffffff',
  accentSoft: '#f5e3d4',
  success: '#3f7a5a',
  successSoft: '#e3f1e8',
  warning: '#b45309',
  warningSoft: '#fbeed7',
  info: '#6d4ab0',
  infoSoft: '#ede5f8',
  danger: '#b3432b',
  dangerSoft: '#fae4dd',
};

export const radius = { lg: 16, md: 12, sm: 9 };

export const statusColor = (status) => {
  switch (status) {
    case 'CONFIRMED':
      return { fg: colors.info, bg: colors.infoSoft };
    case 'PREPARING':
      return { fg: colors.warning, bg: colors.warningSoft };
    case 'OUT_FOR_DELIVERY':
      return { fg: colors.accent, bg: colors.accentSoft };
    case 'DELIVERED':
      return { fg: colors.success, bg: colors.successSoft };
    case 'CANCELLED':
    case 'FAILED':
      return { fg: colors.danger, bg: colors.dangerSoft };
    default:
      return { fg: colors.inkMuted, bg: colors.surfaceAlt };
  }
};
