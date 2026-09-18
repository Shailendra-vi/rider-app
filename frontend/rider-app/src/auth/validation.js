export function normalizeContact(channel, value) {
  const contact = value.trim();
  if (channel === 'email') {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact))
      throw new Error('Enter a valid email address.');
    return contact.toLowerCase();
  }
  const phone = contact.replace(/[\s()-]/g, '');
  if (!/^\+[1-9]\d{7,14}$/.test(phone))
    throw new Error('Include your country code, for example +91 98765 43210.');
  return phone;
}

export function validatePassword(password, confirmation) {
  if (password.length < 12 || password.length > 128)
    throw new Error('Use a password between 12 and 128 characters.');
  if (password !== confirmation) throw new Error('Your passwords do not match.');
}

export function maskContact(channel, contact) {
  if (channel === 'phone') return `${contact.slice(0, 3)} •••••• ${contact.slice(-4)}`;
  const [name, domain] = contact.split('@');
  return `${name.slice(0, 2)}•••@${domain}`;
}
