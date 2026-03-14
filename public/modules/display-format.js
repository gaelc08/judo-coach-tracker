export function numberDisplay(value, digits = 0) {
  return Number(value || 0).toFixed(digits).replace('.', ',');
}

export function currencyDisplay(value) {
  return `${numberDisplay(value, 2)} €`;
}
