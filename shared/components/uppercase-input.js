// Normalize the actual input value, including paste, without moving the caret.
export function bindUppercaseInput(input) {
  const normalize = () => {
    const value = input.value;
    const upper = value.toLocaleUpperCase('pt-BR');
    if (value === upper) return;
    const start = input.selectionStart, end = input.selectionEnd;
    input.value = upper;
    if (start !== null && end !== null) {
      input.setSelectionRange(
        value.slice(0, start).toLocaleUpperCase('pt-BR').length,
        value.slice(0, end).toLocaleUpperCase('pt-BR').length,
      );
    }
  };
  input.addEventListener('input', (event) => { if (!event.isComposing) normalize(); });
  input.addEventListener('compositionend', normalize);
  input.setAttribute('autocapitalize', 'characters');
  normalize();
}
