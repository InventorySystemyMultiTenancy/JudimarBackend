// O servidor roda em UTC, mas o "dia" do restaurante e o de Sao Paulo.
// Sem isso, depois das 21h os pedidos lancados antes sumiam do "dia".
export function startOfBusinessDay(now = new Date()) {
  const [year, month, day] = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(now)
    .split("-")
    .map(Number);

  // Meia-noite em Sao Paulo (UTC-3, sem horario de verao desde 2019).
  return new Date(Date.UTC(year, month - 1, day, 3));
}
