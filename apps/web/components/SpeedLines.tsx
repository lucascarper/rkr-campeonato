/**
 * Fundo do site: linhas de velocidade vermelhas na diagonal do "R" da logo.
 * Valores fixos (sem Math.random) para o HTML do servidor e do navegador serem iguais.
 * Cada linha: posição vertical (%), largura (vw), duração (s), atraso (s), opacidade, destaque.
 */
const LINES: [
  top: number,
  width: number,
  duration: number,
  delay: number,
  opacity: number,
  bold?: boolean,
][] = [
  [5, 30, 8, -2, 0.5],
  [11, 46, 12, -9, 0.75, true],
  [17, 20, 6, -4, 0.4],
  [23, 36, 10, -1, 0.6],
  [29, 24, 14, -12, 0.45],
  [35, 52, 9, -6, 0.8, true],
  [41, 26, 7, -3, 0.45],
  [47, 40, 13, -10, 0.6],
  [53, 22, 8, -7, 0.4],
  [59, 48, 11, -2, 0.75, true],
  [65, 32, 15, -13, 0.5],
  [71, 26, 9, -5, 0.45],
  [77, 44, 12, -8, 0.65, true],
  [83, 20, 7, -1, 0.4],
  [89, 36, 10, -11, 0.55],
  [95, 28, 13, -4, 0.45],
];

export function SpeedLines() {
  return (
    <div className="speed-field" aria-hidden>
      <div className="speed-field__track">
        {LINES.map(([top, width, duration, delay, opacity, bold], i) => (
          <span
            key={i}
            className={bold ? "speed-line speed-line--bold" : "speed-line"}
            style={
              {
                top: `${top}%`,
                width: `${width}vw`,
                "--d": `${duration}s`,
                "--delay": `${delay}s`,
                "--o": opacity,
                "--rest": `${(i * 37) % 120}vw`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>
    </div>
  );
}
